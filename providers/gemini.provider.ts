import type { AgentServiceConfig, PromptInput } from '../types';
import { BaseProvider } from './base.provider.ts';

export class GeminiProvider extends BaseProvider {

  constructor(config: AgentServiceConfig) {
    super(config, {
      model: 'gemini-2.0-flash',
      providerUrl: 'https://generativelanguage.googleapis.com',
      envTokenKey: 'GEMINI_API_KEY',
    });

    if (!this.token) {
      throw new Error("Gemini requires 'token' config or GEMINI_API_KEY env var");
    }
  }

  getEndpointUrl(): string {
    return `${this.providerUrl}/v1beta/models/${this.model}:generateContent?key=${this.token}`;
  }

  getHeaders(): Record<string, string> {
    return {};
  }

  buildRequestBody(prompt: PromptInput): Record<string, unknown> {
    return {
      systemInstruction: {
        parts: [{ text: prompt.system }],
      },
      contents: [
        { parts: [{ text: prompt.user }] },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: this.maxOutputTokens,
      },
    };
  }

  extractResponse(data: unknown): string {
    const d = data as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}
