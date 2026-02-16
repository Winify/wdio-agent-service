import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../../providers/ollama.provider.ts';

vi.mock('@wdio/logger', () => ({ default: () => ({ debug: vi.fn(), info: vi.fn() }) }));

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: { content: 'response text' } }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to qwen2.5-coder:3b and localhost:11434', async () => {
    const provider = new OllamaProvider({});
    await provider.send({ system: 'sys', user: 'usr' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        body: expect.stringContaining('"model":"qwen2.5-coder:3b"'),
      }),
    );
  });

  it('uses /api/chat with messages array', async () => {
    const provider = new OllamaProvider({});
    await provider.send({ system: 'be helpful', user: 'click button' });

    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);

    expect(body.messages).toEqual([
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'click button' },
    ]);
    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBe(2048);
    expect(body.options.temperature).toBe(0.1);
  });

  it('extracts response from data.message.content', async () => {
    const provider = new OllamaProvider({});
    const result = await provider.send({ system: 's', user: 'u' });
    expect(result).toBe('response text');
  });

  it('sends no auth headers', async () => {
    const provider = new OllamaProvider({});
    await provider.send({ system: 's', user: 'u' });

    const call = vi.mocked(fetch).mock.calls[0];
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('respects custom providerUrl and model', async () => {
    const provider = new OllamaProvider({ providerUrl: 'http://gpu-box:11434', model: 'llama3:8b' });
    await provider.send({ system: 's', user: 'u' });

    expect(fetch).toHaveBeenCalledWith(
      'http://gpu-box:11434/api/chat',
      expect.objectContaining({
        body: expect.stringContaining('"model":"llama3:8b"'),
      }),
    );
  });
});
