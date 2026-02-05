import { browser } from '@wdio/globals';

describe('Mobile Agent', () => {
  it('should navigate to Account and write', async () => {
    await browser.agent('skip the onboarding');

    await browser.agent('accept all cookies');
    await browser.agent('go to Account');

    await browser.agent('fill in admin into username field and password into password field');

    const emailInputElement = $('android=new UiSelector().resourceId("uk.co.brightec.ziffit.dev:id/field_email")');
    await expect(emailInputElement).toHaveText('admin');
  });
});