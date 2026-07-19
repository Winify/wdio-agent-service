import type { Services } from '@wdio/types';
import type {
  AgentCallOptions,
  AgentResult,
  AgentServiceConfig,
  ActionResult,
  ChatMessage,
  LLMProvider,
  Platform,
} from '../types';
import { PROVIDER_DEFAULTS } from '../types';
import 'webdriverio';
import { initializeProvider } from '../providers';
import { getSnapshot } from '../scripts/get-snapshot';
import { buildAgenticPrompt, buildObservationMessage, buildPrompt } from '../prompts';
import { parseAgentStep, parseLlmResponse, resolveActionTargets } from '../commands/parse-llm-response';
import { executeAgentAction } from '../commands/execute-agent-action';
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
    const providerName = serviceOptions.provider ?? 'ollama';
    const defaults = PROVIDER_DEFAULTS[providerName];

    this.resolvedConfig = {
      provider: providerName,
      providerUrl: serviceOptions.providerUrl ?? defaults.url,
      model: serviceOptions.model ?? defaults.model,
      token: serviceOptions.token,
      maxActions: serviceOptions.maxActions ?? 1,
      timeout: serviceOptions.timeout ?? 30000,
      maxRetries: serviceOptions.maxRetries ?? 2,
      maxOutputTokens: serviceOptions.maxOutputTokens ?? 1024,
      maxSteps: serviceOptions.maxSteps ?? 1,
      contextWindow: serviceOptions.contextWindow ?? 3,
      send: serviceOptions.send,
      autoHeal: serviceOptions.autoHeal,
    };
  }

  before(
    _capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    browser: WebdriverIO.Browser,
  ): void {
    this.provider = initializeProvider(this.resolvedConfig);

    // Register the main agent command
    browser.addCommand(
      'agent',
      async (prompt: string, options?: AgentCallOptions): Promise<AgentResult> =>
        this.executeAgent(browser, prompt, options),
    );

    log.debug('[Agent] Service initialized with config:', this.resolvedConfig);
  }

  // ── Agent dispatch ──────────────────────────────────────────

  private async executeAgent(
    _browser: WebdriverIO.Browser,
    prompt: string,
    options?: AgentCallOptions,
  ): Promise<AgentResult> {
    const platform = detectPlatform(_browser);
    const maxSteps = options?.maxSteps ?? this.resolvedConfig.maxSteps!;
    const maxActions = options?.maxActions ?? this.resolvedConfig.maxActions!;

    log.info(`[Agent] Prompt: "${prompt}" (platform: ${platform}, maxSteps: ${maxSteps})`);

    // Single-pass fast path: one LLM call, no loop overhead
    if (maxSteps === 1) {
      return this.executeSinglePass(_browser, prompt, platform, maxActions);
    }

    return this.executeAgenticLoop(_browser, prompt, platform);
  }

  // ── Single-pass mode ────────────────────────────────────────

  /**
   * Single-pass mode: one LLM call, execute actions, return.
   * Same behavior as the original implementation. No loop, no observation.
   */
  private async executeSinglePass(
    _browser: WebdriverIO.Browser,
    prompt: string,
    platform: Platform,
    maxActions: number,
  ): Promise<AgentResult> {
    const snapshot = await getSnapshot(_browser);

    log.debug('[Agent] Single-pass mode');

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
      // In single-pass mode, throw on failure for backward compat
      if (!result.success) {
        throw new Error(`Action ${result.action.type} "${result.action.target}" failed: ${result.error}`);
      }
    }

    return {
      actions,
      steps: [{ step: 1, actions: results, done: true }],
      goalAchieved: true,
      totalSteps: 1,
    };
  }

  // ── Agentic ReAct loop ──────────────────────────────────────

  /**
   * DOM-based agentic loop: observe elements → think → act → repeat.
   * Follows the ReAct (Reasoning + Acting) pattern.
   */
  private async executeAgenticLoop(
    _browser: WebdriverIO.Browser,
    prompt: string,
    platform: Platform,
  ): Promise<AgentResult> {
    const maxSteps = this.resolvedConfig.maxSteps!;
    const contextWindow = this.resolvedConfig.contextWindow!;

    log.info(`[Agent] Agentic loop mode (maxSteps: ${maxSteps})`);

    // Get initial page state
    const initialSnapshot = await getSnapshot(_browser);
    const agenticPrompt = buildAgenticPrompt(initialSnapshot.text, prompt, platform);

    // Build conversation
    const messages: ChatMessage[] = [
      { role: 'system', content: agenticPrompt.system },
      { role: 'user', content: agenticPrompt.user },
    ];

    // Store the initial elements map for eN resolution
    let currentElements = initialSnapshot.elements;

    const allActions: AgentResult['actions'] = [];
    const allSteps: AgentResult['steps'] = [];
    let done = false;
    let step = 0;

    while (!done && step < maxSteps) {
      step++;
      log.info(`[Agent] Step ${step}/${maxSteps} — sending to LLM...`);

      // Get LLM response
      const response = await this.provider.chat(messages);

      let agentStep;
      try {
        agentStep = parseAgentStep(response);
      } catch (parseError) {
        // Model returned unparseable output — feed the error back and let it retry
        log.warn(`[Agent] Step ${step}: parse error — ${(parseError as Error).message}`);
        messages.push({ role: 'assistant', content: response });
        messages.push({
          role: 'user',
          content: `Your response could not be parsed: ${(parseError as Error).message}\n\nPlease respond with ONLY a valid JSON object in the required format:\n{"reasoning": "...", "actions": [...], "done": true/false}`,
        });
        this.trimConversation(messages, contextWindow);
        continue;
      }

      log.info(`[Agent] Step ${step}: ${agentStep.actions.length} action(s), done=${agentStep.done}${agentStep.reasoning ? ` — ${agentStep.reasoning}` : ''}`);

      // Append assistant message to conversation
      messages.push({ role: 'assistant', content: response });

      // Resolve eN virtual IDs → real selectors
      const resolvedActions = resolveActionTargets(agentStep.actions, currentElements);

      // Execute actions
      const stepResults: ActionResult[] = [];
      for (const action of resolvedActions) {
        const result = await executeAgentAction(_browser, action);
        stepResults.push(result);
        allActions.push(action);
        log.info(`[Agent]   ${action.type} "${action.target}"${action.value ? ` = "${action.value}"` : ''} → ${result.success ? 'OK' : `FAIL: ${result.error}`}`);
      }

      allSteps.push({ step, actions: stepResults, done: agentStep.done });

      if (agentStep.done) {
        done = true;
        break;
      }

      // Re-snapshot page elements
      const updatedSnapshot = await getSnapshot(_browser);
      currentElements = updatedSnapshot.elements;

      // Build observation message
      const observation = buildObservationMessage(stepResults, updatedSnapshot.text, step, maxSteps);
      messages.push({ role: 'user', content: observation });

      // Trim conversation to sliding window
      this.trimConversation(messages, contextWindow);
    }

    const goalAchieved = done;
    log.info(`[Agent] Loop finished: ${step} step(s), goalAchieved=${goalAchieved}`);

    return { actions: allActions, steps: allSteps, goalAchieved, totalSteps: step };
  }

  // ── Conversation trimming ────────────────────────────────────

  /**
   * Trim conversation to sliding window: keep system + initial user + last N step-pairs.
   * A step-pair = (assistant response, user observation).
   */
  private trimConversation(messages: ChatMessage[], contextWindow: number): void {
    // Structure: [system, initial_user, ...step_pairs]
    // Each step-pair is 2 messages: assistant + user observation
    const headerCount = 2; // system + initial user
    const pairSize = 2;
    const maxPairs = contextWindow;
    const totalPairMessages = messages.length - headerCount;

    if (totalPairMessages > maxPairs * pairSize) {
      const excessMessages = totalPairMessages - (maxPairs * pairSize);
      messages.splice(headerCount, excessMessages);
    }
  }
}
