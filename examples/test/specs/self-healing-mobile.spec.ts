import { browser } from '@wdio/globals';

describe('Using natural language on mobile testing', () => {

  it('should set a timer while healing the start button', async () => {
    await browser.agent('open timer');

    // eslint-disable-next-line wdio/no-pause
    await browser.pause(1500);

    await browser.agent('click 3 random numbers');

    await $('~start').tap();

    await browser.agent('close timer');

    const report = await browser.getHealingReport!();
    expect(report.totalEvents).toBe(1);
    expect(report.fixableCount).toBe(1);
    expect(report.events).toMatchObject([
      {
        command: 'tap',
        originalSelector: '~start',
        healedSelector: '~Start',
        fixable: true,
      },
    ]);
  });
});

