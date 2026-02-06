import type { AgentServiceConfig, ChatMessage, LLMProvider, LLMProviderOptions, PromptInput } from '../types';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;

  constructor(private config: AgentServiceConfig) {
    const key = config.token ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key required. Set config.token or OPENAI_API_KEY env var.');
    }
    this.apiKey = key;
  }

  async send(prompt: PromptInput, options?: LLMProviderOptions): Promise<string> {
    return this.chat([
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ], options);
  }

  async chat(messages: ChatMessage[], options?: LLMProviderOptions): Promise<string> {
    const apiMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: apiMessages,
      max_tokens: 1024,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options?.responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'agent_response',
          schema: options.responseSchema,
        },
      };
    }

    log.debug('[Agent] OpenAI Request:', JSON.stringify({ ...body, messages: `(${apiMessages.length} messages)` }, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        model: string;
      };

      const text = data.choices?.[0]?.message?.content ?? '';

      log.debug('[Agent] OpenAI Response:', text.slice(0, 500));

      return text;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
