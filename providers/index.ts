import type { AgentServiceConfig, LLMProvider } from '../types';
import { resolveLlmConfig } from './send';

/**
 * Initialize an LLM provider from the given configuration.
 * Uses the unified 2-schema adapter (anthropic + openai).
 */
export function initializeProvider(config: AgentServiceConfig): LLMProvider {
  return resolveLlmConfig(config);
}
