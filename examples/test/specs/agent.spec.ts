/**
 * Use Case 1: browser.agent(prompt) — Natural Language Command Execution
 *
 * Single-pass: one LLM call → N actions. Fast, predictable.
 */

describe('Using natural language', () => {

  const BASE = 'https://the-internet.herokuapp.com';

  it('navigates to a URL via NAVIGATE action', async () => {
    const result = await browser.agent(`go to ${BASE}/`);

    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.actions[0].type).toBe('NAVIGATE');
  });

  it('clicks an element via CLICK action', async () => {
    await browser.url(BASE + '/');

    const result = await browser.agent('click on JavaScript Alerts');

    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.actions[0].type).toBe('CLICK');
    await expect(browser).toHaveUrl('/javascript_alerts', { containing: true });
  });

  it('types into a form field via SET_VALUE action', async () => {
    await browser.url(BASE + '/login');

    const result = await browser.agent('type "tomsmith" into the username field');

    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    expect(result.actions[0].type).toBe('SET_VALUE');
    expect(result.actions[0].value).toContain('tomsmith');
    await expect($('#username')).toHaveValue('tomsmith');
  });

  it('returns multiple actions in a single pass', async () => {
    await browser.url(BASE + '/login');

    const result = await browser.agent(
      'fill "tomsmith" into username and "SuperSecretPassword!" into password',
      { maxActions: 2 },
    );

    expect(result.actions.length).toBeGreaterThanOrEqual(1);

    await expect($('#username')).toHaveValue('tomsmith');
    await expect($('#password')).toHaveValue('SuperSecretPassword!');
  });
});
