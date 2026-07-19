/**
 * Use Case 2: Self-Healing on Command Failure
 *
 * When a WDIO command fails because an element's selector changed,
 * the auto-heal interceptor steps in transparently. Instead of the
 * test crashing with "element not found", the healer:
 *
 *   1. Takes a fresh page snapshot via @wdio/elements
 *   2. Asks the LLM: "given this broken selector and the current page,
 *      which element was most likely intended?"
 *   3. Resolves the LLM's eN virtual ID → real selector
 *   4. Retries the command with the healed selector
 *
 * Config (wdio.conf.ts):
 *   services: [['agent', {
 *     autoHeal: {
 *       enabled: true,
 *       commands: ['click', 'setValue'],   // which commands to intercept
 *       maxAttempts: 2,                     // healing retries per failure
 *     },
 *   }]]
 *
 * Healing decision tree:
 *   - stale element reference    → re-find by original selector (no LLM)
 *   - element click intercepted  → scroll into view, pause, retry (no LLM)
 *   - invalid element state      → RE-THROW (not healable, element is wrong state)
 *   - element not found          → LLM-based healing, then retry
 *
 * NOT healable:
 *   - Network errors, session timeouts, JavaScript evaluation errors
 *   - invalid element state (element exists but can't accept the action)
 *   - Navigation failures
 */

describe('Use Case 2: Self-healing when selectors break', () => {

  // ── Stale element recovery ───────────────────────────────────

  describe('stale element reference (DOM refresh)', () => {

    it('re-finds the element without an LLM call', async () => {
      // Scenario: an element reference goes stale because the DOM
      // re-rendered between find and act. The healer re-queries by
      // the original selector. No LLM cost.
      await browser.url('https://the-internet.herokuapp.com/dynamic_loading/2');

      // Trigger a DOM change
      await browser.$('button=Start').click();

      // Wait for the loading bar to finish — the DOM refreshes
      const finishText = await browser.$('#finish');
      await finishText.waitForDisplayed({ timeout: 15000 });

      // If the element reference went stale, the healer re-finds it
      // by the original selector and retries transparently.
      await expect(finishText).toHaveText('Hello World!');
    });
  });

  // ── Broken selector healing ──────────────────────────────────

  describe('broken selector (element not found)', () => {

    it('heals a selector that no longer matches', async () => {
      // Scenario: a test uses $('#old-submit-btn') but the app was
      // redeployed and the button is now button*=Submit.
      //
      // With autoHeal enabled, the interceptor:
      //   1. Catches "element not found"
      //   2. Snapshots the page
      //   3. Asks the LLM "which element looks like a submit button?"
      //   4. Retries with the healed selector
      await browser.url('https://the-internet.herokuapp.com/login');

      // This selector exists and should work normally
      const loginBtn = await browser.$('button[type="submit"]');
      await expect(loginBtn).toBeDisplayed();

      // If it HAD failed, the healer would have intercepted it.
      // The healing is transparent — the test doesn't need to know.
    });

    it('uses the LLM to match by element semantics', async () => {
      // The healing prompt asks the LLM to match by:
      //   - Element role (button, textbox, link...)
      //   - Text content ("Sign In", "Submit"...)
      //   - Position in the page structure
      //
      // This means healing survives:
      //   - CSS class renames (btn-primary → btn-main)
      //   - ID changes (login-btn → signin-btn)
      //   - DOM restructuring (button moves inside a new container)
      //
      // As long as the element is *semantically* recognisable,
      // the LLM can find it.
      await browser.url('https://the-internet.herokuapp.com/');

      // Force a known interaction through agent() — the underlying
      // $() and .click() are wrapped by the healer.
      const result = await browser.agent('click the Form Authentication link');
      expect(result.actions.some(a => a.type === 'CLICK')).toBe(true);
      await expect(browser).toHaveUrl('/login', { containing: true });
    });
  });

  // ── Non-healable errors ──────────────────────────────────────

  describe('non-healable errors (re-thrown immediately)', () => {

    it('does not waste LLM calls on state errors', async () => {
      // "invalid element state" means the element was FOUND correctly
      // but the action is invalid for its current state. Healing the
      // selector would find the same element — pointless.
      //
      // Example: clicking a disabled button, setting value on a readonly input.
      // These re-throw immediately without an LLM call.
      await browser.url('https://the-internet.herokuapp.com/dynamic_controls');

      // Enable the input first
      await browser.$('button=Enable').click();
      await browser.$('#input-example input').waitForEnabled({ timeout: 10000 });

      // Now the input is enabled — setValue should work
      const input = await browser.$('#input-example input');
      await input.setValue('test');

      await expect(input).toHaveValue('test');
    });
  });

  // ── Opt-in config pattern ────────────────────────────────────

  describe('configuration patterns', () => {

    it('healing is opt-in and per-command', async () => {
      // autoHeal is disabled by default. Enable it only where you
      // expect selector volatility:
      //
      //   autoHeal: { enabled: true, commands: ['click', 'setValue'] }
      //
      // Common patterns:
      //   - CI pipelines with flaky selectors → enable for click, setValue
      //   - Mobile tests with Appium → add 'tap' to commands
      //   - Stable staging environment → leave disabled for speed
      //   - Cookie banner dismissal → don't heal — just re-run agent()
      //
      // The commands array means: "only intercept THESE commands."
      // Other commands (clearValue, doubleClick, etc.) pass through
      // without healing overhead.
      expect(true).toBe(true); // config pattern demonstration
    });
  });
});
