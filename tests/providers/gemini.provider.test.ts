import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from '../../providers/gemini.provider.ts';

vi.mock('@wdio/logger', () => ({ default: () => ({ debug: vi.fn(), info: vi.fn() }) }));

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'response' }] } }],
      }),
    }));
    vi.stubEnv('GEMINI_API_KEY', '');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('throws without token', () => {
    expect(() => new GeminiProvider({})).toThrow("Gemini requires 'token' config or GEMINI_API_KEY env var");
  });

  it('uses GEMINI_API_KEY env var fallback', () => {
    vi.stubEnv('GEMINI_API_KEY', 'env-key');
    expect(() => new GeminiProvider({})).not.toThrow();
  });

  it('builds endpoint with model and key in URL', async () => {
    const provider = new GeminiProvider({ token: 'my-key' });
    await provider.send({ system: 's', user: 'u' });

    expect(fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=my-key',
      expect.anything(),
    );
  });

  it('sends no auth headers (key is in URL)', async () => {
    const provider = new GeminiProvider({ token: 'tk' });
    await provider.send({ system: 's', user: 'u' });

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('builds correct body with systemInstruction and contents', async () => {
    const provider = new GeminiProvider({ token: 'tk' });
    await provider.send({ system: 'be helpful', user: 'click button' });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);

    expect(body.systemInstruction).toEqual({ parts: [{ text: 'be helpful' }] });
    expect(body.contents).toEqual([{ parts: [{ text: 'click button' }] }]);
    expect(body.generationConfig.temperature).toBe(0.1);
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
  });

  it('extracts response from candidates[0].content.parts[0].text', async () => {
    const provider = new GeminiProvider({ token: 'tk' });
    const result = await provider.send({ system: 's', user: 'u' });
    expect(result).toBe('response');
  });

  it('respects custom model', async () => {
    const provider = new GeminiProvider({ token: 'tk', model: 'gemini-1.5-pro' });
    await provider.send({ system: 's', user: 'u' });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('models/gemini-1.5-pro:generateContent'),
      expect.anything(),
    );
  });
});
