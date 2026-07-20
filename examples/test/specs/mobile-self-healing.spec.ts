import { browser, $ } from '@wdio/globals';

describe('Use Case 2: Mobile Self-Healing', () => {

  it('should heal a broken selector and still perform the action', async () => {
    // Broken selector — the healer must find and click the real element.
    // No try-catch: if healing fails, the error fails the test.
    await browser.$('~Appp').click();

    // Verify via emulator: click actually navigated to App sub-menu.
    // This proves the healer found the right element AND the action succeeded.
    await expect($('~Alarm')).toBeDisplayed();
  });

  it('should populate the healing report with the fix', async () => {
    const report = await browser.getHealingReport?.() ?? {
      totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [],
    };

    expect(report.totalEvents).toBeGreaterThanOrEqual(1);
    expect(report.fixableCount).toBeGreaterThanOrEqual(1);

    const healed = report.events.find((e) => e.fixable);
    expect(healed).toBeTruthy();
    expect(healed!.command).toBe('click');
    expect(healed!.healedSelector).toBeTruthy();
  });
});
