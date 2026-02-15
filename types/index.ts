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
  /** LLM Provider ('ollama' | 'anthropic' | 'openai' | 'openrouter' | 'gemini'). Default: ollama */
  provider?: Providers;

  /** LLM Provider API endpoint. Default depends on provider */
  providerUrl?: string;

  /** LLM Provider API token. Falls back to provider-specific env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY) */
  token?: string;

  /** LLM model name. Default depends on provider (ollama=qwen2.5-coder:3b, anthropic=claude-haiku-4-5-20251001, openai=gpt-4o-mini, gemini=gemini-2.0-flash) */
  model?: string;

  /** Maximum actions per prompt. Default: 1 */
  maxActions?: number;

  /** LLM Request timeout in ms. Default: 30000 */
  timeout?: number;

  /** Max retry attempts on retryable errors (5xx, 429, network). Default: 2 */
  maxRetries?: number;

  /** Maximum output tokens per prompt. Default: 1024 */
  maxOutputTokens?: number;

  /** TOON encoding format for elements. 'yaml-like' works better with smaller models, 'tabular' is more token-efficient for larger models. Default: 'yaml-like' */
  toonFormat?: 'yaml-like' | 'tabular';

  /** Override the built-in provider entirely. When set, provider/providerUrl/token/model are ignored. */
  send?: (prompt: PromptInput) => Promise<string>;
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