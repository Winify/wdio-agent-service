import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveLlmConfig } from '../../providers/send.ts';

const { mockWarn, mockInfo, mockDebug } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockInfo: vi.fn(),
  mockDebug: vi.fn(),
}));
vi.mock('@wdio/logger', () => ({ default: () => ({ warn: mockWarn, info: mockInfo, debug: mockDebug }) }));

// Provide a stub for global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('resolveLlmConfig', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockWarn.mockReset();
    mockInfo.mockReset();
  });

  // ── send override ──────────────────────────────────────────

  describe('send override', () => {
    it('uses custom send function for send()', async () => {
      const mockSend = vi.fn().mockResolvedValue('custom response');
      const provider = resolveLlmConfig({ send: mockSend });

      const result = await provider.send({ system: 'sys', user: 'usr' });
      expect(result).toBe('custom response');
      expect(mockSend).toHaveBeenCalledWith({ system: 'sys', user: 'usr' });
    });

    it('uses custom send function for chat()', async () => {
      const mockSend = vi.fn().mockResolvedValue('chat custom');
      const provider = resolveLlmConfig({ send: mockSend });

      const result = await provider.chat([
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hello' },
      ]);
      expect(result).toBe('chat custom');
      expect(mockSend).toHaveBeenCalledWith({
        system: 'be helpful',
        user: '[user] hello',
      });
    });

    it('warns when both send and provider are set', () => {
      resolveLlmConfig({ send: vi.fn(), schema: 'anthropic' });
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining("'send' override and 'schema: anthropic'"),
      );
    });
  });

  // ── Anthropic schema ────────────────────────────────────────

  describe('anthropic schema', () => {
    it('builds correct request body', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        content: [{ text: 'hello from claude' }],
      }));

      const provider = resolveLlmConfig({ schema: 'anthropic', token: 'sk-ant-test' });
      const result = await provider.send({ system: 'be helpful', user: 'click the button' });

      expect(result).toBe('hello from claude');
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.anthropic.com/v1/messages');
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('claude-sonnet-4-20250514');
      expect(body.system).toBe('be helpful');
      expect(body.messages).toEqual([{ role: 'user', content: 'click the button' }]);
      expect(body.max_tokens).toBe(1024);
    });

    it('sets correct headers', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({ schema: 'anthropic', token: 'my-key' });
      await provider.send({ system: 's', user: 'u' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBe('my-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('falls back to ANTHROPIC_API_KEY env var', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'env-key');
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({ schema: 'anthropic' });
      await provider.send({ system: 's', user: 'u' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBe('env-key');
      vi.unstubAllEnvs();
    });

    it('falls back to ANTHROPIC_AUTH_TOKEN env var', async () => {
      vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'auth-token');
      delete process.env.ANTHROPIC_API_KEY;
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({ schema: 'anthropic' });
      await provider.send({ system: 's', user: 'u' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBe('auth-token');
      vi.unstubAllEnvs();
    });

    it('respects custom endpoint and model', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({
        schema: 'anthropic',
        token: 'tk',
        providerUrl: 'https://custom.anthropic.example.com',
        model: 'claude-opus-4-8',
      });
      await provider.send({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://custom.anthropic.example.com/v1/messages');
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('claude-opus-4-8');
    });

    it('handles multi-turn chat() correctly', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'second response' }] }));

      const provider = resolveLlmConfig({ schema: 'anthropic', token: 'tk' });
      const result = await provider.chat([
        { role: 'system', content: 'you are an agent' },
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'first response' },
        { role: 'user', content: 'second message' },
      ]);

      expect(result).toBe('second response');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toBe('you are an agent');
      expect(body.messages).toEqual([
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'first response' },
        { role: 'user', content: 'second message' },
      ]);
    });
  });

  // ── OpenAI schema ───────────────────────────────────────────

  describe('openai schema', () => {
    it('builds correct request body', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'gpt response' } }],
      }));

      const provider = resolveLlmConfig({ schema: 'openai', providerUrl: 'https://api.openai.com', token: 'sk-openai', model: 'gpt-4o-mini' });
      const result = await provider.send({ system: 'be helpful', user: 'click button' });

      expect(result).toBe('gpt response');
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages).toEqual([
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'click button' },
      ]);
      expect(body.max_tokens).toBe(1024);
      expect(body.temperature).toBe(0.1);
    });

    it('sets Bearer auth header', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'ok' } }],
      }));

      const provider = resolveLlmConfig({ schema: 'openai', providerUrl: 'https://api.openai.com', token: 'sk-key' });
      await provider.send({ system: 's', user: 'u' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer sk-key');
    });

    it('falls back to OPENAI_API_KEY env var', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'env-openai-key');
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'ok' } }],
      }));

      const provider = resolveLlmConfig({ schema: 'openai', providerUrl: 'https://api.openai.com' });
      await provider.send({ system: 's', user: 'u' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer env-openai-key');
      vi.unstubAllEnvs();
    });
  });

  // ── Ollama (openai schema) ──────────────────────────────────

  describe('ollama via openai schema', () => {
    it('builds openai schema request body with localhost', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        message: { content: 'localhost response' },
      }));

      const provider = resolveLlmConfig({ schema: 'openai' });
      const result = await provider.send({ system: 'be helpful', user: 'run test' });

      expect(result).toBe('localhost response');
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://localhost:11434/api/chat');
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('qwen2.5-coder:7b');
      expect(body.stream).toBe(false);
      expect(body.options.num_predict).toBe(1024);
      expect(body.options.temperature).toBe(0.1);
    });

    it('sends no auth headers', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { message: { content: 'ok' } }));

      const provider = resolveLlmConfig({ schema: 'openai' });
      await provider.send({ system: 's', user: 'u' });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('defaults to openai when no provider specified', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { message: { content: 'ok' } }));

      const provider = resolveLlmConfig({ schema: 'openai' });
      await provider.send({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://localhost:11434/api/chat');
    });
  });

  // ── HTTP behavior ───────────────────────────────────────────

  describe('HTTP retry behavior', () => {
    it('retries on 429', async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(429, {}))
        .mockResolvedValueOnce(createResponse(200, { content: [{ text: 'success after retry' }] }));

      const provider = resolveLlmConfig({ schema: 'anthropic', token: 'tk' });
      const result = await provider.send({ system: 's', user: 'u' });

      expect(result).toBe('success after retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 5xx', async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(500, {}))
        .mockResolvedValueOnce(createResponse(502, {}))
        .mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({ schema: 'anthropic', token: 'tk' });
      const result = await provider.send({ system: 's', user: 'u' });

      expect(result).toBe('ok');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('throws after maxRetries exhausted', async () => {
      mockFetch.mockResolvedValue(createResponse(500, {}));

      const provider = resolveLlmConfig({ schema: 'anthropic', token: 'tk', maxRetries: 1 });
      await expect(provider.send({ system: 's', user: 'u' })).rejects.toThrow('LLM request failed');
      // 1 initial + 1 retry = 2 calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on 4xx (non-429) without retry', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(401, {}));

      const provider = resolveLlmConfig({ schema: 'anthropic', token: 'tk' });
      await expect(provider.send({ system: 's', user: 'u' })).rejects.toThrow('LLM request failed');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on network errors (TypeError)', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(createResponse(200, { content: [{ text: 'recovered' }] }));

      const provider = resolveLlmConfig({ schema: 'anthropic', token: 'tk' });
      const result = await provider.send({ system: 's', user: 'u' });

      expect(result).toBe('recovered');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── LLMProviderOptions ──────────────────────────────────────

  describe('LLMProviderOptions', () => {
    it('passes temperature override', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'ok' } }],
      }));

      const provider = resolveLlmConfig({ schema: 'openai', providerUrl: 'https://api.openai.com', token: 'tk' });
      await provider.send({ system: 's', user: 'u' }, { temperature: 0.7 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.7);
    });

    it('passes responseSchema for openai', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'ok' } }],
      }));

      const schema = { type: 'object', properties: {} };
      const provider = resolveLlmConfig({ schema: 'openai', providerUrl: 'https://api.openai.com', token: 'tk' });
      await provider.send({ system: 's', user: 'u' }, { responseSchema: schema });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.response_format).toEqual({
        type: 'json_schema',
        json_schema: schema,
      });
    });

    it('passes format for localhost format structured output', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { message: { content: 'ok' } }));

      const schema = { type: 'object' };
      const provider = resolveLlmConfig({ schema: 'openai' });
      await provider.send({ system: 's', user: 'u' }, { responseSchema: schema });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.format).toEqual(schema);
    });
  });
});

// ── Helpers ───────────────────────────────────────────────────

function createResponse(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}
