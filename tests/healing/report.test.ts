import { describe, it, expect, beforeEach } from 'vitest';
import { healingReport } from '../../healing/report.js';

describe('HealingReportStore', () => {
  beforeEach(() => {
    healingReport.clear();
  });

  it('starts empty', () => {
    const report = healingReport.getReport();
    expect(report.totalHeals).toBe(0);
    expect(report.successfulHeals).toBe(0);
    expect(report.failedHeals).toBe(0);
    expect(report.events).toHaveLength(0);
  });

  it('tracks successful healing', () => {
    healingReport.addEvent({
      command: 'click',
      originalSelector: '#old-btn',
      healedSelector: '#new-btn',
      success: true,
    });

    const report = healingReport.getReport();
    expect(report.totalHeals).toBe(1);
    expect(report.successfulHeals).toBe(1);
    expect(report.failedHeals).toBe(0);
    expect(report.events[0].timestamp).toBeGreaterThan(0);
  });

  it('tracks failed healing', () => {
    healingReport.addEvent({
      command: 'setValue',
      originalSelector: '#gone',
      success: false,
      error: 'Could not heal selector',
    });

    const report = healingReport.getReport();
    expect(report.totalHeals).toBe(1);
    expect(report.successfulHeals).toBe(0);
    expect(report.failedHeals).toBe(1);
  });

  it('aggregates multiple events', () => {
    healingReport.addEvent({ command: 'click', originalSelector: '#a', healedSelector: '#a2', success: true });
    healingReport.addEvent({ command: 'click', originalSelector: '#b', success: false, error: 'not found' });
    healingReport.addEvent({ command: 'setValue', originalSelector: '#c', healedSelector: '#c2', success: true });

    const report = healingReport.getReport();
    expect(report.totalHeals).toBe(3);
    expect(report.successfulHeals).toBe(2);
    expect(report.failedHeals).toBe(1);
  });

  it('clear() resets all data', () => {
    healingReport.addEvent({ command: 'click', originalSelector: '#x', success: false, error: 'err' });
    healingReport.clear();

    const report = healingReport.getReport();
    expect(report.totalHeals).toBe(0);
  });
});
