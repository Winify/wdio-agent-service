import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveLlmConfig } from '../../providers/send.ts';
import type { AgentServiceConfig } from '../../types/index.js';

const { mockWarn, mockInfo, mockDebug } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockInfo: vi.fn(),
  mockDebug: vi.fn(),
}));
vi.mock('@wdio/logger', () => ({ default: () => ({ warn: mockWarn, info: mockInfo, debug: mockDebug }) }));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('resolveLlmConfig', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockWarn.mockReset();
    mockInfo.mockReset();
  });

  // ── Validation ──────────────────────────────────────────────

  describe('validation', () => {
    it('throws when providerUrl is missing', () => {
      expect(() => resolveLlmConfig({ schema: 'openai', model: 'gpt' }))
        .toThrow('`providerUrl` is required');
    });

    it('throws when model is missing', () => {
      expect(() => resolveLlmConfig({ schema: 'openai', providerUrl: 'http://localhost:11434' }))
        .toThrow('`model` is required');
    });

    it('request override bypasses validation', async () => {
      const mockSend = vi.fn().mockResolvedValue('ok');
      // No providerUrl or model — should not throw because request is set
      const provider = resolveLlmConfig({ request: mockSend });
      const result = await provider.request({ system: 's', user: 'u' });
      expect(result).toBe('ok');
    });
  });

  // ── request override ──────────────────────────────────────────

  describe('request override', () => {
    it('uses custom request function', async () => {
      const mockSend = vi.fn().mockResolvedValue('custom response');
      const provider = resolveLlmConfig({ request: mockSend });

      const result = await provider.request({ system: 'sys', user: 'usr' });
      expect(result).toBe('custom response');
      expect(mockSend).toHaveBeenCalledWith({ system: 'sys', user: 'usr' });
    });

    it('warns when both request and schema are set', () => {
      resolveLlmConfig({ request: vi.fn(), schema: 'anthropic', providerUrl: 'http://x', model: 'm' });
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining("'request' override and 'schema: anthropic'"),
      );
    });
  });

  // ── deprecated send config ───────────────────────────────────

  describe('deprecated send config', () => {
    it('maps send to request with deprecation warning', async () => {
      const mockFn = vi.fn().mockResolvedValue('compat response');
      const provider = resolveLlmConfig({ send: mockFn } as unknown as AgentServiceConfig);
      const result = await provider.request({ system: 's', user: 'u' });

      expect(result).toBe('compat response');
      expect(mockFn).toHaveBeenCalledWith({ system: 's', user: 'u' });
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining("'send' is deprecated"),
      );
    });

    it('request takes priority when both request and send are set', async () => {
      const requestFn = vi.fn().mockResolvedValue('from request');
      const sendFn = vi.fn().mockResolvedValue('from send');
      const provider = resolveLlmConfig({ request: requestFn, send: sendFn } as unknown as AgentServiceConfig);
      const result = await provider.request({ system: 's', user: 'u' });

      expect(result).toBe('from request');
      expect(requestFn).toHaveBeenCalled();
      expect(sendFn).not.toHaveBeenCalled();
      // No deprecation warning when request is present
      expect(mockWarn).not.toHaveBeenCalledWith(
        expect.stringContaining("'send' is deprecated"),
      );
    });
  });

  // ── Anthropic schema ────────────────────────────────────────

  describe('anthropic schema', () => {
    it('builds correct request body', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        content: [{ text: 'hello from claude' }],
      }));

      const provider = resolveLlmConfig({
        schema: 'anthropic',
        providerUrl: 'https://api.anthropic.com',
        model: 'claude-haiku-4-5-20251001',
      });
      const result = await provider.request({ system: 'be helpful', user: 'click the button' });

      expect(result).toBe('hello from claude');
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.anthropic.com/v1/messages');
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('claude-haiku-4-5-20251001');
      expect(body.system).toBe('be helpful');
      expect(body.messages).toEqual([{ role: 'user', content: 'click the button' }]);
      expect(body.max_tokens).toBe(1024);
    });

    it('respects custom endpoint and model', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({
        schema: 'anthropic',
        providerUrl: 'https://custom.anthropic.example.com',
        model: 'claude-opus-4-8',
      });
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://custom.anthropic.example.com/v1/messages');
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('claude-opus-4-8');
    });

    it('avoids double /v1 when endpoint already has /v1 suffix', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({
        schema: 'anthropic',
        providerUrl: 'https://api.anthropic.com/v1',
        model: 'claude-haiku-4-5-20251001',
      });
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.anthropic.com/v1/messages');
    });
  });

  // ── OpenAI schema ───────────────────────────────────────────

  describe('openai schema', () => {
    it('builds correct request body', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'gpt response' } }],
      }));

      const provider = resolveLlmConfig({
        schema: 'openai',
        providerUrl: 'https://api.openai.com',
        model: 'gpt-4o-mini',
      });
      const result = await provider.request({ system: 'be helpful', user: 'click button' });

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

    it('routes LM Studio URL correctly', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'ok' } }],
      }));

      const provider = resolveLlmConfig({
        schema: 'openai',
        providerUrl: 'http://localhost:1234/v1',
        model: 'qwen/qwen3.5-4b',
      });
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://localhost:1234/v1/chat/completions');
    });
  });

  // ── Ollama schema ───────────────────────────────────────────

  describe('ollama schema', () => {
    it('builds correct request body for ollama native API', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        message: { content: 'ollama response' },
      }));

      const provider = resolveLlmConfig({
        schema: 'ollama',
        providerUrl: 'http://localhost:11434',
        model: 'qwen2.5-coder:7b',
      });
      const result = await provider.request({ system: 'be helpful', user: 'run test' });

      expect(result).toBe('ollama response');
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://localhost:11434/api/chat');
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('qwen2.5-coder:7b');
      expect(body.stream).toBe(false);
      expect(body.options.num_predict).toBe(1024);
      expect(body.options.temperature).toBe(0.1);
    });

    it('routes to /api/chat even on non-standard port', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        message: { content: 'ok' } },
      ));

      const provider = resolveLlmConfig({
        schema: 'ollama',
        providerUrl: 'http://custom-host:9999',
        model: 'qwen2.5-coder:7b',
      });
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://custom-host:9999/api/chat');
    });

    it('handles /api/chat already in endpoint', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        message: { content: 'ok' } },
      ));

      const provider = resolveLlmConfig({
        schema: 'ollama',
        providerUrl: 'http://localhost:11434/api/chat',
        model: 'qwen2.5-coder:7b',
      });
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://localhost:11434/api/chat');
    });

    it('passes format for structured output', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        message: { content: 'ok' } },
      ));

      const schema = { type: 'object' };
      const provider = resolveLlmConfig({
        schema: 'ollama',
        providerUrl: 'http://localhost:11434',
        model: 'qwen2.5-coder:7b',
      });
      await provider.request({ system: 's', user: 'u' }, { responseSchema: schema });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.format).toEqual(schema);
    });
  });

  // ── Deprecated provider compat ──────────────────────────────

  describe('deprecated provider config', () => {
    it('maps provider: "anthropic" to schema: "anthropic"', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({
        provider: 'anthropic',
        providerUrl: 'https://api.anthropic.com',
        model: 'claude-haiku-4-5-20251001',
      } as unknown as AgentServiceConfig);
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.anthropic.com/v1/messages');
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining("'provider' is deprecated"));
    });

    it('maps provider: "openai" to schema: "openai"', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'ok' } }],
      }));

      const provider = resolveLlmConfig({
        provider: 'openai',
        providerUrl: 'https://api.openai.com',
        model: 'gpt-4o-mini',
      } as unknown as AgentServiceConfig);
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('maps provider: "ollama" to schema: "ollama"', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        message: { content: 'ok' } },
      ));

      const provider = resolveLlmConfig({
        provider: 'ollama',
        providerUrl: 'http://localhost:11434',
        model: 'qwen2.5-coder:7b',
      } as unknown as AgentServiceConfig);
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('http://localhost:11434/api/chat');
    });

    it('schema takes priority over deprecated provider', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, { content: [{ text: 'ok' }] }));

      const provider = resolveLlmConfig({
        schema: 'anthropic',
        provider: 'openai',
        providerUrl: 'https://api.anthropic.com',
        model: 'claude-haiku-4-5-20251001',
      } as unknown as AgentServiceConfig);
      await provider.request({ system: 's', user: 'u' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('https://api.anthropic.com/v1/messages');
    });
  });

  // ── HTTP behavior ───────────────────────────────────────────

  describe('HTTP retry behavior', () => {
    const CFG = { schema: 'openai' as const, providerUrl: 'https://api.openai.com', model: 'gpt-4o-mini' };

    it('retries on 429', async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(429, {}))
        .mockResolvedValueOnce(createResponse(200, { choices: [{ message: { content: 'success after retry' } }] }));

      const provider = resolveLlmConfig(CFG);
      const result = await provider.request({ system: 's', user: 'u' });

      expect(result).toBe('success after retry');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 5xx', async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(500, {}))
        .mockResolvedValueOnce(createResponse(502, {}))
        .mockResolvedValueOnce(createResponse(200, { choices: [{ message: { content: 'ok' } }] }));

      const provider = resolveLlmConfig(CFG);
      const result = await provider.request({ system: 's', user: 'u' });

      expect(result).toBe('ok');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('throws after maxRetries exhausted', async () => {
      mockFetch.mockResolvedValue(createResponse(500, {}));

      const provider = resolveLlmConfig({ ...CFG, maxRetries: 1 });
      await expect(provider.request({ system: 's', user: 'u' })).rejects.toThrow('LLM request failed');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on 4xx (non-429) without retry', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(401, {}));

      const provider = resolveLlmConfig(CFG);
      await expect(provider.request({ system: 's', user: 'u' })).rejects.toThrow('LLM request failed');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on network errors (TypeError)', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(createResponse(200, { choices: [{ message: { content: 'recovered' } }] }));

      const provider = resolveLlmConfig(CFG);
      const result = await provider.request({ system: 's', user: 'u' });

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

      const provider = resolveLlmConfig({
        schema: 'openai',
        providerUrl: 'https://api.openai.com',
        model: 'gpt-4o-mini',
      });
      await provider.request({ system: 's', user: 'u' }, { temperature: 0.7 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.7);
    });

    it('passes responseSchema for openai', async () => {
      mockFetch.mockResolvedValueOnce(createResponse(200, {
        choices: [{ message: { content: 'ok' } }],
      }));

      const schema = { type: 'object', properties: {} };
      const provider = resolveLlmConfig({
        schema: 'openai',
        providerUrl: 'https://api.openai.com',
        model: 'gpt-4o-mini',
      });
      await provider.request({ system: 's', user: 'u' }, { responseSchema: schema });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.response_format).toEqual({
        type: 'json_schema',
        json_schema: schema,
      });
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
