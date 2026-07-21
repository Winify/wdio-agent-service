import { describe, it, expect, beforeEach } from 'vitest';
import { fixingSuggestionsStore, formatFixingSuggestions } from '../../healing/fixing-suggestions.js';

describe('fixingSuggestionsStore', () => {
  beforeEach(() => {
    fixingSuggestionsStore.clear();
  });

  it('starts empty', () => {
    const report = fixingSuggestionsStore.getReport();
    expect(report.totalEvents).toBe(0);
    expect(report.suggestions).toEqual([]);
  });

  it('accumulates suggestions', () => {
    fixingSuggestionsStore.addSuggestion({
      command: 'click',
      originalSelector: '#old-btn',
      suggestedSelector: 'button*=Submit',
    });

    fixingSuggestionsStore.addSuggestion({
      command: 'tap',
      originalSelector: '~stale-id',
      suggestedSelector: '~new-id',
      reasoning: 'Element text matches',
    });

    const report = fixingSuggestionsStore.getReport();
    expect(report.totalEvents).toBe(2);
    expect(report.suggestions).toHaveLength(2);
    expect(report.suggestions[0].command).toBe('click');
    expect(report.suggestions[0].originalSelector).toBe('#old-btn');
    expect(report.suggestions[0].suggestedSelector).toBe('button*=Submit');
    expect(report.suggestions[1].reasoning).toBe('Element text matches');
  });

  it('clears all suggestions', () => {
    fixingSuggestionsStore.addSuggestion({
      command: 'click',
      originalSelector: '#btn',
      suggestedSelector: 'button*=Ok',
    });

    fixingSuggestionsStore.clear();
    const report = fixingSuggestionsStore.getReport();
    expect(report.totalEvents).toBe(0);
    expect(report.suggestions).toHaveLength(0);
  });

  it('records timestamp on each suggestion', () => {
    fixingSuggestionsStore.addSuggestion({
      command: 'click',
      originalSelector: '#a',
      suggestedSelector: '#b',
    });

    const report = fixingSuggestionsStore.getReport();
    expect(report.suggestions[0].timestamp).toBeGreaterThan(0);
  });
});

describe('formatFixingSuggestions', () => {
  it('returns empty string for empty report', () => {
    const result = formatFixingSuggestions({ totalEvents: 0, suggestions: [] });
    expect(result).toBe('');
  });

  it('formats single suggestion', () => {
    const result = formatFixingSuggestions({
      totalEvents: 1,
      suggestions: [{
        command: 'click',
        originalSelector: '#old-btn',
        suggestedSelector: 'button*=Submit',
        reasoning: 'button text matches',
        timestamp: 1,
      }],
    });

    expect(result).toContain('[FixingSuggestions] 1 element-not-found errors analysed');
    expect(result).toContain('click "#old-btn" → "button*=Submit"');
    expect(result).toContain('button text matches');
  });

  it('omits reasoning when absent', () => {
    const result = formatFixingSuggestions({
      totalEvents: 1,
      suggestions: [{
        command: 'tap',
        originalSelector: '~bad',
        suggestedSelector: '~good',
        timestamp: 1,
      }],
    });

    expect(result).toContain('tap "~bad" → "~good"');
    expect(result).not.toContain('(');
  });

  it('formats multiple suggestions', () => {
    const result = formatFixingSuggestions({
      totalEvents: 3,
      suggestions: [
        { command: 'click', originalSelector: '#a', suggestedSelector: '#aa', timestamp: 1 },
        { command: 'tap', originalSelector: '~b', suggestedSelector: '~bb', timestamp: 2 },
        { command: 'setValue', originalSelector: '#c', suggestedSelector: '#cc', timestamp: 3 },
      ],
    });

    expect(result).toContain('[FixingSuggestions] 3 element-not-found errors analysed');
    expect(result).toContain('click "#a" → "#aa"');
    expect(result).toContain('tap "~b" → "~bb"');
    expect(result).toContain('setValue "#c" → "#cc"');
  });
});
