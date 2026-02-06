import AgentService from '../services/agent.service';

// ── Provider types ────────────────────────────────────────────
export type Providers = 'ollama' | 'anthropic' | 'openai';

export const PROVIDER_DEFAULTS: Record<Providers, { url?: string; model: string }> = {
  ollama:    { url: 'http://localhost:11434', model: 'qwen2.5-coder:7b' },
  anthropic: { model: 'claude-sonnet-4-20250514' },
  openai:    { model: 'gpt-4o-mini' },
};

// ── Platform ──────────────────────────────────────────────────
export type Platform = 'browser' | 'ios' | 'android';

// ── Action types ──────────────────────────────────────────────
export type BrowserActionType = 'CLICK' | 'NAVIGATE';
export const BROWSER_ACTIONS: BrowserActionType[] = ['CLICK', 'NAVIGATE'];

export type MobileActionType = 'TAP';
export const MOBILE_ACTIONS: MobileActionType[] = ['TAP'];

export type SharedActionType = 'SET_VALUE';
export const SHARED_ACTIONS: SharedActionType[] = ['SET_VALUE'];

export type ActionType = BrowserActionType | MobileActionType | SharedActionType;
export const VALID_ACTIONS: ActionType[] = [...BROWSER_ACTIONS, ...MOBILE_ACTIONS, ...SHARED_ACTIONS];

// ── Config ────────────────────────────────────────────────────
export interface AgentServiceConfig {
  /** LLM Provider. Default: ollama */
  provider?: Providers;

  /** LLM Provider API endpoint. Defaults: ollama=http://localhost:11434 */
  providerUrl?: string;

  /** LLM Provider API token. For anthropic/openai, falls back to ANTHROPIC_API_KEY/OPENAI_API_KEY env vars */
  token?: string;

  /** LLM model name. Defaults: ollama=qwen2.5-coder:7b, anthropic=claude-sonnet-4-20250514, openai=gpt-4o-mini */
  model?: string;

  /** Maximum actions per prompt. Default: 1 */
  maxActions?: number;

  /** LLM Request timeout in ms. Default: 30000 */
  timeout?: number;

  /** TOON encoding format for elements. 'yaml-like' works better with smaller models, 'tabular' is more token-efficient for larger models. Default: 'yaml-like' */
  toonFormat?: 'yaml-like' | 'tabular';

  /** Maximum agentic loop steps. 1 = single-pass (no loop). Default: 1 */
  maxSteps?: number;

  /** Number of recent step-pairs to keep in conversation memory. Default: 3 */
  contextWindow?: number;
}

// ── LLM provider interface ────────────────────────────────────
export interface LLMProviderOptions {
  responseSchema?: Record<string, unknown>;
  temperature?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  send(prompt: PromptInput, options?: LLMProviderOptions): Promise<string>;
  chat(messages: ChatMessage[], options?: LLMProviderOptions): Promise<string>;
}

// ── Agent action types ────────────────────────────────────────
export interface AgentAction {
  type: ActionType;
  target: string;
  value?: string;
}

export interface PromptInput {
  system: string;
  user: string;
}

// ── Agentic loop types ────────────────────────────────────────
export interface ActionResult {
  action: AgentAction;
  success: boolean;
  error?: string;
}

export interface AgentStep {
  actions: AgentAction[];
  done: boolean;
  reasoning?: string;
}

export interface AgentResult {
  /** Flat list of all executed actions (backward compat) */
  actions: AgentAction[];
  /** Detailed step history */
  steps: Array<{ step: number; actions: ActionResult[]; done: boolean }>;
  /** Whether the agent decided the goal was achieved */
  goalAchieved: boolean;
  /** Total number of loop steps executed */
  totalSteps: number;
}

// ── Per-call options ─────────────────────────────────────────
export interface AgentCallOptions {
  /** Override maxSteps for this call. 1 = single-pass (fast). */
  maxSteps?: number;
  /** Override maxActions for this call. */
  maxActions?: number;
}

// ── Exports ───────────────────────────────────────────────────
export default AgentService;
export const launcher = AgentService;

declare global {
  namespace WebdriverIO {
    interface Browser {
      /**
       * Execute natural language browser automation using LLM
       * @param prompt - Natural language instruction (e.g., "accept all cookies")
       * @param options - Per-call overrides (maxSteps, maxActions)
       * @returns Result containing executed actions and step history
       */
      agent: (prompt: string, options?: AgentCallOptions) => Promise<AgentResult>;
    }
  }
}
