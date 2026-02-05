import type { AgentServiceConfig, PromptInput } from '../types';
import { OllamaProvider } from './ollama.provider';

export type Providers = 'ollama';

/**
 * LLM Provider Interface
 * Extend this to add new providers (anthropic, openai, etc.)
 */
export interface LLMProvider {
  send(prompt: PromptInput): Promise<string>;
}

export function initializeProvider(config: AgentServiceConfig): LLMProvider {
  // Add new providers here as needed
  return new OllamaProvider(config);
}