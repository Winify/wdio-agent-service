import type { AgentServiceConfig, PromptInput } from '../types';
import { BaseProvider } from './base.provider.ts';

export class OllamaProvider extends BaseProvider {

  constructor(config: AgentServiceConfig) {
    super(config, {
      model: 'qwen2.5-coder:3b',
      providerUrl: 'http://localhost:11434',
    });
  }

  getEndpointUrl(): string {
    return `${this.providerUrl}/api/chat`;
  }

  getHeaders(): Record<string, string> {
    return {};
  }

  buildRequestBody(prompt: PromptInput): Record<string, unknown> {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: this.maxOutputTokens,
      },
    };
  }

  extractResponse(data: unknown): string {
    const d = data as { message: { content: string } };
    return d.message?.content ?? '';
  }
}
