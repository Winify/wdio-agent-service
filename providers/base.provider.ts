import type { AgentServiceConfig, PromptInput } from '../types';
import type { LLMProvider } from './index.ts';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

export abstract class BaseProvider implements LLMProvider {
  protected model: string;
  protected providerUrl: string;
  protected token: string | undefined;
  protected timeout: number;
  protected maxRetries: number;
  protected maxOutputTokens: number;

  protected constructor(config: AgentServiceConfig, defaults: {
    model: string;
    providerUrl: string;
    envTokenKey?: string;
  }) {
    this.model = config.model ?? defaults.model;
    this.providerUrl = config.providerUrl ?? defaults.providerUrl;
    this.token = config.token ?? (defaults.envTokenKey ? process.env[defaults.envTokenKey] : undefined);
    this.timeout = config.timeout ?? 30000;
    this.maxRetries = config.maxRetries ?? 2;
    this.maxOutputTokens = config.maxOutputTokens ?? 1024;
  }

  abstract getEndpointUrl(): string;
  abstract getHeaders(): Record<string, string>;
  abstract buildRequestBody(prompt: PromptInput): Record<string, unknown>;
  abstract extractResponse(data: unknown): string;

  async send(prompt: PromptInput): Promise<string> {
    const url = this.getEndpointUrl();
    const body = this.buildRequestBody(prompt);
    const data = await this.request(url, body);
    return this.extractResponse(data);
  }

  protected async request(url: string, body: Record<string, unknown>): Promise<unknown> {
    log.debug('[Agent] LLM Request:', JSON.stringify(body, null, 2));

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        log.info(`[Agent] Retrying request (attempt ${attempt + 1}/${this.maxRetries + 1}) after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getHeaders(),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`Request failed: ${response.status} ${response.statusText} - ${errorText}`);

          if (response.status === 429 || response.status >= 500) {
            lastError = error;
            continue;
          }

          throw error;
        }

        const data = await response.json();
        log.debug('[Agent] LLM Response:', JSON.stringify(data, null, 2));
        return data;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Request timed out after ${this.timeout}ms`);
        }

        if (error instanceof TypeError) {
          lastError = error;
          continue;
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError;
  }
}
