import { describe, it, expect, vi, afterEach } from 'vitest';
import { initializeProvider } from '../../providers/index.ts';
import type { AgentServiceConfig } from '../../types/index.ts';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));
vi.mock('@wdio/logger', () => ({ default: () => ({ warn: mockWarn, debug: vi.fn(), info: vi.fn() }) }));

describe('initializeProvider', () => {
  afterEach(() => {
    mockWarn.mockClear();
  });

  it('uses request override when provided', async () => {
    const mockSend = vi.fn().mockResolvedValue('mock response');
    const config: AgentServiceConfig = { request: mockSend };

    const provider = initializeProvider(config);
    const result = await provider.request({ system: 'sys', user: 'usr' });

    expect(result).toBe('mock response');
    expect(mockSend).toHaveBeenCalledWith({ system: 'sys', user: 'usr' });
  });

  it('warns when both request override and schema are set', async () => {
    const mockSend = vi.fn().mockResolvedValue('mock');
    const config: AgentServiceConfig = {
      request: mockSend,
      schema: 'anthropic',
      providerUrl: 'http://x',
      model: 'm',
    };

    const provider = initializeProvider(config);
    const result = await provider.request({ system: 's', user: 'u' });

    expect(result).toBe('mock');
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("'request' override and 'schema: anthropic'"),
    );
  });

  describe('deprecated send config', () => {
    it('maps send to request with deprecation warning', async () => {
      const mockFn = vi.fn().mockResolvedValue('compat response');
      const config: AgentServiceConfig = { send: mockFn };

      const provider = initializeProvider(config);
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
      const config: AgentServiceConfig = { request: requestFn, send: sendFn };

      const provider = initializeProvider(config);
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
});
