/**
 * Use Case 1: browser.agent(prompt) — Natural Language Command Execution
 *
 * Single-pass execution: one LLM call → N actions. Fast, predictable.
 * Best for: "click the Login Portal", "fill in the form fields".
 */

describe('Use Case 1: browser.agent() — natural language commands', () => {

  const BASE = 'https://webdriveruniversity.com';

  it('executes a simple click instruction', async () => {
    await browser.url(BASE + '/Login-Portal/index.html');

    const result = await browser.agent('click the Login button');

    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.actions[0].type).toBe('CLICK');

    // Login button triggers a JS alert — dismiss it
    try { await browser.dismissAlert(); } catch { /* no alert */ }
  });

  it('types text into a form field', async () => {
    await browser.url(BASE + '/Contact-Us/contactus.html');

    const result = await browser.agent('type "john.doe@test.com" into the email address field');

    expect(result.actions[0].type).toBe('SET_VALUE');
    expect(result.actions[0].value).toContain('john.doe');

    const emailField = await browser.$('input[name="email"]');
    await expect(emailField).toHaveValue('john.doe@test.com');
  });

  it('handles multi-action requests in a single pass', async () => {
    await browser.url(BASE + '/Contact-Us/contactus.html');

    const result = await browser.agent(
      'fill "John" into first name and "Doe" into last name',
      { maxActions: 2 },
    );

    expect(result.actions.length).toBeGreaterThanOrEqual(1);

    await expect(browser.$('input[name="first_name"]')).toHaveValue('John');
    await expect(browser.$('input[name="last_name"]')).toHaveValue('Doe');
  });

  it('provides action metadata for assertions', async () => {
    await browser.url(BASE + '/Contact-Us/contactus.html');

    const result = await browser.agent('click the SUBMIT button');

    expect(result.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: expect.any(String), target: expect.any(String) }),
      ]),
    );
  });
});
