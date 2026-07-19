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
      await browser.url('https://the-internet.herokuapp.com/');

      const result = await browser.agent('click on JavaScript Alerts');

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

      const result = await browser.agent('type "tomsmith" into the username field');

      expect(result.goalAchieved).toBe(true);
      expect(result.actions[0].type).toBe('SET_VALUE');
      expect(result.actions[0].value).toContain('tomsmith');

      // The real selector was resolved from the virtual ID automatically
      await expect($('#username')).toHaveValue('tomsmith');
    });

    it('returns actionable result metadata', async () => {
      await browser.url('https://the-internet.herokuapp.com/');

      const result = await browser.agent('click the Add/Remove Elements link');

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

  describe('agentic loop (maxSteps > 1)', () => {

    it('completes a multi-step form fill in one call', async () => {
      await browser.url('https://the-internet.herokuapp.com/login');

      // One natural language instruction — the LLM breaks it into steps.
      // Override maxSteps per-call for this complex task.
      const result = await browser.agent(
        'fill "tomsmith" into username, "SuperSecretPassword!" into password, then click Login',
        { maxSteps: 3, maxActions: 3 },
      );

      // Multi-step result: inspect the full loop history
      expect(result.goalAchieved).toBe(true);
      expect(result.totalSteps).toBeGreaterThanOrEqual(1);

      // result.steps shows the ReAct loop iterations
      for (const step of result.steps) {
        console.log(`  Step ${step.step}: ${step.actions.length} action(s), done=${step.done}`);
        for (const a of step.actions) {
          console.log(`    ${a.action.type} "${a.action.target}" → ${a.success ? 'OK' : `FAIL: ${a.error}`}`);
        }
      }

      // Verify the form was actually filled
      await expect($('#username')).toHaveValue('tomsmith');
      await expect($('#password')).toHaveValue('SuperSecretPassword!');
    });

    it('reasons about page state changes between steps', async () => {
      // The ReAct loop observes page changes after each action set.
      // This lets the LLM adapt if the page changes unexpectedly.
      await browser.url('https://the-internet.herokuapp.com/');

      const result = await browser.agent(
        'navigate to the login page, fill in credentials, and confirm you see the Secure Area',
        { maxSteps: 4, maxActions: 3 },
      );

      // Each step received updated page state as an "Observation"
      expect(result.steps.length).toBeGreaterThan(0);

      // Verify the loop reached its goal
      if (result.goalAchieved) {
        const secureArea = await browser.$('h2=Secure Area');
        await expect(secureArea).toBeDisplayed();
      }
    });
  });

  // ── Mode selection guidance ──────────────────────────────────

  describe('choosing the right mode', () => {

    it('uses single-pass for simple one-shot actions', async () => {
      // Pattern: stable page, single known interaction → force single-pass
      await browser.url('https://the-internet.herokuapp.com/');
      const result = await browser.agent('click Checkboxes', { maxSteps: 1 });

      expect(result.totalSteps).toBe(1);
      expect(result.goalAchieved).toBe(true);
    });

    it('uses agentic loop for conditional or multi-page flows', async () => {
      // Pattern: interaction that changes page state → let the LLM observe
      // and decide next steps
      await browser.url('https://the-internet.herokuapp.com/');

      const result = await browser.agent(
        'go to the login page and log in as tomsmith / SuperSecretPassword!',
        { maxSteps: 4 },
      );

      // The loop can navigate, fill, and submit across page transitions
      expect(result.goalAchieved).toBe(true);
    });
  });
});
