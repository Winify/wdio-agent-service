describe('wdio-agent-service', () => {
  it('should navigate and click using natural language', async () => {
    const navResult = await browser.agent('go to https://the-internet.herokuapp.com/');
    expect(navResult.goalAchieved).toBe(true);
    expect(navResult.actions.some((a) => a.type === 'NAVIGATE')).toBe(true);

    const clickResult = await browser.agent('click on JavaScript Alerts');
    expect(clickResult.goalAchieved).toBe(true);
    expect(clickResult.actions.some((a) => a.type === 'CLICK')).toBe(true);
    await expect(browser).toHaveUrl('/javascript_alerts', { containing: true });
  });

  it('should fill in form fields', async () => {
    await browser.agent('go to https://the-internet.herokuapp.com/');
    await browser.agent('click on Form Authentication');

    const result = await browser.agent('fill in admin into username field and password into password field');

    expect(result.goalAchieved).toBe(true);
    expect(result.actions.some((a) => a.type === 'SET_VALUE')).toBe(true);
    const setValueAction = result.actions.find((a) => a.type === 'SET_VALUE');
    expect(setValueAction?.value?.toLowerCase()).toContain('admin');
    await expect($('#username')).toHaveValue('admin');
    await expect($('#password')).toHaveValue('password');
  });
});
