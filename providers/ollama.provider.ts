import type { AgentServiceConfig, PromptInput } from '../types';
import type { LLMProvider } from './index';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

export class OllamaProvider implements LLMProvider {

  constructor(private config: AgentServiceConfig) {
  }

  async send(prompt: PromptInput): Promise<string> {
    const url = `${this.config.providerUrl}/api/generate`;

    const body = {
      model: this.config.model,
      prompt: `${prompt.system}\n\n${prompt.user}`,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 500,
      },
    };

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
        response: string;
        done: boolean;
      };

      log.debug('[Agent] LLM Response:', JSON.stringify({
        model: data.model,
        response: data.response,
        done: data.done,
      }, null, 2));

      return data.response ?? '';

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
