import type { AgentServiceConfig, PromptInput } from '../types';
import { BaseProvider } from './base.provider.ts';

export class OpenAIProvider extends BaseProvider {

  constructor(config: AgentServiceConfig) {
    super(config, {
      model: 'gpt-4o-mini',
      providerUrl: 'https://api.openai.com',
      envTokenKey: 'OPENAI_API_KEY',
    });

    if (!this.token) {
      throw new Error("OpenAI requires 'token' config or OPENAI_API_KEY env var");
    }
  }

  getEndpointUrl(): string {
    return `${this.providerUrl}/v1/chat/completions`;
  }

  getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
    };
  }

  buildRequestBody(prompt: PromptInput): Record<string, unknown> {
    return {
      model: this.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.1,
      max_tokens: this.maxOutputTokens,
    };
  }

  extractResponse(data: unknown): string {
    const d = data as { choices: Array<{ message: { content: string } }> };
    return d.choices?.[0]?.message?.content ?? '';
  }
}
