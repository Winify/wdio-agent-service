import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../../providers/anthropic.provider.ts';

vi.mock('@wdio/logger', () => ({ default: () => ({ debug: vi.fn(), info: vi.fn() }) }));

describe('AnthropicProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: 'response' }] }),
    }));
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('throws without token', () => {
    expect(() => new AnthropicProvider({})).toThrow("Anthropic requires 'token' config or ANTHROPIC_API_KEY env var");
  });

  it('uses ANTHROPIC_API_KEY env var fallback', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-key');
    expect(() => new AnthropicProvider({})).not.toThrow();
  });

  it('defaults to claude-haiku-4-5-20251001 and api.anthropic.com', async () => {
    const provider = new AnthropicProvider({ token: 'tk' });
    await provider.send({ system: 'sys', user: 'usr' });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        body: expect.stringContaining('"model":"claude-haiku-4-5-20251001"'),
      }),
    );
  });

  it('sends x-api-key and anthropic-version headers', async () => {
    const provider = new AnthropicProvider({ token: 'my-key' });
    await provider.send({ system: 's', user: 'u' });

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('my-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('builds correct body with system as top-level field', async () => {
    const provider = new AnthropicProvider({ token: 'tk' });
    await provider.send({ system: 'be helpful', user: 'click button' });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);

    expect(body.system).toBe('be helpful');
    expect(body.messages).toEqual([{ role: 'user', content: 'click button' }]);
    expect(body.max_tokens).toBe(2048);
  });

  it('extracts response from data.content[0].text', async () => {
    const provider = new AnthropicProvider({ token: 'tk' });
    const result = await provider.send({ system: 's', user: 'u' });
    expect(result).toBe('response');
  });

  it('respects custom providerUrl and model', async () => {
    const provider = new AnthropicProvider({ token: 'tk', providerUrl: 'https://custom.api', model: 'claude-sonnet-4-5-20250929' });
    await provider.send({ system: 's', user: 'u' });

    expect(fetch).toHaveBeenCalledWith(
      'https://custom.api/v1/messages',
      expect.objectContaining({
        body: expect.stringContaining('"model":"claude-sonnet-4-5-20250929"'),
      }),
    );
  });
});
