import type { Services } from '@wdio/types';
import type { AgentAction, AgentServiceConfig, Platform } from '../types';
import type { LLMProvider } from '../providers';
import 'webdriverio';
import { initializeProvider } from '../providers';
import { getElements } from '../scripts/get-elements';
import { buildPrompt } from '../prompts';
import { parseLlmResponse } from '../commands/parse-llm-response';
import { executeAgentAction } from '../commands/execute-agent-action';

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
  private debug!: boolean;

  constructor(serviceOptions: AgentServiceConfig = {}) {
    this.resolvedConfig = {
      provider: serviceOptions.provider ?? 'ollama',
      providerUrl: serviceOptions.providerUrl ?? 'http://localhost:11434',
      model: serviceOptions.model ?? 'qwen2.5-coder:7b',
      maxActions: serviceOptions.maxActions ?? 1,
      timeout: serviceOptions.timeout ?? 30000,
      debug: serviceOptions.debug ?? false,
      toonFormat: serviceOptions.toonFormat ?? 'yaml-like',
    };
  }

  before(
    _capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    browser: WebdriverIO.Browser,
  ): void {
    this.debug = this.resolvedConfig.debug!;
    this.maxActions = this.resolvedConfig.maxActions!;

    this.provider = initializeProvider(this.resolvedConfig);

    browser.addCommand('agent', async (prompt: string): Promise<AgentAction[]> => this.executeAgent(browser, prompt), {

    });

    if (this.resolvedConfig.debug) {
      console.log('[Agent] Service initialized with config:', this.resolvedConfig);
    }
  }

  private async executeAgent(_browser: WebdriverIO.Browser, prompt: string): Promise<AgentAction[]> {
    const platform = detectPlatform(_browser);

    if (this.debug) {
      console.log(`[Agent] Processing prompt: "${prompt}" (platform: ${platform})`);
    }

    const elements = await getElements(_browser, { toonFormat: this.resolvedConfig.toonFormat });

    if (this.debug) {
      console.log(`[Agent] Found ${elements.slice(1, elements.indexOf(']'))} visible elements`);
    }

    const llmPrompt = buildPrompt(elements, prompt, this.maxActions, platform);

    const response = await this.provider.send(llmPrompt);

    const actions = parseLlmResponse(response, this.maxActions);

    if (this.debug) {
      console.log(`[Agent] Parsed ${actions.length} action(s)`);
    }

    for (const action of actions) {
      await executeAgentAction(_browser, this.debug, action);
    }

    return actions;
  }
}
