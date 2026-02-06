import type { AgentServiceConfig, ChatMessage, LLMProvider, LLMProviderOptions, PromptInput } from '../types';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

export class AnthropicProvider implements LLMProvider {
  private readonly apiKey: string;

  constructor(private config: AgentServiceConfig) {
    const key = config.token ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('Anthropic API key required. Set config.token or ANTHROPIC_API_KEY env var.');
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
    // Extract system message (Anthropic uses top-level `system` param)
    let systemPrompt: string | undefined;
    const apiMessages: Array<{ role: string; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
        continue;
      }
      apiMessages.push({ role: msg.role, content: msg.content });
    }

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 1024,
      messages: apiMessages,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    log.debug('[Agent] Anthropic Request:', JSON.stringify({ ...body, system: systemPrompt ? '(present)' : undefined }, null, 2));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = (await response.json()) as {
        content: AnthropicContentBlock[];
        model: string;
      };

      const text = data.content
        ?.filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('') ?? '';

      log.debug('[Agent] Anthropic Response:', text.slice(0, 500));

      return text;

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Anthropic request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
