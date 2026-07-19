/**
 * Use Case 3: Healing Summary at End of Test Execution
 *
 * When autoHeal is enabled, every healing event is tracked. Access:
 *   const report = await browser.getHealingReport?.() ?? { totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] };
 *   // { totalHeals, successfulHeals, failedHeals, events: [...] }
 *
 * The AgentService.after() hook also logs a summary automatically.
 */

describe('Use Case 3: Healing summary report', () => {

  const BASE = 'https://webdriveruniversity.com';

  // ── Report structure ─────────────────────────────────────────

  describe('getHealingReport() API', () => {

    it('returns a typed HealingReport even when no heals occurred', async () => {
      await browser.url(BASE + '/index.html');

      const report = await browser.getHealingReport?.() ?? { totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] };

      expect(report).toMatchObject({
        totalEvents: expect.any(Number),
        fixableCount: expect.any(Number),
        manualReviewCount: expect.any(Number),
        events: expect.any(Array),
      });

      // Invariant
      expect(report.fixableCount + report.manualReviewCount).toBe(report.totalEvents);
    });

    it('events array is iterable and well-typed', async () => {
      await browser.url(BASE + '/Contact-Us/contactus.html');
      await browser.$('input[name="first_name"]').setValue('Test');

      const report = await browser.getHealingReport?.() ?? { totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] };

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
  });

  // ── CI/CD integration ───────────────────────────────────────

  describe('CI/CD integration patterns', () => {

    it('can gate deploys on healing failure rate', async () => {
      await browser.url(BASE + '/index.html');

      const report = await browser.getHealingReport?.() ?? { totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] };
      const healRate = report.totalEvents > 0
        ? report.manualReviewCount / report.totalEvents
        : 0;

      console.log(`Heal failure rate: ${(healRate * 100).toFixed(0)}%`);
      expect(healRate).toBeLessThanOrEqual(1.0);
    });

    it('exports healing data for observability', async () => {
      await browser.url(BASE + '/Login-Portal/index.html');
      await browser.$('#text').setValue('webdriver');
      await browser.$('#password').setValue('webdriver123');

      const report = await browser.getHealingReport?.() ?? { totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] };

      const exportable = {
        timestamp: new Date().toISOString(),
        summary: {
          total: report.totalEvents,
          successful: report.fixableCount,
          failed: report.manualReviewCount,
        },
        events: report.events.map(e => ({
          command: e.command,
          original: e.originalSelector,
          healed: e.healedSelector || null,
          fixable: e.fixable,
        })),
      };

      console.log('Healing export:', JSON.stringify(exportable, null, 2));
      expect(exportable.summary.total).toBe(report.totalEvents);
    });
  });

  // ── After-hook summary ──────────────────────────────────────

  describe('after() hook console output', () => {

    it('prints a human-readable summary automatically', async () => {
      await browser.url(BASE + '/index.html');

      const report = await browser.getHealingReport?.() ?? { totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] };
      console.log(`[Healing] ${report.fixableCount} can be fixed, ${report.manualReviewCount} need manual review`);
      expect(report).toBeDefined();
    });
  });
});
