import type { FixingSuggestion, FixingSuggestionsReport } from '../types';

/**
 * Singleton fixing suggestions store. Accumulates selector fix suggestions during a test run.
 * Cleared in the service before() hook, populated by the fixing suggestions interceptor.
 */
class FixingSuggestionsStore {
  private suggestions: FixingSuggestion[] = [];

  addSuggestion(suggestion: Omit<FixingSuggestion, 'timestamp'>): void {
    this.suggestions.push({ ...suggestion, timestamp: Date.now() });
  }

  getReport(): FixingSuggestionsReport {
    return {
      totalEvents: this.suggestions.length,
      suggestions: [...this.suggestions],
    };
  }

  clear(): void {
    this.suggestions = [];
  }
}

export const fixingSuggestionsStore = new FixingSuggestionsStore();

/**
 * Format fixing suggestions as a human-readable summary string.
 */
export function formatFixingSuggestions(report: FixingSuggestionsReport): string {
  if (report.totalEvents === 0) return '';

  const lines: string[] = [];
  lines.push(
    `\n[FixingSuggestions] ${report.totalEvents} element-not-found errors analysed. ` +
    'Suggested selectors below — apply manually to fix tests.',
  );

  for (const s of report.suggestions) {
    lines.push(
      `[FixingSuggestions]   ${s.command} "${s.originalSelector}" → "${s.suggestedSelector}"` +
      `${s.reasoning ? ` (${s.reasoning})` : ''}`,
    );
  }

  return lines.join('\n');
}
