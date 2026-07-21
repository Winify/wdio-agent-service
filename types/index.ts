import AgentService from '../services/agent.service';
import type { SnapshotResult } from '@wdio/elements';

// ── LLM schema types ──────────────────────────────────────────
/**
 * API schema format for the LLM endpoint.
 * - 'openai': OpenAI Chat Completions format (works with Ollama, LM Studio, OpenRouter, etc.)
 * - 'anthropic': Anthropic Messages format
 */
export type ProviderSchema = 'anthropic' | 'openai';

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
export interface HealConfig {
  /** Enable self-healing on element command failures. Default: false */
  enabled: boolean;
  /** Commands to intercept for healing. Default: ['click', 'setValue', 'tap'] */
  commands: ('click' | 'setValue' | 'tap')[];
  /** Max healing attempts per command. Default: 1 */
  maxAttempts: number;
  /** Delay in ms after scroll-into-view to let animations settle. Default: 200 */
  settleDelay?: number;
  /** Max wait in ms for element existence before triggering healing. Default: 1500 */
  waitForHealing?: number;
}

export interface FixingSuggestionsConfig {
  /** Enable fixing suggestions collection. Default: false */
  enabled: boolean;
  /** Commands to intercept for suggestions. Default: ['click', 'setValue', 'tap'] */
  commands: ('click' | 'setValue' | 'tap')[];
}

export interface AgentServiceConfig {
  /** API schema format. 'openai' works with Ollama, LM Studio, OpenRouter, etc. Default: 'openai' */
  schema?: ProviderSchema;

  /** @deprecated Use `schema` instead. Mapped automatically with a warning. */
  provider?: string;

  /** LLM API endpoint base URL. Default: http://localhost:11434 */
  providerUrl?: string;

  /** API token. Falls back to schema-specific env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY) */
  token?: string;

  /** LLM model name. Default: qwen2.5-coder:7b */
  model?: string;

  /** Maximum actions per LLM response. Default: 1 */
  maxActions?: number;

  /** LLM Request timeout in ms. Default: 30000 */
  timeout?: number;

  /** Max retry attempts on retryable errors (5xx, 429, network). Default: 2 */
  maxRetries?: number;

  /** Maximum output tokens per LLM response. Default: 1024 */
  maxOutputTokens?: number;

  /** Only include viewport-visible elements in snapshots. Default: true */
  inViewportOnly?: boolean;

  /** Snapshot format sent to LLM. 'elements' = flat list (lean, better for small models).
   *  'a11y' = accessibility tree (rich, token-heavy). Default: 'elements' */
  snapshotType?: 'a11y' | 'elements';

  /** Max elements in snapshot when snapshotType is 'elements'. Default: no limit */
  maxSnapshotElements?: number;

  /** Self-healing configuration. Default: disabled */
  autoHeal?: HealConfig;

  /** Fixing suggestions configuration. Default: disabled */
  fixingSuggestions?: FixingSuggestionsConfig;

  /** Override the built-in LLM adapter entirely. When set, schema/providerUrl/token/model are ignored. */
  send?: (prompt: PromptInput) => Promise<string>;
}

// ── LLM provider interface ────────────────────────────────────
export interface LLMProviderOptions {
  responseSchema?: Record<string, unknown>;
  temperature?: number;
}

export interface LLMProvider {
  send(prompt: PromptInput, options?: LLMProviderOptions): Promise<string>;
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

// ── Agent execution types ─────────────────────────────────────
export interface ActionResult {
  action: AgentAction;
  success: boolean;
  error?: string;
}

export interface AgentResult {
  /** Flat list of executed actions */
  actions: AgentAction[];
}

// ── Per-call options ─────────────────────────────────────────
export interface AgentCallOptions {
  /** Override maxActions for this call. */
  maxActions?: number;
}

// ── Healing types ─────────────────────────────────────────────
export interface HealingEvent {
  command: string;
  originalSelector: string;
  /** The replacement selector suggested by the LLM. Apply this to fix the test. */
  healedSelector?: string;
  /** Whether the LLM found a fixable replacement. false = needs manual review. */
  fixable: boolean;
  /** Human-readable suggestion for how to fix the failing selector. */
  suggestion?: string;
  error?: string;
  timestamp: number;
}

export interface HealingReport {
  /** Total number of selector failures analysed. */
  totalEvents: number;
  /** Selectors the LLM found replacements for — apply these changes. */
  fixableCount: number;
  /** Selectors that need manual investigation. */
  manualReviewCount: number;
  events: HealingEvent[];
}

// ── Fixing suggestion types ───────────────────────────────────
export interface FixingSuggestion {
  command: string;
  originalSelector: string;
  /** The replacement selector suggested by the LLM based on the page snapshot. */
  suggestedSelector: string;
  /** LLM reasoning for why this selector matches the intended element. */
  reasoning?: string;
  timestamp: number;
}

export interface FixingSuggestionsReport {
  /** Total number of selector failures analysed. */
  totalEvents: number;
  suggestions: FixingSuggestion[];
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
       * @param options - Per-call overrides (maxActions)
       * @returns Result containing executed actions
       */
      agent: (prompt: string, options?: AgentCallOptions) => Promise<AgentResult>;

      /**
       * Get healing report for the current test run.
       * Only populated when autoHeal is enabled.
       */
      getHealingReport?: () => Promise<HealingReport>;

      /**
       * Get fixing suggestions for the current test run.
       * Only populated when fixingSuggestions is enabled.
       */
      getFixingSuggestions?: () => Promise<FixingSuggestionsReport>;

      /**
       * Take a snapshot of the current page/app elements.
       * Returns a text tree with eN virtual IDs and an elements map.
       * @param options.inViewportOnly - only include viewport-visible elements (default true)
       * @param options.snapshotType - 'a11y' (rich tree) or 'elements' (flat list). Default: 'a11y'
       * @param options.maxElements - cap element count in 'elements' mode
       */
      snapshot: (options?: {
        inViewportOnly?: boolean;
        snapshotType?: 'a11y' | 'elements';
        maxElements?: number;
      }) => Promise<SnapshotResult>;
    }
  }
}
