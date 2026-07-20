import { describe, it, expect, vi, afterEach } from 'vitest';
import { initializeProvider } from '../../providers/index.ts';
import type { AgentServiceConfig } from '../../types/index.ts';

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));
vi.mock('@wdio/logger', () => ({ default: () => ({ warn: mockWarn, debug: vi.fn(), info: vi.fn() }) }));

describe('initializeProvider', () => {
  afterEach(() => {
    mockWarn.mockClear();
  });

  it('uses send override when provided', async () => {
    const mockSend = vi.fn().mockResolvedValue('mock response');
    const config: AgentServiceConfig = { send: mockSend };

    const provider = initializeProvider(config);
    const result = await provider.send({ system: 'sys', user: 'usr' });

    expect(result).toBe('mock response');
    expect(mockSend).toHaveBeenCalledWith({ system: 'sys', user: 'usr' });
  });

  it('warns when both send override and schema are set', async () => {
    const mockSend = vi.fn().mockResolvedValue('mock');
    const config: AgentServiceConfig = { send: mockSend, schema: 'anthropic' };

    const provider = initializeProvider(config);
    const result = await provider.send({ system: 's', user: 'u' });

    expect(result).toBe('mock');
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("'send' override and 'schema: anthropic'"),
    );
  });
});
