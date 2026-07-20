import { describe, it, expect } from 'vitest';
import { parseLlmResponse, resolveActionTargets, resolveTarget } from '../../commands/parse-llm-response.js';

// ── parseLlmResponse ──────────────────────────────────────────

describe('parseLlmResponse', () => {
  it('parses a valid JSON array', () => {
    const result = parseLlmResponse('[{"action":"CLICK","target":"e1"}]', 5);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'CLICK', target: 'e1' });
  });

  it('parses multiple actions', () => {
    const result = parseLlmResponse(
      '[{"action":"SET_VALUE","target":"e2","value":"hello"},{"action":"CLICK","target":"e3"}]',
      5,
    );
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe('hello');
  });

  it('strips markdown code fences', () => {
    const result = parseLlmResponse('```json\n[{"action":"CLICK","target":"e1"}]\n```', 5);
    expect(result).toHaveLength(1);
  });

  it('strips <think> blocks from qwen models', () => {
    const result = parseLlmResponse('<think>I should click this</think>\n[{"action":"CLICK","target":"e1"}]', 5);
    expect(result).toHaveLength(1);
  });

  it('strips case-insensitive <THINK> blocks', () => {
    const result = parseLlmResponse('<THINK>reasoning here</THINK>\n[{"action":"CLICK","target":"e1"}]', 5);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('CLICK');
  });

  it('uses fast path for direct JSON arrays', () => {
    const result = parseLlmResponse('[{"action":"NAVIGATE","target":"https://example.com"}]', 5);
    expect(result[0].type).toBe('NAVIGATE');
  });

  it('limits to maxActions', () => {
    const result = parseLlmResponse(
      '[{"action":"CLICK","target":"e1"},{"action":"CLICK","target":"e2"},{"action":"CLICK","target":"e3"}]',
      2,
    );
    expect(result).toHaveLength(2);
  });

  it('rejects SET_VALUE without value', () => {
    expect(() => parseLlmResponse('[{"action":"SET_VALUE","target":"e1"}]', 5)).toThrow('requires value field');
  });

  it('rejects missing target', () => {
    expect(() => parseLlmResponse('[{"action":"CLICK"}]', 5)).toThrow('Missing target');
  });

  it('rejects invalid action type', () => {
    expect(() => parseLlmResponse('[{"action":"SCROLL","target":"e1"}]', 5)).toThrow('Invalid action type');
  });

  it('throws on empty response', () => {
    expect(() => parseLlmResponse('no json here', 5)).toThrow('No JSON array found');
  });

  it('accepts "action" or "type" field name', () => {
    const result = parseLlmResponse('[{"action":"CLICK","target":"e1"}]', 5);
    expect(result[0].type).toBe('CLICK');
  });
});

// ── eN virtual ID resolution ──────────────────────────────────

describe('resolveTarget', () => {
  const elements = {
    e1: { selector: 'button*=Sign in' },
    e2: { selector: '#email', qualifiedSelector: '#email.instance(0)' },
    e5: { selector: 'input[name="search"]' },
  };

  it('resolves e1 to its selector', () => {
    expect(resolveTarget('e1', elements)).toBe('button*=Sign in');
  });

  it('resolves e2 to qualifiedSelector when available', () => {
    expect(resolveTarget('e2', elements)).toBe('#email.instance(0)');
  });

  it('resolves e5 to selector', () => {
    expect(resolveTarget('e5', elements)).toBe('input[name="search"]');
  });

  it('returns non-eN strings unchanged (URLs)', () => {
    expect(resolveTarget('https://example.com', elements)).toBe('https://example.com');
  });

  it('returns non-matching eN unchanged', () => {
    expect(resolveTarget('e99', elements)).toBe('e99'); // falls through — no such element
  });

  it('is case-insensitive', () => {
    expect(resolveTarget('E1', elements)).toBe('button*=Sign in');
  });
});

describe('resolveActionTargets', () => {
  const elements = {
    e1: { selector: 'button*=Submit' },
    e2: { selector: '#username' },
  };

  it('resolves all eN IDs in actions', () => {
    const actions = [
      { type: 'SET_VALUE' as const, target: 'e2', value: 'test' },
      { type: 'CLICK' as const, target: 'e1' },
      { type: 'NAVIGATE' as const, target: 'https://example.com' },
    ];
    const resolved = resolveActionTargets(actions, elements);
    expect(resolved[0].target).toBe('#username');
    expect(resolved[1].target).toBe('button*=Submit');
    expect(resolved[2].target).toBe('https://example.com'); // unchanged
  });
});
