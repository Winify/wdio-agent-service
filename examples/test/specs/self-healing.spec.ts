/**
 * Use Case 2: Self-Healing with Healing Report
 *
 * When autoHeal is enabled, element-not-found errors trigger LLM healing.
 * Every healing event is tracked and accessible via browser.getHealingReport().
 * The AgentService.after() hook logs a summary automatically.
 *
 * Config: autoHeal: { enabled: true, commands: ['click', 'setValue'], maxAttempts: 2 }
 */

describe('Self-healing with healing report', () => {

  const BASE = 'https://the-internet.herokuapp.com';

  it('returns an empty report when no errors occurred', async () => {
    await browser.url(BASE + '/login');

    const report = await browser.getHealingReport!();

    expect(report.totalEvents).toBe(0);
    expect(report.fixableCount).toBe(0);
    expect(report.manualReviewCount).toBe(0);
    expect(report.events).toEqual([]);
  });

  it('does not trigger healing for valid selectors', async () => {
    await browser.url(BASE + '/login');

    const username = await browser.$('#username');
    await username.setValue('tomsmith');

    await expect(username).toHaveValue('tomsmith');

    const report = await browser.getHealingReport!();
    expect(report.totalEvents).toBe(0);
  });

  it('heals a broken selector, records the event, and retries the action', async () => {
    await browser.url(BASE + '/login');

    // Act: deliberately broken selector triggers element-not-found → LLM healer → retry
    const broken = await browser.$('#nonexistent-username');
    await broken.setValue('webdriver');

    // Assert: healing event recorded with full metadata
    const report = await browser.getHealingReport!();
    expect(report.totalEvents).toBeGreaterThanOrEqual(1);
    expect(report.fixableCount + report.manualReviewCount).toBe(report.totalEvents);

    const event = report.events.find(e => e.originalSelector === '#nonexistent-username');
    expect(event).toBeDefined();
    expect(event!.command).toBe('setValue');
    expect(event!.originalSelector).toBe('#nonexistent-username');
    expect(event!.fixable).toBe(true);
    expect(event!.healedSelector).toBeTruthy();
    expect(typeof event!.timestamp).toBe('number');

    // Assert: healed action succeeded — value was set on the real element
    const username = await browser.$('#username');
    await expect(username).toHaveValue('webdriver');
  });
});
