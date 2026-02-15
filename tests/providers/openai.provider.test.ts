import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../../providers/openai.provider.ts';

vi.mock('@wdio/logger', () => ({ default: () => ({ debug: vi.fn(), info: vi.fn() }) }));

describe('OpenAIProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
    }));
    vi.stubEnv('OPENAI_API_KEY', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('throws without token', () => {
    expect(() => new OpenAIProvider({})).toThrow("OpenAI requires 'token' config or OPENAI_API_KEY env var");
  });

  it('uses OPENAI_API_KEY env var fallback', () => {
    vi.stubEnv('OPENAI_API_KEY', 'env-key');
    expect(() => new OpenAIProvider({})).not.toThrow();
  });

  it('defaults to gpt-4o-mini and api.openai.com', async () => {
    const provider = new OpenAIProvider({ token: 'tk' });
    await provider.send({ system: 'sys', user: 'usr' });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"gpt-4o-mini"'),
      }),
    );
  });

  it('sends Bearer auth header', async () => {
    const provider = new OpenAIProvider({ token: 'my-key' });
    await provider.send({ system: 's', user: 'u' });

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-key');
  });

  it('builds correct body with messages array', async () => {
    const provider = new OpenAIProvider({ token: 'tk' });
    await provider.send({ system: 'be helpful', user: 'click button' });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);

    expect(body.messages).toEqual([
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'click button' },
    ]);
    expect(body.temperature).toBe(0.1);
    expect(body.max_tokens).toBe(2048);
  });

  it('extracts response from choices[0].message.content', async () => {
    const provider = new OpenAIProvider({ token: 'tk' });
    const result = await provider.send({ system: 's', user: 'u' });
    expect(result).toBe('response');
  });

  it('respects custom providerUrl and model', async () => {
    const provider = new OpenAIProvider({ token: 'tk', providerUrl: 'https://custom.api', model: 'gpt-4o' });
    await provider.send({ system: 's', user: 'u' });

    expect(fetch).toHaveBeenCalledWith(
      'https://custom.api/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"gpt-4o"'),
      }),
    );
  });
});
