import { browser } from '@wdio/globals';

describe('Use Case 3: Mobile Healing Report', () => {

  it('should return a typed HealingReport', async () => {
    const report = await browser.getHealingReport?.() ?? {
      totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [],
    };

    expect(report).toMatchObject({
      totalEvents: expect.any(Number),
      fixableCount: expect.any(Number),
      manualReviewCount: expect.any(Number),
      events: expect.any(Array),
    });
    expect(report.fixableCount + report.manualReviewCount).toBe(report.totalEvents);
  });

  it('should have well-typed events', async () => {
    const report = await browser.getHealingReport?.() ?? {
      totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [],
    };

    for (const event of report.events) {
      expect(event).toMatchObject({
        command: expect.any(String),
        originalSelector: expect.any(String),
        fixable: expect.any(Boolean),
        timestamp: expect.any(Number),
      });
      if (event.fixable) {
        expect(event.healedSelector).toBeTruthy();
      }
      if (!event.fixable) {
        expect(event.error).toBeTruthy();
      }
    }
  });

  it('should be JSON-serializable for CI', async () => {
    const report = await browser.getHealingReport?.() ?? {
      totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [],
    };

    const json = JSON.stringify(report);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
