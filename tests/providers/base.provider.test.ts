import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseProvider } from '../../providers/base.provider.ts';
import type { AgentServiceConfig, PromptInput } from '../../types/index.ts';

vi.mock('@wdio/logger', () => ({ default: () => ({ debug: vi.fn(), info: vi.fn() }) }));

class TestProvider extends BaseProvider {
  constructor(config: Partial<AgentServiceConfig> = {}) {
    super(config as AgentServiceConfig, {
      model: 'test-model',
      providerUrl: 'https://test.api',
    });
  }

  getEndpointUrl(): string {
    return `${this.providerUrl}/v1/complete`;
  }

  getHeaders(): Record<string, string> {
    return { 'X-Test': 'true' };
  }

  buildRequestBody(prompt: PromptInput): Record<string, unknown> {
    return { prompt: prompt.user, system: prompt.system };
  }

  extractResponse(data: unknown): string {
    return (data as { text: string }).text;
  }
}

describe('BaseProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('send() wires abstract methods together', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'hello' }),
    }));

    const provider = new TestProvider();
    const result = await provider.send({ system: 'sys', user: 'usr' });

    expect(result).toBe('hello');
    expect(fetch).toHaveBeenCalledWith(
      'https://test.api/v1/complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'usr', system: 'sys' }),
      }),
    );
    // Verify custom headers are merged
    const callHeaders = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(callHeaders['X-Test']).toBe('true');
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  it('times out with AbortController', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (init.signal?.aborted) {
          onAbort();
          return;
        }
        init.signal?.addEventListener('abort', onAbort);
      });
    }));

    const provider = new TestProvider({ timeout: 1, maxRetries: 0 });
    await expect(provider.send({ system: 's', user: 'u' })).rejects.toThrow('timed out');
  });

  it('retries on 429', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests', text: () => Promise.resolve('rate limited') })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ text: 'ok' }) });

    vi.stubGlobal('fetch', fetchMock);
    const provider = new TestProvider({ timeout: 5000, maxRetries: 1 });

    const result = await provider.send({ system: 's', user: 'u' });
    expect(result).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on 5xx', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error', text: () => Promise.resolve('down') })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ text: 'ok' }) });

    vi.stubGlobal('fetch', fetchMock);
    const provider = new TestProvider({ timeout: 5000, maxRetries: 1 });

    const result = await provider.send({ system: 's', user: 'u' });
    expect(result).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 4xx (non-429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('bad auth'),
    }));

    const provider = new TestProvider({ timeout: 5000, maxRetries: 2 });
    await expect(provider.send({ system: 's', user: 'u' })).rejects.toThrow('401');
  });

  it('throws after max retries exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: () => Promise.resolve('down'),
    }));

    const provider = new TestProvider({ timeout: 5000, maxRetries: 1 });
    await expect(provider.send({ system: 's', user: 'u' })).rejects.toThrow('500');
  });

  it('retries on network errors', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ text: 'ok' }) });

    vi.stubGlobal('fetch', fetchMock);
    const provider = new TestProvider({ timeout: 5000, maxRetries: 1 });

    const result = await provider.send({ system: 's', user: 'u' });
    expect(result).toBe('ok');
  });

  it('resolves default model and providerUrl', () => {
    const provider = new TestProvider();
    expect(provider.getEndpointUrl()).toBe('https://test.api/v1/complete');
  });

  it('uses config overrides over defaults', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'ok' }),
    }));

    const provider = new TestProvider({ providerUrl: 'https://custom.api', model: 'custom-model' });
    await provider.send({ system: 's', user: 'u' });

    expect(fetch).toHaveBeenCalledWith('https://custom.api/v1/complete', expect.anything());
  });
});
