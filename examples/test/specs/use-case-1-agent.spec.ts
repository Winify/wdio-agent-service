/**
 * Use Case 1: browser.agent(prompt) — Natural Language Command Execution
 *
 * The core feature. `browser.agent()` sends a natural language instruction plus
 * the current page snapshot to an LLM. The LLM returns structured actions
 * (CLICK, SET_VALUE, NAVIGATE, TAP) which WebdriverIO executes.
 *
 * Two execution modes:
 *   - Single-pass (maxSteps=1): one LLM call → N actions. Fast, predictable.
 *     Best for: "click the login button", "accept cookies", "type X into Y".
 *   - Agentic loop (maxSteps>1): observe → think → act → repeat.
 *     Best for: multi-step flows, conditional logic, form fill + submit.
 *
 * Config (wdio.conf.ts):
 *   services: [['agent', {
 *     schema: 'openai',
 *     providerUrl: 'http://localhost:1234',
 *     model: 'qwen/qwen3.5-4b',
 *     maxSteps: 4,        // default: 1 (single-pass)
 *     maxActions: 3,      // default: 1
 *   }]]
 *
 * Per-call overrides:
 *   await browser.agent('fill the form', { maxSteps: 3, maxActions: 2 });
 */

describe('Use Case 1: browser.agent() — natural language commands', () => {

  // ── Single-pass mode ─────────────────────────────────────────

  describe('single-pass mode (maxSteps=1)', () => {

    it('executes a simple click instruction', async () => {
      // When you know exactly what you want and only one action is needed,
      // single-pass is the right choice — fast, one LLM call.
      // Force single-pass via { maxSteps: 1 } regardless of wdio.conf default.
      await browser.url('https://the-internet.herokuapp.com/');

      const result = await browser.agent('click on JavaScript Alerts', { maxSteps: 1 });

      // AgentResult gives you full introspection
      expect(result.goalAchieved).toBe(true);
      expect(result.totalSteps).toBe(1);                    // single-pass = 1 step
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('CLICK');

      // Verify the action actually worked
      await expect(browser).toHaveUrl('/javascript_alerts', { containing: true });
    });

    it('types text into a form field', async () => {
      await browser.url('https://the-internet.herokuapp.com/login');

      const result = await browser.agent('type "tomsmith" into the username field', { maxSteps: 1 });

      expect(result.goalAchieved).toBe(true);
      expect(result.actions[0].type).toBe('SET_VALUE');
      expect(result.actions[0].value).toContain('tomsmith');

      // The real selector was resolved from the virtual ID automatically
      await expect($('#username')).toHaveValue('tomsmith');
    });

    it('returns actionable result metadata', async () => {
      await browser.url('https://the-internet.herokuapp.com/');

      const result = await browser.agent('click the Add/Remove Elements link', { maxSteps: 1 });

      // Full result shape for assertions
      expect(result).toMatchObject({
        goalAchieved: true,
        totalSteps: 1,
        steps: expect.arrayContaining([
          expect.objectContaining({
            step: 1,
            done: true,
            actions: expect.arrayContaining([
              expect.objectContaining({ success: true }),
            ]),
          }),
        ]),
      });
    });
  });

  // ── Agentic ReAct loop ───────────────────────────────────────
  //
  // NOTE: The ReAct loop (maxSteps > 1) requires a capable model (7B+).
  // Small models (3-4B) may time out on multi-turn conversations.
  // Single-pass mode (maxSteps=1) works reliably with any model size.

  describe('agentic loop (maxSteps > 1) — requires 7B+ model', () => {

    it('completes a multi-step form fill in one call', async () => {
      // NOTE: Skip this test on models < 7B. The multi-turn
      // conversation is too large for small models to process quickly.
      if (!process.env['CI']) {
        console.log('  (skipped: requires 7B+ model for reliable ReAct loop)');
        return;
      }

      await browser.url('https://the-internet.herokuapp.com/login');

      const result = await browser.agent(
        'fill "tomsmith" into username, "SuperSecretPassword!" into password, then click Login',
        { maxSteps: 3, maxActions: 3 },
      );

      expect(result.goalAchieved).toBe(true);

      // Inspect the ReAct loop history
      for (const step of result.steps) {
        console.log(`  Step ${step.step}: ${step.actions.length} action(s), done=${step.done}`);
      }

      // Verify post-login state
      if (result.goalAchieved) {
        const secureArea = await browser.$('h2=Secure Area');
        await expect(secureArea).toBeDisplayed();
      }
    });
  });

  // ── Mode selection guidance ──────────────────────────────────

  describe('choosing the right mode', () => {

    it('uses single-pass for simple one-shot actions (recommended)', async () => {
      // Pattern: stable page, single known interaction → single-pass.
      // This is the recommended default — fast, reliable, works with
      // any model size including 3-4B local models.
      await browser.url('https://the-internet.herokuapp.com/');
      const result = await browser.agent('click Checkboxes', { maxSteps: 1 });

      expect(result.totalSteps).toBe(1);
      expect(result.goalAchieved).toBe(true);
    });

    it('single-pass handles multi-action requests too', async () => {
      // Even with maxSteps=1, a single LLM call can return MULTIPLE
      // actions. Single-pass doesn't mean single-action.
      await browser.url('https://the-internet.herokuapp.com/login');

      const result = await browser.agent(
        'type tomsmith into username and SuperSecretPassword! into password',
        { maxSteps: 1, maxActions: 2 },
      );

      expect(result.totalSteps).toBe(1);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);

      // All actions executed in one pass
      await expect($('#username')).toHaveValue('tomsmith');
      await expect($('#password')).toHaveValue('SuperSecretPassword!');
    });
  });
});
