import type { AgentServiceConfig, ChatMessage, LLMProvider, LLMProviderOptions, PromptInput } from '../types';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

export class OllamaProvider implements LLMProvider {

  constructor(private config: AgentServiceConfig) {
  }

  async send(prompt: PromptInput, options?: LLMProviderOptions): Promise<string> {
    return this.chat([
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ], options);
  }

  async chat(messages: ChatMessage[], options?: LLMProviderOptions): Promise<string> {
    const url = `${this.config.providerUrl}/api/chat`;

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.1,
        num_predict: 2048,
      },
    };

    if (options?.responseSchema) {
      body.format = options.responseSchema;
    }

    log.debug('[Agent] LLM Request:', JSON.stringify(body, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as {
        model: string;
        message: { role: string; content: string };
        done: boolean;
      };

      log.debug('[Agent] LLM Response:', JSON.stringify({
        model: data.model,
        message: data.message?.content,
        done: data.done,
      }, null, 2));

      return data.message?.content ?? '';

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
