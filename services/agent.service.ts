import type { Services } from '@wdio/types';
import type { AgentResult, AgentServiceConfig, LLMProvider, Platform } from '../types';
import 'webdriverio';
import { initializeProvider } from '../providers';
import { getSnapshot } from '../scripts/get-snapshot';
import { buildPrompt } from '../prompts';
import { parseLlmResponse } from '../commands/parse-llm-response';
import { executeAgentAction } from '../commands/execute-agent-action';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

function detectPlatform(browser: WebdriverIO.Browser): Platform {
  if (browser.isIOS) {
    return 'ios';
  }
  if (browser.isAndroid) {
    return 'android';
  }
  return 'browser';
}

/**
 * WebdriverIO Agent Service
 * Adds browser.agent(prompt) command for LLM-powered automation
 */
export default class AgentService implements Services.ServiceInstance {
  private readonly resolvedConfig: AgentServiceConfig;
  private provider!: LLMProvider;

  private maxActions!: number;

  constructor(serviceOptions: AgentServiceConfig = {}) {
    this.resolvedConfig = {
      ...serviceOptions,
      maxActions: serviceOptions.maxActions ?? 1,
      timeout: serviceOptions.timeout ?? 30000,
      maxSteps: serviceOptions.maxSteps ?? 1,
      contextWindow: serviceOptions.contextWindow ?? 3,
    };
  }

  before(
    _capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    browser: WebdriverIO.Browser,
  ): void {
    this.maxActions = this.resolvedConfig.maxActions!;

    this.provider = initializeProvider(this.resolvedConfig);

    browser.addCommand('agent', async (prompt: string): Promise<AgentResult> => this.executeAgent(browser, prompt));

    log.debug('[Agent] Service initialized with config:', this.resolvedConfig);
  }

  private async executeAgent(_browser: WebdriverIO.Browser, prompt: string): Promise<AgentResult> {
    const platform = detectPlatform(_browser);

    log.debug(`[Agent] Processing prompt: "${prompt}" (platform: ${platform})`);

    const snapshot = await getSnapshot(_browser);

    const llmPrompt = buildPrompt(snapshot.text, prompt, this.maxActions, platform);

    const response = await this.provider.send(llmPrompt);

    const actions = parseLlmResponse(response, this.maxActions);

    log.debug(`[Agent] Parsed ${actions.length} action(s)`);

    for (const action of actions) {
      await executeAgentAction(_browser, action);
    }

    return {
      actions,
      steps: [{ step: 1, actions: actions.map(a => ({ action: a, success: true })), done: true }],
      goalAchieved: true,
      totalSteps: 1,
    };
  }
}
