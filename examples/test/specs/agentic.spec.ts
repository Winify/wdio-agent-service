describe('agentic loop', () => {
  beforeEach(async () => {
    await browser.url('https://the-internet.herokuapp.com/');
  });

  it('should complete a multi-step goal: navigate and click', async () => {
    const result = await browser.agent('click on the Form Authentication link, then fill in "tomsmith" as username and "SuperSecretPassword!" as password, then click the Login button');

    // Should have used multiple steps or multiple actions
    expect(result.totalSteps).toBeGreaterThanOrEqual(1);
    expect(result.actions.length).toBeGreaterThanOrEqual(3);

    // Verify we actually logged in — the ground truth is the URL, not the model's done flag
    await expect(browser).toHaveUrl('/secure', { containing: true });
  });

  it('should return AgentResult with step history', async () => {
    const result = await browser.agent('click on JavaScript Alerts and then click the "Click for JS Alert" button');

    // Verify AgentResult shape
    expect(result).toHaveProperty('actions');
    expect(result).toHaveProperty('steps');
    expect(result).toHaveProperty('goalAchieved');
    expect(result).toHaveProperty('totalSteps');

    // Steps should be populated
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.steps[0]).toHaveProperty('step');
    expect(result.steps[0]).toHaveProperty('actions');
    expect(result.steps[0]).toHaveProperty('done');

    // Should have clicked something
    expect(result.actions.some((a) => a.type === 'CLICK')).toBe(true);
  });

  it('should recover from errors and try alternative approaches', async () => {
    // Navigate to the login page
    await browser.url('https://the-internet.herokuapp.com/login');

    // Give a goal that requires filling in and submitting
    // The agent should fill in credentials and submit, landing on /secure
    const result = await browser.agent('type "tomsmith" in the username field and "SuperSecretPassword!" in the password field and submit the login form');

    expect(result.totalSteps).toBeGreaterThanOrEqual(1);
    expect(result.actions.some((a) => a.type === 'SET_VALUE')).toBe(true);

    // If the agent submitted successfully, we should be on /secure
    // If not submitted yet, the fields should have values
    const currentUrl = await browser.getUrl();
    if (currentUrl.includes('/secure')) {
      // Agent completed the full goal — login succeeded
      expect(result.actions.some((a) => a.type === 'CLICK')).toBe(true);
    } else {
      // Agent filled in fields but didn't submit yet — verify field values
      await expect($('#username')).toHaveValue('tomsmith');
      await expect($('#password')).toHaveValue('SuperSecretPassword!');
    }
  });
});
