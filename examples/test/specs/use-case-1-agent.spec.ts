/**
 * Use Case 1: browser.agent(prompt) — Natural Language Command Execution
 *
 * Two execution modes:
 *   - Single-pass (maxSteps=1): one LLM call → N actions. Fast, predictable.
 *     Best for: "click the Login Portal", "fill in the form fields".
 *   - Agentic loop (maxSteps>1): observe → think → act → repeat.
 *     Best for: multi-step flows, conditional logic. Requires 7B+ model.
 */

describe('Use Case 1: browser.agent() — natural language commands', () => {

  const BASE = 'https://webdriveruniversity.com';

  // ── Single-pass mode (recommended default) ───────────────────

  describe('single-pass mode (maxSteps=1)', () => {

    it('executes a simple click instruction', async () => {
      // Navigate directly to a page with buttons to click
      await browser.url(BASE + '/Login-Portal/index.html');

      const result = await browser.agent('click the Login button', { maxSteps: 1 });

      expect(result.goalAchieved).toBe(true);
      expect(result.totalSteps).toBe(1);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);
      expect(result.actions[0].type).toBe('CLICK');

      // Login button triggers a JS alert — dismiss it
      try { await browser.dismissAlert(); } catch { /* no alert */ }
    });

    it('types text into a form field', async () => {
      await browser.url(BASE + '/Contact-Us/contactus.html');

      const result = await browser.agent('type "john.doe@test.com" into the email address field', { maxSteps: 1 });

      expect(result.goalAchieved).toBe(true);
      expect(result.actions[0].type).toBe('SET_VALUE');
      expect(result.actions[0].value).toContain('john.doe');

      const emailField = await browser.$('input[name="email"]');
      await expect(emailField).toHaveValue('john.doe@test.com');
    });

    it('handles multi-action requests in a single pass', async () => {
      // Even with maxSteps=1, a single LLM call can return MULTIPLE actions.
      await browser.url(BASE + '/Contact-Us/contactus.html');

      const result = await browser.agent(
        'fill "John" into first name and "Doe" into last name',
        { maxSteps: 1, maxActions: 2 },
      );

      expect(result.totalSteps).toBe(1);
      expect(result.actions.length).toBeGreaterThanOrEqual(1);

      await expect(browser.$('input[name="first_name"]')).toHaveValue('John');
      await expect(browser.$('input[name="last_name"]')).toHaveValue('Doe');
    });
  });

  // ── AgentResult introspection ─────────────────────────────────

  describe('inspecting AgentResult', () => {

    it('provides full result metadata for assertions', async () => {
      await browser.url(BASE + '/Contact-Us/contactus.html');

      const result = await browser.agent('click the SUBMIT button', { maxSteps: 1 });

      // Full result shape — even with 0 returned actions (button click
      // that triggers a form action), the result has complete metadata.
      expect(result).toMatchObject({
        goalAchieved: true,
        totalSteps: 1,
        steps: expect.arrayContaining([
          expect.objectContaining({
            step: 1,
            done: true,
          }),
        ]),
      });
    });
  });

  // ── Agentic ReAct loop (requires 7B+ model) ──────────────────

  describe('agentic loop (maxSteps > 1) — requires 7B+ model', () => {

    it('completes a login flow with observation feedback', async () => {
      if (!process.env['CI']) {
        console.log('  (skipped: requires 7B+ model for reliable ReAct loop)');
        return;
      }

      await browser.url(BASE + '/Login-Portal/index.html');

      const result = await browser.agent(
        'enter "webdriver" as username, "webdriver123" as password, then click Login',
        { maxSteps: 3, maxActions: 3 },
      );

      expect(result.goalAchieved).toBe(true);

      // Inspect the ReAct loop history
      for (const step of result.steps) {
        console.log(`  Step ${step.step}: ${step.actions.length} action(s), done=${step.done}`);
      }
    });
  });
});
