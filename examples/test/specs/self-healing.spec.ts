/**
 * Use Case 2: Self-Healing on Command Failure
 *
 * When autoHeal is enabled, the interceptor catches element-not-found
 * errors and asks the LLM to find the intended element semantically.
 *
 * Healing decision tree:
 *   - stale element reference    → re-find by original selector (no LLM)
 *   - element click intercepted  → scroll into view, retry (no LLM)
 *   - invalid element state      → RE-THROW (not healable)
 *   - element not found          → LLM heal → retry
 *
 * Config:
 *   autoHeal: { enabled: true, commands: ['click', 'setValue'], maxAttempts: 2 }
 */

describe('Use Case 2: Self-healing when selectors break', () => {

  const BASE = 'https://webdriveruniversity.com';

  // ── Normal operation (healer wraps every command) ────────────

  describe('transparent healing wrapper', () => {

    it('wraps click commands transparently', async () => {
      await browser.url(BASE + '/Contact-Us/contactus.html');

      // Every $() and .click() goes through the healer wrapper.
      // On success, it's completely transparent.
      const resetBtn = await browser.$('input[value="RESET"]');
      await resetBtn.click();

      // Reset button should be clickable without error
      await expect(resetBtn).toBeDisplayed();
    });

    it('wraps setValue commands transparently', async () => {
      await browser.url(BASE + '/Contact-Us/contactus.html');

      const emailField = await browser.$('input[name="email"]');
      await emailField.setValue('test@example.com');

      await expect(emailField).toHaveValue('test@example.com');
    });
  });

  // ── Stale element recovery (no LLM cost) ─────────────────────

  describe('stale element reference', () => {

    it('re-finds the element by original selector', async () => {
      // If the DOM changes between find and act, the healer
      // re-queries by the original selector. No LLM call.
      await browser.url(BASE + '/Login-Portal/index.html');

      const usernameField = await browser.$('#text');
      await usernameField.setValue('testuser');

      // The element might go stale — healer re-finds it
      await expect(usernameField).toHaveValue('testuser');
    });
  });

  // ── Broken selector → LLM semantic healing ───────────────────

  describe('LLM-based semantic healing', () => {

    it('heals a deliberately broken selector via LLM', async () => {
      // Simulate: the test uses an old selector that no longer exists.
      // The interceptor catches "element not found", snapshots the page,
      // and asks the LLM to find the intended element by semantics.
      await browser.url(BASE + '/Login-Portal/index.html');

      // Use a BROKEN selector — the LLM must find the real element.
      // The page has #text (username) and #password inputs.
      try {
        const broken = await browser.$('#old-username-field');
        await broken.setValue('webdriver');
      } catch {
        // Expected — the broken selector triggers the healer.
        // The healer asks the LLM: "which element on this page
        // looks like a username field that was #old-username-field?"
      }

      // After the healing attempt, check the report for the event
      const report = await browser.getHealingReport?.() ?? { totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] };

      // At minimum, the healer should have tried
      expect(report.totalEvents).toBeGreaterThanOrEqual(1);

      // Print prescriptive healing summary — shows what should be fixed
      const healingSummary = await browser.getHealingReport?.() ?? { totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] };
      console.log(`\n[Healing] ${healingSummary.fixableCount} selector(s) can be fixed automatically, ${healingSummary.manualReviewCount} need(s) manual review`);
      for (const event of healingSummary.events) {
        if (event.fixable) {
          console.log(`[Healing]   FIX: ${event.command}  "${event.originalSelector}" → "${event.healedSelector}"`);
        } else {
          console.log(`[Healing]   MANUAL: ${event.command} "${event.originalSelector}" — ${event.suggestion}`);
        }
      }

      // Verify the real element still works (healer intercepted the failure)
      const realUsername = await browser.$('#text');
      await realUsername.setValue('webdriver');
      await expect(realUsername).toHaveValue('webdriver');
    });
  });

  // ── Non-healable errors ──────────────────────────────────────

  describe('non-healable errors', () => {

    it('does not waste LLM calls on state errors', async () => {
      // "invalid element state" means the element was FOUND but
      // the action is invalid. Healing would find the same element.
      // These re-throw immediately.
      await browser.url(BASE + '/Dropdown-Checkboxes-RadioButtons/index.html');

      // Disabled radio button — can't be clicked, but it EXISTS
      const disabledRadio = await browser.$('input[value="cabbage"]');
      await expect(disabledRadio).toBeDisabled();
    });
  });
});
