import type { Services } from '@wdio/types';
import type { AgentAction, AgentServiceConfig } from '../types';
import type { LLMProvider } from '../providers';
import 'webdriverio';
import { initializeProvider } from '../providers';
import { getElements } from '../scripts/get-elements';
import { userPrompt } from '../prompts';
import { parseLlmResponse } from '../commands/parse-llm-response';
import { executeAgentAction } from '../commands/execute-agent-action';

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
    if (this.debug) {
      console.log(`[Agent] Processing prompt: "${prompt}"`);
    }

    const elements = await getElements(_browser);

    if (this.debug) {
      console.log(`[Agent] Found ${elements.slice(1, elements.indexOf(']'))} visible elements`);
    }

    const llmPrompt = userPrompt(elements, prompt, this.maxActions);

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
