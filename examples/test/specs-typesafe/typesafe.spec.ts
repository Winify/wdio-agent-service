/**
 * Jev (TypeSafe System One) backend — healing, fixing suggestions, single-action agent().
 *
 * Run with: OPENROUTER_API_KEY=... npx wdio run wdio.typesafe.conf.ts
 * Not part of the default `pnpm test` run (wdio.conf.ts globs ./test/specs only).
 */

import { browser } from '@wdio/globals';
import type { HealingEvent } from 'wdio-agent-service';

describe('Jev decision backend', () => {

  const BASE = 'https://the-internet.herokuapp.com';

  it('clicks an element through a Jev decision and reports a goal verdict', async () => {
    await browser.url(BASE + '/');

    const result = await browser.agent('click on JavaScript Alerts');

    expect(result.engine).toBe('jev');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].type).toBe('CLICK');
    expect(typeof result.goalVerified).toBe('boolean');
    await expect(browser).toHaveUrl('/javascript_alerts', { containing: true });
  });

  it('defers value-typing intents to the LLM path', async () => {
    await browser.url(BASE + '/login');

    const result = await browser.agent('type "tomsmith" into the username field');

    expect(result.engine).toBe('llm');
    await expect($('#username')).toHaveValue('tomsmith');
  });

  it('heals a broken selector with Jev and retries the action', async () => {
    await browser.url(BASE + '/login');

    const broken = await browser.$('#nonexistent-username');
    await broken.setValue('webdriver');

    const report = await browser.getHealingReport!();
    expect(report.totalEvents).toBeGreaterThanOrEqual(1);

    const event = report.events.find((e: HealingEvent) => e.originalSelector === '#nonexistent-username');
    expect(event).toBeDefined();
    expect(event!.command).toBe('setValue');
    expect(event!.fixable).toBe(true);
    expect(event!.healedSelector).toBeTruthy();

    await expect($('#username')).toHaveValue('webdriver');
  });
});
