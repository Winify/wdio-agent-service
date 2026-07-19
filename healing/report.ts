import type { HealingEvent, HealingReport } from '../types';

/**
 * Singleton healing report store. Accumulates healing events during a test run.
 * Cleared in the service before() hook, populated by interceptors.
 */
class HealingReportStore {
  private events: HealingEvent[] = [];

  addEvent(event: Omit<HealingEvent, 'timestamp'>): void {
    this.events.push({ ...event, timestamp: Date.now() });
  }

  getReport(): HealingReport {
    const totalEvents = this.events.length;
    const fixableCount = this.events.filter(e => e.fixable).length;
    return {
      totalEvents,
      fixableCount,
      manualReviewCount: totalEvents - fixableCount,
      events: [...this.events],
    };
  }

  clear(): void {
    this.events = [];
  }
}

export const healingReport = new HealingReportStore();

/**
 * Format a healing report as a human-readable summary string.
 * Shared between the after() hook and spec-level reporting.
 */
export function formatHealingSummary(report: HealingReport): string {
  const lines: string[] = [];
  lines.push(
    `\n[Healing] ${report.fixableCount} selector(s) can be fixed automatically, ` +
    `${report.manualReviewCount} need(s) manual review`,
  );

  for (const event of report.events) {
    if (event.fixable) {
      lines.push(`[Healing]   FIX: ${event.command}  "${event.originalSelector}" → "${event.healedSelector}"`);
    } else {
      lines.push(`[Healing]   MANUAL: ${event.command} "${event.originalSelector}" — ${event.suggestion || 'needs investigation'}`);
    }
  }

  return lines.join('\n');
}
