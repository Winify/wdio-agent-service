import type { AgentServiceConfig, ChatMessage, LLMProvider, LLMProviderOptions, PromptInput } from '../types';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

type Schema = 'anthropic' | 'openai';

interface ResolvedConfig {
  schema: Schema;
  endpoint: string;
  model: string;
  apiKey?: string;
  timeout: number;
  maxRetries: number;
  maxOutputTokens: number;
  isOllama: boolean;
}

/**
 * Resolve LLM configuration and return a provider with send() and chat().
 * Supports anthropic and openai API schemas. Any endpoint that speaks
 * OpenAI Chat Completions (Ollama, LM Studio, OpenRouter, etc.) uses schema: 'openai'.
 */
export function resolveLlmConfig(config: AgentServiceConfig): LLMProvider {
  // Complete override — user's send function takes priority
  if (config.send) {
    if (config.schema) {
      log.warn(`[Agent] Both 'send' override and 'schema: ${config.schema}' are set. The 'send' override takes priority.`);
    }
    const sendFn = config.send;
    return {
      send: (prompt, _opts?) => sendFn(prompt),
      chat: async (messages, _opts?) => {
        const systemMsg = messages.find(m => m.role === 'system');
        const userContent = messages
          .filter(m => m.role !== 'system')
          .map(m => `[${m.role}] ${m.content}`)
          .join('\n');
        return sendFn({ system: systemMsg?.content ?? '', user: userContent });
      },
    };
  }

  const schema: Schema = config.schema ?? 'openai';

  // Sensible defaults per schema
  const endpoint = config.providerUrl
    ?? (schema === 'anthropic' ? 'https://api.anthropic.com' : 'http://localhost:11434');
  const model = config.model
    ?? (schema === 'anthropic' ? 'claude-sonnet-4-20250514' : 'qwen2.5-coder:7b');

  const apiKey = config.token
    ?? (schema === 'anthropic'
      ? (process.env['ANTHROPIC_API_KEY'] || process.env['ANTHROPIC_AUTH_TOKEN'])
      : process.env['OPENAI_API_KEY']);

  const resolved: ResolvedConfig = {
    schema,
    endpoint,
    model,
    apiKey,
    timeout: config.timeout ?? 30000,
    maxRetries: config.maxRetries ?? 2,
    maxOutputTokens: config.maxOutputTokens ?? 1024,
    // The default endpoint is Ollama. A custom endpoint is OpenAI-compatible
    // unless the caller explicitly supplies Ollama's /api/chat path.
    isOllama: schema === 'openai' && isOllamaEndpoint(endpoint),
  };

  log.debug(`[Agent] Schema: ${resolved.schema}, model: ${resolved.model}, endpoint: ${resolved.endpoint}`);

  return {
    send: (prompt, opts?) => sendRequest(resolved, prompt, opts),
    chat: (messages, opts?) => chatRequest(resolved, messages, opts),
  };
}

// ── send() — wraps PromptInput into ChatMessage[] and calls chat ──

async function sendRequest(
  cfg: ResolvedConfig,
  prompt: PromptInput,
  opts?: LLMProviderOptions,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  return chatRequest(cfg, messages, opts);
}

// ── chat() — multi-turn conversation ──────────────────────────

async function chatRequest(
  cfg: ResolvedConfig,
  messages: ChatMessage[],
  opts?: LLMProviderOptions,
): Promise<string> {
  const url = buildUrl(cfg);
  const headers = buildHeaders(cfg);
  const body = buildRequestBody(cfg, messages, opts);
  const data = await request(url, headers, body, cfg.timeout, cfg.maxRetries);
  return extractResponse(cfg, data);
}

// ── URL construction ──────────────────────────────────────────

function buildUrl(cfg: ResolvedConfig): string {
  const endpoint = cfg.endpoint.replace(/\/+$/, '');
  if (cfg.schema === 'anthropic') {
    return endpoint.endsWith('/v1/messages') ? endpoint : `${endpoint}/v1/messages`;
  }
  // Ollama's native endpoint differs from OpenAI Chat Completions. Do not use
  // hostnames to infer it: LM Studio and other OpenAI-compatible servers are
  // commonly hosted on localhost as well.
  if (cfg.isOllama) {
    return endpoint.endsWith('/api/chat') ? endpoint : `${endpoint}/api/chat`;
  }
  if (endpoint.endsWith('/v1/chat/completions')) return endpoint;
  return endpoint.endsWith('/v1') ? `${endpoint}/chat/completions` : `${endpoint}/v1/chat/completions`;
}

// ── Headers ───────────────────────────────────────────────────

function buildHeaders(cfg: ResolvedConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (cfg.schema === 'anthropic') {
    headers['x-api-key'] = cfg.apiKey ?? '';
    headers['anthropic-version'] = '2023-06-01';
  } else if (cfg.apiKey) {
    headers['Authorization'] = `Bearer ${cfg.apiKey}`;
  }

  return headers;
}

// ── Request body ──────────────────────────────────────────────

function buildRequestBody(
  cfg: ResolvedConfig,
  messages: ChatMessage[],
  opts?: LLMProviderOptions,
): Record<string, unknown> {
  if (cfg.schema === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role,
      content: m.content,
    }));
    return {
      model: cfg.model,
      max_tokens: cfg.maxOutputTokens,
      system: systemMsg?.content ?? '',
      messages: nonSystem,
    };
  }

  // openai schema (also ollama)
  const openaiMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  if (cfg.isOllama) {
    return {
      model: cfg.model,
      messages: openaiMessages,
      stream: false,
      options: {
        temperature: opts?.temperature ?? 0.1,
        num_predict: cfg.maxOutputTokens,
      },
      ...(opts?.responseSchema ? { format: opts.responseSchema } : {}),
    };
  }

  return {
    model: cfg.model,
    messages: openaiMessages,
    temperature: opts?.temperature ?? 0.1,
    max_tokens: cfg.maxOutputTokens,
    ...(opts?.responseSchema ? { response_format: { type: 'json_schema', json_schema: opts.responseSchema } } : {}),
  };
}

function isOllamaEndpoint(endpoint: string): boolean {
  const normalized = endpoint.replace(/\/+$/, '');
  return normalized === 'http://localhost:11434'
    || normalized === 'http://127.0.0.1:11434'
    || normalized.endsWith('/api/chat');
}

// ── Response extraction ───────────────────────────────────────

function extractResponse(cfg: ResolvedConfig, data: unknown): string {
  if (cfg.schema === 'anthropic') {
    const d = data as { content?: Array<{ text?: string }> };
    return d.content?.[0]?.text ?? '';
  }
  // openai format
  const d = data as { choices?: Array<{ message?: { content?: string } }> };
  if (d.choices?.[0]?.message?.content) {
    return d.choices[0].message.content;
  }
  // ollama fallback
  const o = data as { message?: { content?: string } };
  return o.message?.content ?? '';
}

// ── HTTP request with retry ───────────────────────────────────

async function request(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeout: number,
  maxRetries: number,
): Promise<unknown> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt - 1) * 1000;
      log.info(`Retrying LLM request (attempt ${attempt + 1}/${maxRetries + 1}) after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      log.debug('LLM Request:', JSON.stringify({ url, ...body }, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`LLM request failed: ${response.status} ${response.statusText} - ${errorText}`);

        // Retry on rate limit or server errors
        if (response.status === 429 || response.status >= 500) {
          lastError = error;
          continue;
        }

        throw error;
      }

      const data = await response.json();
      log.debug('LLM Response:', JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`LLM request timed out after ${timeout}ms`);
      }

      // Network errors (fetch fails with TypeError) → retry
      if (error instanceof TypeError) {
        lastError = error;
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error('LLM request failed after all retries');
}
