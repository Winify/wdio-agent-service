import type { Services } from '@wdio/types';
import type {
  AgentCallOptions,
  AgentResult,
  AgentServiceConfig,
  ActionResult,
  LLMProvider,
  Platform,
} from '../types';
import 'webdriverio';
import { initializeProvider } from '../providers';
import { getSnapshot } from '../scripts/get-snapshot';
import { buildPrompt } from '../prompts';
import { parseLlmResponse, resolveActionTargets } from '../commands/parse-llm-response';
import { executeAgentAction } from '../commands/execute-agent-action';
import { installInterceptors, installFixingSuggestionsInterceptor } from '../healing/interceptor';
import { healingReport, formatHealingSummary } from '../healing/report';
import { fixingSuggestionsStore, formatFixingSuggestions } from '../healing/fixing-suggestions';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

function detectPlatform(browser: WebdriverIO.Browser): Platform {
  if (browser.isIOS) return 'ios';
  if (browser.isAndroid) return 'android';
  return 'browser';
}

/**
 * WebdriverIO Agent Service
 * Adds browser.agent(prompt) command for LLM-powered browser automation.
 */
export default class AgentService implements Services.ServiceInstance {
  private readonly resolvedConfig: AgentServiceConfig;
  private provider!: LLMProvider;

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
      send: serviceOptions.send,
      autoHeal: serviceOptions.autoHeal,
      fixingSuggestions: serviceOptions.fixingSuggestions,
    };
  }

  before(
    _capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    browser: WebdriverIO.Browser,
  ): void {
    this.provider = initializeProvider(this.resolvedConfig);

    // Install self-healing interceptors if configured
    healingReport.clear();
    if (this.resolvedConfig.autoHeal?.enabled) {
      installInterceptors(browser, this.resolvedConfig.autoHeal, this.provider.send.bind(this.provider), this.resolvedConfig.snapshotType);
    }

    // Install fixing suggestions interceptors if configured
    fixingSuggestionsStore.clear();
    if (this.resolvedConfig.fixingSuggestions?.enabled) {
      installFixingSuggestionsInterceptor(
        browser,
        this.resolvedConfig.fixingSuggestions,
        this.provider.send.bind(this.provider),
        this.resolvedConfig.snapshotType,
      );
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

  // ── Agent execution ──────────────────────────────────────────

  private async executeAgent(
    _browser: WebdriverIO.Browser,
    prompt: string,
    options?: AgentCallOptions,
  ): Promise<AgentResult> {
    const platform = detectPlatform(_browser);
    const maxActions = options?.maxActions ?? this.resolvedConfig.maxActions!;

    log.info(`[Agent] Prompt: "${prompt}" (platform: ${platform})`);

    const snapshot = await getSnapshot(_browser, {
      inViewportOnly: this.resolvedConfig.inViewportOnly,
      snapshotType: this.resolvedConfig.snapshotType,
      maxElements: this.resolvedConfig.maxSnapshotElements,
    });
    log.debug('[Agent] Snapshot taken, building LLM prompt');

    const llmPrompt = buildPrompt(snapshot.text, prompt, maxActions, platform);
    const response = await this.provider.send(llmPrompt);
    const rawActions = parseLlmResponse(response, maxActions);

    // Resolve eN virtual IDs → real selectors
    const actions = resolveActionTargets(rawActions, snapshot.elements);
    log.debug(`[Agent] Parsed ${actions.length} action(s)`);

    const results: ActionResult[] = [];
    for (const action of actions) {
      const result = await executeAgentAction(_browser, action);
      results.push(result);
      if (!result.success) {
        throw new Error(`Action ${result.action.type} "${result.action.target}" failed: ${result.error ?? 'unknown error'}`);
      }
    }

    return { actions };
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
