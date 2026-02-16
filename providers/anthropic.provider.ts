import type { AgentServiceConfig, PromptInput } from '../types';
import { BaseProvider } from './base.provider.ts';

export class AnthropicProvider extends BaseProvider {

  constructor(config: AgentServiceConfig) {
    super(config, {
      model: 'claude-haiku-4-5-20251001',
      providerUrl: 'https://api.anthropic.com',
      envTokenKey: 'ANTHROPIC_API_KEY',
    });

    if (!this.token) {
      throw new Error("Anthropic requires 'token' config or ANTHROPIC_API_KEY env var");
    }
  }

  getEndpointUrl(): string {
    return `${this.providerUrl}/v1/messages`;
  }

  getHeaders(): Record<string, string> {
    return {
      'x-api-key': this.token!,
      'anthropic-version': '2023-06-01',
    };
  }

  buildRequestBody(prompt: PromptInput): Record<string, unknown> {
    return {
      model: this.model,
      max_tokens: this.maxOutputTokens,
      system: prompt.system,
      messages: [
        { role: 'user', content: prompt.user },
      ],
    };
  }

  extractResponse(data: unknown): string {
    const d = data as { content: Array<{ text: string }> };
    return d.content?.[0]?.text ?? '';
  }
}
