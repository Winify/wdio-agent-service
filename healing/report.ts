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
