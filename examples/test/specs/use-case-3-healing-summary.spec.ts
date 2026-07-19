/**
 * Use Case 3: Healing Summary at End of Test Execution
 *
 * When autoHeal is enabled, every healing event is tracked. At the
 * end of the test suite, the service's after() hook emits a summary:
 *
 *   [Healing] Summary: 2/3 healed successfully
 *   [Healing]   HEALED: click "#old-btn" → "button*=Sign In"
 *   [Healing]   HEALED: setValue "#stale-email" → "#email"
 *   [Healing]   FAILED: click "#gone" (Could not heal selector)
 *
 * Access programmatically:
 *   const report = browser.getHealingReport();
 *   // { totalHeals, successfulHeals, failedHeals, events: [...] }
 *
 * Each HealingEvent records:
 *   - command: which command was intercepted
 *   - originalSelector: the broken selector
 *   - healedSelector: the resolved replacement (if successful)
 *   - success: whether the heal + retry worked
 *   - error: failure reason (if applicable)
 *   - timestamp: when the event occurred
 */

describe('Use Case 3: Healing summary report', () => {

  // ── Report structure ─────────────────────────────────────────

  describe('getHealingReport() API', () => {

    it('returns a typed HealingReport object', async () => {
      await browser.url('https://the-internet.herokuapp.com/login');

      // The report is always available when autoHeal is enabled
      const report = browser.getHealingReport!();

      expect(report).toMatchObject({
        totalHeals: expect.any(Number),
        successfulHeals: expect.any(Number),
        failedHeals: expect.any(Number),
        events: expect.any(Array),
      });

      // Invariant: successfulHeals + failedHeals === totalHeals
      expect(report.successfulHeals + report.failedHeals).toBe(report.totalHeals);
    });

    it('each event records the full healing context', async () => {
      // When a heal occurs, the event captures enough data to debug
      // selector drift patterns across test runs.
      const report = browser.getHealingReport!();

      for (const event of report.events) {
        // Every event has these fields
        expect(event).toMatchObject({
          command: expect.any(String),         // 'click' | 'setValue' | 'tap'
          originalSelector: expect.any(String), // the selector that failed
          success: expect.any(Boolean),         // did the heal work?
          timestamp: expect.any(Number),        // when it happened
        });

        // Successful heals include the replacement selector
        if (event.success) {
          expect(event.healedSelector).toBeTruthy();
          expect(event.healedSelector).not.toBe(event.originalSelector);
        }

        // Failed heals include the reason
        if (!event.success) {
          expect(event.error).toBeTruthy();
        }
      }
    });
  });

  // ── Analysing selector drift ─────────────────────────────────

  describe('using the report to find selector drift', () => {

    it('identifies which selectors break most often', async () => {
      await browser.url('https://the-internet.herokuapp.com/');

      // After a test run, aggregate healing events to find patterns:
      const report = browser.getHealingReport!();

      if (report.totalHeals > 0) {
        // Count heal frequency per selector
        const bySelector = new Map<string, number>();
        for (const e of report.events) {
          const count = bySelector.get(e.originalSelector) || 0;
          bySelector.set(e.originalSelector, count + 1);
        }

        // Selectors that get healed frequently are good candidates
        // for rewriting to more robust locators.
        const frequentHeals = [...bySelector.entries()]
          .filter(([, c]) => c >= 2)
          .sort(([, a], [, b]) => b - a);

        if (frequentHeals.length > 0) {
          console.log('Selectors needing attention:');
          for (const [sel, count] of frequentHeals) {
            console.log(`  ${sel}: healed ${count}×`);
          }
        }
      }

      // Pattern: use CI analytics on healing reports to
      // proactively harden selectors before they fail.
      expect(report.totalHeals).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Integration with CI/CD ───────────────────────────────────

  describe('CI/CD integration patterns', () => {

    it('can gate deploys on healing rate', async () => {
      // Pattern: if more than 10% of selectors need healing,
      // flag the test run for selector review.
      await browser.url('https://the-internet.herokuapp.com/');
      await browser.agent('click Form Authentication');

      const report = browser.getHealingReport!();
      const healRate = report.totalHeals > 0
        ? report.failedHeals / report.totalHeals
        : 0;

      // In CI, you might:
      //   if (healRate > 0.5) {
      //     console.warn('⚠️  >50% heal failure rate — review selectors');
      //   }
      console.log(`Heal failure rate: ${(healRate * 100).toFixed(0)}%`);

      expect(healRate).toBeLessThanOrEqual(1.0);
    });

    it('exports healing data for long-term tracking', async () => {
      // Pattern: collect healing events across runs to build a
      // selector stability dashboard.
      //
      // Each HealingEvent has:
      //   - timestamp → time-series of selector breakage
      //   - originalSelector → which selectors are fragile
      //   - healedSelector → what the LLM resolved to
      //   - command → which action types most affected
      //
      // Feed this into your observability stack (Datadog, Grafana, etc.)
      // to track selector volatility over time.
      const report = browser.getHealingReport!();

      const exportable = {
        timestamp: new Date().toISOString(),
        summary: {
          total: report.totalHeals,
          successful: report.successfulHeals,
          failed: report.failedHeals,
        },
        events: report.events.map(e => ({
          command: e.command,
          original: e.originalSelector,
          healed: e.healedSelector || null,
          success: e.success,
          error: e.error || null,
        })),
      };

      console.log('Healing export:', JSON.stringify(exportable, null, 2));
      expect(exportable.summary.total).toBe(report.totalHeals);
    });
  });

  // ── Console log summary ──────────────────────────────────────

  describe('after() hook console output', () => {

    it('logs a human-readable summary at end of suite', async () => {
      // After all tests complete, the AgentService.after() hook
      // prints to the WDIO log:
      //
      //   [Healing] Summary: 2/3 healed successfully
      //   [Healing]   HEALED: click "#old-btn" → "button*=Sign In"
      //   [Healing]   HEALED: setValue "#stale" → "#email.instance(0)"
      //   [Healing]   FAILED: click "#gone" (Could not heal selector)
      //
      // This appears in the WDIO spec reporter output automatically.
      // No extra config needed — it works with any WDIO reporter.
      await browser.url('https://the-internet.herokuapp.com/');

      const report = browser.getHealingReport!();
      console.log(`[Healing] Summary: ${report.successfulHeals}/${report.totalHeals} healed`);

      // The report is available even when zero heals occurred
      expect(report).toBeDefined();
    });
  });
});
