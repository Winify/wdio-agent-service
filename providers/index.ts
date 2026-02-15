import type { AgentServiceConfig, PromptInput } from '../types';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAIProvider } from './openai.provider';
import { OpenRouterProvider } from './openrouter.provider';
import { GeminiProvider } from './gemini.provider';
import { OllamaProvider } from './ollama.provider';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

export type Providers = 'ollama' | 'anthropic' | 'openai' | 'openrouter' | 'gemini';

/**
 * LLM Provider Interface
 * Extend this to add new providers (anthropic, openai, etc.)
 */
export interface LLMProvider {
  send(prompt: PromptInput): Promise<string>;
}

export function initializeProvider(config: AgentServiceConfig): LLMProvider {
  if (config.send) {
    if (config.provider) {
      log.warn(`[Agent] Both 'send' override and 'provider: ${config.provider}' are set. The 'send' override takes priority.`);
    }
    return { send: config.send };
  }

  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'openrouter':
      return new OpenRouterProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    case 'ollama':
    case undefined:
      return new OllamaProvider(config);
    default:
      throw new Error(`Unknown provider "${config.provider}". Supported: ollama, anthropic, openai, openrouter, gemini`);
  }
}