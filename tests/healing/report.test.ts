import { describe, it, expect, beforeEach } from 'vitest';
import { healingReport } from '../../healing/report.js';

describe('HealingReportStore', () => {
  beforeEach(() => {
    healingReport.clear();
  });

  it('starts empty', () => {
    const report = healingReport.getReport();
    expect(report.totalEvents).toBe(0);
    expect(report.fixableCount).toBe(0);
    expect(report.manualReviewCount).toBe(0);
    expect(report.events).toHaveLength(0);
  });

  it('tracks fixable selector', () => {
    healingReport.addEvent({
      command: 'click',
      originalSelector: '#old-btn',
      healedSelector: '#new-btn',
      fixable: true,
    });

    const report = healingReport.getReport();
    expect(report.totalEvents).toBe(1);
    expect(report.fixableCount).toBe(1);
    expect(report.manualReviewCount).toBe(0);
    expect(report.events[0].timestamp).toBeGreaterThan(0);
  });

  it('tracks selector needing manual review', () => {
    healingReport.addEvent({
      command: 'setValue',
      originalSelector: '#gone',
      fixable: false,
      error: 'Could not heal selector',
    });

    const report = healingReport.getReport();
    expect(report.totalEvents).toBe(1);
    expect(report.fixableCount).toBe(0);
    expect(report.manualReviewCount).toBe(1);
  });

  it('aggregates fixable and manual events', () => {
    healingReport.addEvent({ command: 'click', originalSelector: '#a', healedSelector: '#a2', fixable: true });
    healingReport.addEvent({ command: 'click', originalSelector: '#b', fixable: false, error: 'not found' });
    healingReport.addEvent({ command: 'setValue', originalSelector: '#c', healedSelector: '#c2', fixable: true });

    const report = healingReport.getReport();
    expect(report.totalEvents).toBe(3);
    expect(report.fixableCount).toBe(2);
    expect(report.manualReviewCount).toBe(1);
  });

  it('clear() resets the report', () => {
    healingReport.addEvent({ command: 'click', originalSelector: '#x', fixable: false, error: 'err' });
    healingReport.clear();

    const report = healingReport.getReport();
    expect(report.totalEvents).toBe(0);
  });
});
