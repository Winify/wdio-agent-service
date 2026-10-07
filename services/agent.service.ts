import type { Services } from '@wdio/types';
import type {
  AgentAction,
  AgentCallOptions,
  AgentResult,
  AgentServiceConfig,
  LLMProvider,
  Platform,
} from '../types';
import 'webdriverio';
import { initializeProvider } from '../providers';
import { getSnapshot, type SnapshotElements } from '../scripts/get-snapshot';
import { buildPrompt } from '../prompts';
import { parseLlmResponse, resolveActionTargets } from '../commands/parse-llm-response';
import { executeAgentAction } from '../commands/execute-agent-action';
import type { HealEngine } from '../healing/interceptor';
import { installInterceptors, installFixingSuggestionsInterceptor, installCombinedInterceptors } from '../healing/interceptor';
import type { JevConfig } from '../healing/jev';
import {
  DEFAULT_GOAL_NOUL_THRESHOLD,
  decideAgentActionWithJev,
  healSelectorWithJev,
  suggestFixWithJev,
} from '../healing/jev';
import { healingReport, formatHealingSummary } from '../healing/report';
import { fixingSuggestionsStore, formatFixingSuggestions } from '../healing/fixing-suggestions';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

const GOAL_SETTLE_DELAY_MS = 500;
const DEFAULT_MAX_STEPS = 5;
const SCROLL_DELTA_PX = 600;

function detectPlatform(browser: WebdriverIO.Browser): Platform {
  if (browser.isIOS) return 'ios';
  if (browser.isAndroid) return 'android';
  return 'browser';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * WebdriverIO Agent Service
 * Adds browser.agent(prompt) command for LLM-powered browser automation.
 */
export default class AgentService implements Services.ServiceInstance {
  private readonly resolvedConfig: AgentServiceConfig;
  private provider!: LLMProvider;
  private jevConfig?: JevConfig;

  constructor(serviceOptions: AgentServiceConfig = {}) {
    this.resolvedConfig = {
      schema: serviceOptions.schema,
      providerUrl: serviceOptions.providerUrl,
      model: serviceOptions.model,
      maxActions: serviceOptions.maxActions ?? 1,
      timeout: serviceOptions.timeout ?? 30000,
      maxRetries: serviceOptions.maxRetries ?? 2,
      maxOutputTokens: serviceOptions.maxOutputTokens ?? 1024,
      inViewportOnly: serviceOptions.inViewportOnly ?? true,
      snapshotType: serviceOptions.snapshotType ?? 'elements',
      maxSnapshotElements: serviceOptions.maxSnapshotElements,
      request: serviceOptions.request,
      send: serviceOptions.send,
      autoHeal: serviceOptions.autoHeal,
      fixingSuggestions: serviceOptions.fixingSuggestions,
      typesafe: serviceOptions.typesafe,
    };
  }

  before(
    _capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    browser: WebdriverIO.Browser,
  ): void {
    this.provider = initializeProvider(this.resolvedConfig);

    // Install interceptors
    healingReport.clear();
    fixingSuggestionsStore.clear();

    const healConfig = this.resolvedConfig.autoHeal;
    const fixConfig = this.resolvedConfig.fixingSuggestions;

    const engine = this.createHealEngine();
    if (engine && !healConfig?.enabled && !fixConfig?.enabled && !this.resolvedConfig.typesafe?.agent) {
      log.warn('[Agent] typesafe.enabled has no effect: enable autoHeal, fixingSuggestions, or typesafe.agent.');
    }

    if (healConfig?.enabled && fixConfig?.enabled) {
      installCombinedInterceptors(
        browser, healConfig, fixConfig,
        this.provider.request.bind(this.provider),
        this.resolvedConfig.snapshotType,
        engine,
      );
    } else {
      if (healConfig?.enabled) {
        installInterceptors(browser, healConfig, this.provider.request.bind(this.provider), this.resolvedConfig.snapshotType, engine);
      }
      if (fixConfig?.enabled) {
        installFixingSuggestionsInterceptor(browser, fixConfig, this.provider.request.bind(this.provider), this.resolvedConfig.snapshotType, engine);
      }
    }

    // Register the main agent command
    browser.addCommand(
      'agent',
      async (prompt: string, options?: AgentCallOptions): Promise<AgentResult> =>
        this.executeAgent(browser, prompt, options),
    );

    // Register snapshot helper for debugging
    browser.addCommand(
      'snapshot',
      async (options?: { inViewportOnly?: boolean; snapshotType?: 'a11y' | 'elements'; maxElements?: number }) =>
        getSnapshot(browser, {
          inViewportOnly: options?.inViewportOnly ?? true,
          snapshotType: options?.snapshotType,
          maxElements: options?.maxElements,
        }),
    );

    // Register healing report accessor
    browser.addCommand('getHealingReport', async () => healingReport.getReport());

    // Register fixing suggestions accessor
    browser.addCommand('getFixingSuggestions', async () => fixingSuggestionsStore.getReport());

    log.debug('[Agent] Service initialized with config:', this.resolvedConfig);
  }

  // ── Jev engine ───────────────────────────────────────────────

  private createHealEngine(): HealEngine | undefined {
    const typesafe = this.resolvedConfig.typesafe;
    if (!typesafe?.enabled) return undefined;

    const apiKey = typesafe.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('[Agent] typesafe.enabled requires an API key — set typesafe.apiKey or OPENROUTER_API_KEY.');
    }

    const jevConfig: JevConfig = {
      apiKey,
      model: typesafe.model,
      minConfidence: typesafe.minConfidence,
      goalNoulThreshold: typesafe.goalNoulThreshold,
      timeoutMs: typesafe.timeoutMs,
      maxRetries: typesafe.maxRetries,
    };
    this.jevConfig = jevConfig;

    const snapshot = {
      snapshotType: this.resolvedConfig.snapshotType,
      maxElements: this.resolvedConfig.maxSnapshotElements,
    };

    return {
      heal: (b, selector, action) => healSelectorWithJev(b, selector, action, jevConfig, snapshot),
      suggestFix: (b, selector, action) => suggestFixWithJev(b, selector, action, jevConfig, snapshot),
    };
  }

  // ── Agent execution ──────────────────────────────────────────

  private async executeAgent(
    _browser: WebdriverIO.Browser,
    prompt: string,
    options?: AgentCallOptions,
  ): Promise<AgentResult> {
    const platform = detectPlatform(_browser);
    const maxActions = options?.maxActions ?? this.resolvedConfig.maxActions!;

    log.info(`[Agent] Prompt: "${prompt}" (platform: ${platform})`);

    const snapshot = await this.takeSnapshot(_browser);

    const typesafeAgent = this.resolvedConfig.typesafe?.agent;
    const jevConfig = this.jevConfig;
    const a11yUncapped = this.resolvedConfig.snapshotType === 'a11y' && !this.resolvedConfig.maxSnapshotElements;

    if (typesafeAgent && jevConfig && a11yUncapped) {
      log.warn('[Agent] a11y snapshots require maxSnapshotElements for the Jev path — using the LLM instead');
    }

    if (typesafeAgent && jevConfig && !a11yUncapped) {
      const result = await this.runJevLoop(_browser, prompt, platform, snapshot, jevConfig, maxActions);
      if (result) return result;

      log.warn('[Agent] Jev deferred this intent to the LLM path');
    }

    log.debug('[Agent] Snapshot taken, building LLM prompt');

    const actions = await this.runLlmPath(_browser, prompt, snapshot, maxActions, platform);

    return { actions, ...(typesafeAgent ? { engine: 'llm' as const } : {}) };
  }

  /**
   * One Jev decision per iteration, action executed, then re-decide against fresh state.
   * The goal noul rides the same call: a passing read exits the loop before the action runs.
   * Returns null when Jev declines the very first decision — the caller then owns the LLM path.
   */
  private async runJevLoop(
    _browser: WebdriverIO.Browser,
    prompt: string,
    platform: Platform,
    initialSnapshot: { text: string; elements: SnapshotElements },
    jevConfig: JevConfig,
    maxActions: number,
  ): Promise<AgentResult | null> {
    const actions: AgentAction[] = [];
    const maxSteps = this.resolvedConfig.typesafe?.maxSteps ?? DEFAULT_MAX_STEPS;
    const threshold = jevConfig.goalNoulThreshold ?? DEFAULT_GOAL_NOUL_THRESHOLD;
    let snapshot = initialSnapshot;
    let goalVerified: boolean | undefined;

    for (let step = 0; step < maxSteps; step++) {
      const executed = actions.map((action) => `${action.type} ${action.target}`);
      const decision = await decideAgentActionWithJev(_browser, prompt, platform, snapshot, jevConfig, executed);

      if (decision.engine === 'llm') {
        if (step === 0) return null;
        log.warn('[Agent] Jev deferred mid-loop — running the LLM on the current snapshot');
        actions.push(...await this.runLlmPath(_browser, prompt, snapshot, maxActions, platform));
        snapshot = await this.takeSnapshot(_browser);
        continue;
      }

      goalVerified = decision.goalMetNoul === null ? undefined : decision.goalMetNoul >= threshold;
      log.info(`[Agent] Jev step ${step + 1}/${maxSteps}: ${decision.action}, goalMet noul ${decision.goalMetNoul}`);

      if (goalVerified || decision.action === 'DONE') break;

      if (decision.action === 'WAIT') {
        await sleep(GOAL_SETTLE_DELAY_MS);
      } else if (decision.action === 'SCROLL') {
        await _browser.scroll(0, SCROLL_DELTA_PX);
      } else if (decision.action === 'CLICK' || decision.action === 'TAP') {
        const action: AgentAction = { type: decision.action, target: decision.targetId };
        actions.push(...await this.executeActions(_browser, resolveActionTargets([action], snapshot.elements)));
      }

      snapshot = await this.takeSnapshot(_browser);
    }

    if (this.resolvedConfig.typesafe?.strictGoalGate && !goalVerified) {
      throw new Error(`[Agent] Goal not verified after ${actions.length} action(s): ${prompt}`);
    }

    return { actions, engine: 'jev', goalVerified };
  }

  private async runLlmPath(
    _browser: WebdriverIO.Browser,
    prompt: string,
    snapshot: { text: string; elements: SnapshotElements },
    maxActions: number,
    platform: Platform,
  ): Promise<AgentAction[]> {
    const llmPrompt = buildPrompt(snapshot.text, prompt, maxActions, platform);
    const response = await this.provider.request(llmPrompt);
    const rawActions = parseLlmResponse(response, maxActions);

    // Resolve eN virtual IDs → real selectors
    const actions = resolveActionTargets(rawActions, snapshot.elements);
    log.debug(`[Agent] Parsed ${actions.length} action(s)`);
    await this.executeActions(_browser, actions);
    return actions;
  }

  private takeSnapshot(_browser: WebdriverIO.Browser) {
    return getSnapshot(_browser, {
      inViewportOnly: this.resolvedConfig.inViewportOnly,
      snapshotType: this.resolvedConfig.snapshotType,
      maxElements: this.resolvedConfig.maxSnapshotElements,
    });
  }

  private async executeActions(
    _browser: WebdriverIO.Browser,
    actions: AgentAction[],
  ): Promise<AgentAction[]> {
    for (const action of actions) {
      const result = await executeAgentAction(_browser, action);
      if (!result.success) {
        throw new Error(`Action ${result.action.type} "${result.action.target}" failed: ${result.error ?? 'unknown error'}`);
      }
    }
    return actions;
  }

  // ── after() hook ─────────────────────────────────────────────

  after(
    _result: number,
    _capabilities: WebdriverIO.Capabilities,
    _specs: string[],
  ): void {
    // Emit healing summary
    if (this.resolvedConfig.autoHeal?.enabled) {
      try {
        const report = healingReport.getReport();
        if (report.totalEvents > 0) {
          log.error(formatHealingSummary(report));
        }
      } catch (err) {
        log.error('[Healing] Failed to generate healing report:', (err as Error).message);
      } finally {
        healingReport.clear();
      }
    }

    // Emit fixing suggestions summary
    if (this.resolvedConfig.fixingSuggestions?.enabled) {
      try {
        const report = fixingSuggestionsStore.getReport();
        if (report.totalEvents > 0) {
          log.error(formatFixingSuggestions(report));
        }
      } catch (err) {
        log.error('[FixingSuggestions] Failed to generate report:', (err as Error).message);
      } finally {
        fixingSuggestionsStore.clear();
      }
    }
  }
}
