import { browser } from '@wdio/globals';

describe('Mobile Agent', () => {
  it('should navigate to Account and write', async () => {
    // Simple commands: single-pass is enough, no loop overhead
    await browser.agent('skip the onboarding', { maxSteps: 1 });
    await browser.agent('accept all cookies', { maxSteps: 1 });
    await browser.agent('go to Account', { maxSteps: 1 });

    // Multi-step goal: use the agentic loop for fill + verify
    await browser.agent('fill in admin into username field and password into password field', { maxSteps: 3 });

    const emailInputElement = $('android=new UiSelector().resourceId("uk.co.brightec.ziffit.dev:id/field_email")');
    await expect(emailInputElement).toHaveText('admin');
  });
});