import type { Providers } from '../providers';
import AgentService from '../services/agent.service';

export type ActionType = 'CLICK' | 'SET_VALUE' | 'NAVIGATE';
export const VALID_ACTIONS: ActionType[] = ['CLICK', 'SET_VALUE', 'NAVIGATE'];

export interface AgentServiceConfig {
  /** LLM Provider. Default: ollama */
  provider?: Providers;

  /** LLM Provider API endpoint. Default (ollama): http://localhost:11434 */
  providerUrl?: string;

  /** LLM Provider API token. Default: '' */
  token?: string;

  /** LLM model name. Default: qwen2.5-coder:7b */
  model?: string;

  /** Maximum actions per prompt. Default: 1 */
  maxActions?: number;

  /** LLM Request timeout in ms. Default: 30000 */
  timeout?: number;

  /** Enable debug logging. Default: false */
  debug?: boolean;
}

export interface AgentAction {
  type: ActionType;
  target: string;
  value?: string;
}

export interface PromptInput {
  system: string;
  user: string;
}

export default AgentService;
export const launcher = AgentService;

declare global {
  namespace WebdriverIO {
    interface Browser {
      /**
       * Execute natural language browser automation using LLM
       * @param prompt - Natural language instruction (e.g., "accept all cookies")
       * @returns Result containing executed actions
       */
      agent: (prompt: string) => Promise<AgentAction[]>;
    }
  }
}