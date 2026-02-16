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

  it('throws on unknown provider', () => {
    const config = { provider: 'unknown' } as AgentServiceConfig;
    expect(() => initializeProvider(config)).toThrow(
      'Unknown provider "unknown". Supported: ollama, anthropic, openai, openrouter, gemini',
    );
  });

  it('defaults to ollama when provider is undefined', () => {
    const config: AgentServiceConfig = {};
    const provider = initializeProvider(config);
    expect(provider.constructor.name).toBe('OllamaProvider');
  });

  it('routes to ollama explicitly', () => {
    const config: AgentServiceConfig = { provider: 'ollama' };
    const provider = initializeProvider(config);
    expect(provider.constructor.name).toBe('OllamaProvider');
  });

  it('routes to anthropic provider', () => {
    const config: AgentServiceConfig = { provider: 'anthropic', token: 'test-key' };
    const provider = initializeProvider(config);
    expect(provider.constructor.name).toBe('AnthropicProvider');
  });

  it('throws when anthropic has no token', () => {
    const config: AgentServiceConfig = { provider: 'anthropic' };
    expect(() => initializeProvider(config)).toThrow("Anthropic requires 'token' config or ANTHROPIC_API_KEY env var");
  });

  it('routes to openai provider', () => {
    const config: AgentServiceConfig = { provider: 'openai', token: 'test-key' };
    const provider = initializeProvider(config);
    expect(provider.constructor.name).toBe('OpenAIProvider');
  });

  it('throws when openai has no token', () => {
    const config: AgentServiceConfig = { provider: 'openai' };
    expect(() => initializeProvider(config)).toThrow("OpenAI requires 'token' config or OPENAI_API_KEY env var");
  });

  it('routes to openrouter provider', () => {
    const config: AgentServiceConfig = { provider: 'openrouter', token: 'test-key', model: 'x/y' };
    const provider = initializeProvider(config);
    expect(provider.constructor.name).toBe('OpenRouterProvider');
  });

  it('throws when openrouter has no model', () => {
    const config: AgentServiceConfig = { provider: 'openrouter', token: 'test-key' };
    expect(() => initializeProvider(config)).toThrow("OpenRouter requires an explicit 'model' in config");
  });

  it('throws when openrouter has no token', () => {
    const config: AgentServiceConfig = { provider: 'openrouter', model: 'x/y' };
    expect(() => initializeProvider(config)).toThrow("OpenRouter requires 'token' config or OPENROUTER_API_KEY env var");
  });

  it('routes to gemini provider', () => {
    const config: AgentServiceConfig = { provider: 'gemini', token: 'test-key' };
    const provider = initializeProvider(config);
    expect(provider.constructor.name).toBe('GeminiProvider');
  });

  it('throws when gemini has no token', () => {
    const config: AgentServiceConfig = { provider: 'gemini' };
    expect(() => initializeProvider(config)).toThrow("Gemini requires 'token' config or GEMINI_API_KEY env var");
  });

  it('warns when both send override and provider are set', async () => {
    const mockSend = vi.fn().mockResolvedValue('mock');
    const config: AgentServiceConfig = { send: mockSend, provider: 'anthropic' };

    const provider = initializeProvider(config);
    const result = await provider.send({ system: 's', user: 'u' });

    expect(result).toBe('mock');
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("'send' override and 'provider: anthropic'"),
    );
  });
});
