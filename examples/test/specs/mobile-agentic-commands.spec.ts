import { browser, $ } from '@wdio/globals';

describe('Use Case 1: Mobile Agentic Commands', () => {

  beforeEach(async () => {
    await browser.startActivity('io.appium.android.apis', '.ApiDemos');
  });

  it('should navigate from home screen into App sub-menu', async () => {
    await browser.agent('tap on App');

    // Verify via emulator: App sub-menu contains "Alarm" (not on home screen)
    await expect($('~Alarm')).toBeDisplayed();
  });

  it('should navigate from home screen into Animation sub-menu', async () => {
    await browser.agent('tap on Animation');

    // Verify via emulator: Animation sub-menu contains "Bouncing Balls"
    await expect($('~Bouncing Balls')).toBeDisplayed();
  });
});
