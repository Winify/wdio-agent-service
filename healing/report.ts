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
    const totalHeals = this.events.length;
    const successfulHeals = this.events.filter(e => e.success).length;
    return {
      totalHeals,
      successfulHeals,
      failedHeals: totalHeals - successfulHeals,
      events: [...this.events],
    };
  }

  clear(): void {
    this.events = [];
  }
}

export const healingReport = new HealingReportStore();
