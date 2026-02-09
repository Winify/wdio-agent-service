import type { Providers } from '../providers';
import AgentService from '../services/agent.service';

export type Platform = 'browser' | 'ios' | 'android';

// Browser actions
export type BrowserActionType = 'CLICK' | 'SET_VALUE' | 'NAVIGATE';
export const BROWSER_ACTIONS: BrowserActionType[] = ['CLICK', 'SET_VALUE', 'NAVIGATE'];

// Mobile actions
export type MobileActionType = 'TAP' | 'SET_VALUE';
export const MOBILE_ACTIONS: MobileActionType[] = ['TAP', 'SET_VALUE'];

// Combined
export type ActionType = BrowserActionType | MobileActionType;
export const VALID_ACTIONS: ActionType[] = [...BROWSER_ACTIONS, ...MOBILE_ACTIONS];

export interface AgentServiceConfig {
  /** LLM Provider. Default: ollama */
  provider?: Providers;

  /** LLM Provider API endpoint. Defaults: ollama=http://localhost:11434 */
  providerUrl?: string;

  /** LLM Provider API token. For anthropic/openai, falls back to ANTHROPIC_API_KEY/OPENAI_API_KEY env vars */
  token?: string;

  /** LLM model name. Defaults: ollama=qwen2.5-coder:7b */
  model?: string;

  /** Maximum actions per prompt. Default: 1 */
  maxActions?: number;

  /** LLM Request timeout in ms. Default: 30000 */
  timeout?: number;

  /** Max retry attempts on retryable errors (5xx, 429, network). Default: 2 */
  maxRetries?: number;

  /** Enable debug logging. Default: false */
  debug?: boolean;

  /** TOON encoding format for elements. 'yaml-like' works better with smaller models, 'tabular' is more token-efficient for larger models. Default: 'yaml-like' */
  toonFormat?: 'yaml-like' | 'tabular';
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

      /**
       * Extended by wdio-agent-service: pass { agent: true } to enter
       * a natural language REPL instead of the default JS REPL.
       */
      debug: (optionsOrTimeout?: number | { commandTimeout?: number; agent?: boolean }) => Promise<void | unknown>;
    }
  }
}