import { describe, it, expect, vi } from 'vitest';

// Mock @wdio/logger
vi.mock('@wdio/logger', () => ({ default: () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }) }));

// Mock getSnapshot
const mockGetSnapshot = vi.fn();
vi.mock('../../scripts/get-snapshot.js', () => ({
  getSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
}));

import { healSelector } from '../../healing/healer.js';

const mockBrowser = {} as unknown as WebdriverIO.Browser;

describe('healSelector', () => {
  it('returns healed selector when LLM responds with valid eN ID', async () => {
    mockGetSnapshot.mockResolvedValueOnce({
      text: 'e1  button "Sign in"  →  button*=Sign in\ne2  textbox "Email"  →  #email',
      elements: {
        e1: { selector: 'button*=Sign in' },
        e2: { selector: '#email' },
      },
    });

    const mockSend = vi.fn().mockResolvedValueOnce(
      JSON.stringify({ target_id: 'e2', confidence: 'high', reasoning: 'matches textbox' }),
    );

    const result = await healSelector(mockBrowser, '#old-email', 'setValue', mockSend, 1);

    expect(result).toBe('#email');
  });

  it('returns qualifiedSelector when available', async () => {
    mockGetSnapshot.mockResolvedValueOnce({
      text: 'e1  button "Submit"  →  button*=Submit',
      elements: {
        e1: { selector: 'button*=Submit', qualifiedSelector: 'button*=Submit.instance(0)' },
      },
    });

    const mockSend = vi.fn().mockResolvedValueOnce(
      JSON.stringify({ target_id: 'e1', confidence: 'high' }),
    );

    const result = await healSelector(mockBrowser, '#old-submit', 'click', mockSend, 1);

    expect(result).toBe('button*=Submit.instance(0)');
  });

  it('returns null when healer finds same selector', async () => {
    mockGetSnapshot.mockResolvedValueOnce({
      text: 'e1  button "Click me"  →  #same-btn',
      elements: {
        e1: { selector: '#same-btn' },
      },
    });

    const mockSend = vi.fn().mockResolvedValueOnce(
      JSON.stringify({ target_id: 'e1', confidence: 'high' }),
    );

    const result = await healSelector(mockBrowser, '#same-btn', 'click', mockSend, 1);

    expect(result).toBeNull();
  });

  it('returns null when LLM response has no target_id', async () => {
    mockGetSnapshot.mockResolvedValueOnce({
      text: 'e1  button "OK"  →  #ok',
      elements: { e1: { selector: '#ok' } },
    });

    const mockSend = vi.fn().mockResolvedValueOnce('{"reasoning": "cannot find element"}');

    const result = await healSelector(mockBrowser, '#gone', 'click', mockSend, 1);

    expect(result).toBeNull();
  });

  it('returns null when snapshot is empty', async () => {
    mockGetSnapshot.mockResolvedValueOnce({
      text: '',
      elements: {},
    });

    const mockSend = vi.fn();

    const result = await healSelector(mockBrowser, '#gone', 'click', mockSend, 1);

    expect(result).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('retries up to maxAttempts', async () => {
    mockGetSnapshot.mockResolvedValue({
      text: 'e1  button "OK"  →  #ok',
      elements: { e1: { selector: '#ok' } },
    });

    const mockSend = vi.fn()
      .mockResolvedValueOnce('invalid json {{{')
      .mockResolvedValueOnce(JSON.stringify({ target_id: 'e1', confidence: 'high' }));

    const result = await healSelector(mockBrowser, '#old', 'click', mockSend, 2);

    expect(result).toBe('#ok');
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('extracts target_id from raw text with regex fallback', async () => {
    mockGetSnapshot.mockResolvedValueOnce({
      text: 'e1  button "Yes"  →  #yes',
      elements: { e1: { selector: '#yes' } },
    });

    const mockSend = vi.fn().mockResolvedValueOnce(
      'Some text before {"target_id": "e1", "confidence": "high"} some text after',
    );

    const result = await healSelector(mockBrowser, '#old', 'click', mockSend, 1);

    expect(result).toBe('#yes');
  });
});
