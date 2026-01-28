import type { AgentServiceConfig, PromptInput } from '../types';
import { OllamaProvider } from './ollama.provider';

export type Providers = 'ollama';

/**
 * LLM Provider Interface
 * Extensible pattern for future providers (OpenAI, Anthropic, etc.)
 */
export interface LLMProvider {
  send(prompt: PromptInput | string): Promise<string>;
}

export const initializeProvider = (config: AgentServiceConfig): LLMProvider => {
  switch (config.provider) {
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
};

