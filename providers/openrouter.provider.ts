import type { AgentServiceConfig } from '../types/index.ts';
import { OpenAIProvider } from './openai.provider.ts';

export class OpenRouterProvider extends OpenAIProvider {

  constructor(config: AgentServiceConfig) {
    const token = config.token ?? process.env.OPENROUTER_API_KEY;

    if (!config.model) {
      throw new Error("OpenRouter requires an explicit 'model' in config");
    }

    if (!token) {
      throw new Error("OpenRouter requires 'token' config or OPENROUTER_API_KEY env var");
    }

    super({
      ...config,
      token,
      providerUrl: config.providerUrl ?? 'https://openrouter.ai/api',
    });
  }

  getHeaders(): Record<string, string> {
    return {
      ...super.getHeaders(),
      'HTTP-Referer': 'https://github.com/nicholasgma/wdio-agent-service',
      'X-Title': 'wdio-agent-service',
    };
  }
}
