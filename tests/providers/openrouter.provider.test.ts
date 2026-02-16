import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from '../../providers/openrouter.provider.ts';

vi.mock('@wdio/logger', () => ({ default: () => ({ debug: vi.fn(), info: vi.fn() }) }));

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
    }));
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('throws without model', () => {
    expect(() => new OpenRouterProvider({ token: 'tk' })).toThrow(
      "OpenRouter requires an explicit 'model' in config",
    );
  });

  it('throws without token', () => {
    expect(() => new OpenRouterProvider({ model: 'anthropic/claude-3.5-haiku' })).toThrow(
      "OpenRouter requires 'token' config or OPENROUTER_API_KEY env var",
    );
  });

  it('uses OPENROUTER_API_KEY env var fallback', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'env-key');
    expect(() => new OpenRouterProvider({ model: 'x/y' })).not.toThrow();
  });

  it('uses openrouter.ai endpoint', async () => {
    const provider = new OpenRouterProvider({ token: 'tk', model: 'anthropic/claude-3.5-haiku' });
    await provider.send({ system: 's', user: 'u' });

    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.anything(),
    );
  });

  it('sends HTTP-Referer and X-Title headers alongside Bearer auth', async () => {
    const provider = new OpenRouterProvider({ token: 'tk', model: 'x/y' });
    await provider.send({ system: 's', user: 'u' });

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tk');
    expect(headers['HTTP-Referer']).toBeDefined();
    expect(headers['X-Title']).toBe('wdio-agent-service');
  });

  it('inherits OpenAI body/response format', async () => {
    const provider = new OpenRouterProvider({ token: 'tk', model: 'x/y' });
    const result = await provider.send({ system: 'sys', user: 'usr' });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);
    expect(body.messages).toBeDefined();
    expect(body.model).toBe('x/y');
    expect(result).toBe('response');
  });

  it('respects custom providerUrl', async () => {
    const provider = new OpenRouterProvider({ token: 'tk', model: 'x/y', providerUrl: 'https://custom.openrouter' });
    await provider.send({ system: 's', user: 'u' });

    expect(fetch).toHaveBeenCalledWith(
      'https://custom.openrouter/v1/chat/completions',
      expect.anything(),
    );
  });
});
