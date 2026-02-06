import type { AgentServiceConfig, LLMProvider } from '../types';
import { OllamaProvider } from './ollama.provider';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAIProvider } from './openai.provider';

export type { LLMProvider };

export function initializeProvider(config: AgentServiceConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'ollama':
    default:
      return new OllamaProvider(config);
  }
}
