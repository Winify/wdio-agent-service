import readline from 'node:readline';
import type { Services } from '@wdio/types';
import type { AgentAction, AgentServiceConfig, Platform } from '../types';
import type { LLMProvider } from '../providers';
import 'webdriverio';
import { initializeProvider } from '../providers';
import { getElements } from '../scripts/get-elements';
import { buildPrompt } from '../prompts';
import { parseLlmResponse } from '../commands/parse-llm-response';
import { executeAgentAction } from '../commands/execute-agent-action';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

interface DebugAgentOptions {
  commandTimeout?: number;
  agent: boolean;
}

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
      provider: serviceOptions.provider ?? 'ollama',
      providerUrl: serviceOptions.providerUrl ?? 'http://localhost:11434',
      model: serviceOptions.model ?? 'qwen2.5-coder:7b',
      maxActions: serviceOptions.maxActions ?? 1,
      timeout: serviceOptions.timeout ?? 30000,
      toonFormat: serviceOptions.toonFormat ?? 'yaml-like',
    };
  }

  before(
    _capabilities: WebdriverIO.Capabilities,
    _specs: string[],
    browser: WebdriverIO.Browser,
  ): void {
    this.maxActions = this.resolvedConfig.maxActions!;

    this.provider = initializeProvider(this.resolvedConfig);

    browser.addCommand('agent', async (prompt: string): Promise<AgentAction[]> => this.executeAgent(browser, prompt), {

    });

    browser.overwriteCommand('debug', (origDebug: (timeout?: number) => Promise<void | unknown>, optionsOrTimeout?: number | DebugAgentOptions) => {
      if (typeof optionsOrTimeout === 'object' && optionsOrTimeout.agent) {
        return runAgentRepl(browser, (prompt: string) => this.executeAgent(browser, prompt));
      }
      const timeout = typeof optionsOrTimeout === 'number' ? optionsOrTimeout : undefined;
      return origDebug(timeout);
    });

    log.debug('[Agent] Service initialized with config:', this.resolvedConfig);
  }

  private async executeAgent(_browser: WebdriverIO.Browser, prompt: string): Promise<AgentAction[]> {
    const platform = detectPlatform(_browser);

    log.debug(`[Agent] Processing prompt: "${prompt}" (platform: ${platform})`);

    const elements = await getElements(_browser, { toonFormat: this.resolvedConfig.toonFormat });

    log.debug(`[Agent] Found ${elements.slice(1, elements.indexOf(']'))} visible elements`);

    const llmPrompt = buildPrompt(elements, prompt, this.maxActions, platform);

    const response = await this.provider.send(llmPrompt);

    const actions = parseLlmResponse(response, this.maxActions);

    log.debug(`[Agent] Parsed ${actions.length} action(s)`);

    for (const action of actions) {
      await executeAgentAction(_browser, action);
    }

    return actions;
  }
}

async function runAgentRepl(
  browser: WebdriverIO.Browser,
  executeAgent: (prompt: string) => Promise<AgentAction[]>,
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'agent> ',
  });

  console.log('\n  Agent debug mode \u2014 type natural language commands');
  console.log('  Type .exit to return to test execution\n');
  rl.prompt();

  return new Promise<void>((resolve) => {
    rl.on('line', async (line: string) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }
      if (input === '.exit') {
        rl.close();
        return;
      }

      try {
        const actions = await executeAgent(input);
        for (const a of actions) {
          const val = a.value ? ` = "${a.value}"` : '';
          console.log(`  \u2713 ${a.type} "${a.target}"${val}`);
        }
      } catch (err) {
        console.error(`  Error: ${err instanceof Error ? err.message : String(err)}`);
      }
      rl.prompt();
    });
    rl.on('close', resolve);
  });
}
