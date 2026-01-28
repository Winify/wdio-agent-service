describe('agent.service.ts', () => {
  it('should click on JavaScript Alerts link', async () => {
    await browser.agent('go to https://the-internet.herokuapp.com/');
    const result = await browser.agent('click on JavaScript Alerts');

    expect(result.some((a) => a.type === 'CLICK')).toBe(true);
    await expect(browser).toHaveUrl('/javascript_alerts', { containing: true });
  });

  it('should fill in a form field', async () => {
    await browser.agent('go to https://the-internet.herokuapp.com/');
    await browser.agent('click on Form Authentication');

    const result = await browser.agent('fill in admin into username field and password into password field');

    expect(result.some((a) => a.type === 'SET_VALUE')).toBe(true);
    const setValueAction = result.find((a) => a.type === 'SET_VALUE');
    expect(setValueAction?.value?.toLowerCase()).toContain('admin');
    await expect($('#username')).toHaveValue('admin');
    await expect($('#password')).toHaveValue('password');
  });
});
