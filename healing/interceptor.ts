import type { HealConfig, PromptInput } from '../types';
import type { ChainablePromiseElement } from 'webdriverio';
import { healSelector } from './healer';
import { healingReport } from './report';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

/**
 * Install auto-heal interceptors on the browser object.
 *
 * Uses WDIO's overwriteCommand to wrap $() and element-scoped commands.
 * When an element is not found, the healer snapshots the page,
 * asks the LLM to find the intended element, and retries with
 * the healed selector.
 */
export function installInterceptors(
  browser: WebdriverIO.Browser,
  config: HealConfig,
  send: (prompt: PromptInput) => Promise<string>,
): void {
  if (!config.enabled) return;
  if (!config.commands || config.commands.length === 0) return;

  log.info(`[Auto-Heal] Enabled for: ${config.commands.join(', ')} (maxAttempts: ${config.maxAttempts})`);

  // WeakMap: element object → selector string. Populated from the $ interceptor
  // and read back in element-scoped commands. Avoids the single-string race
  // where $('#a') then $('#b') then a.click() heals with #b's selector.
  const elementSelectors = new WeakMap<object, string>();

  // Track selectors from $() lookups so element-scoped commands can retrieve
  // the correct selector even for elements created before the interceptor.
  browser.overwriteCommand('$', function (origCommand, selector: string) {
    const el = origCommand(selector);
    if (el && typeof el === 'object') {
      elementSelectors.set(el, selector);
    }
    return el;
  });

  // Resolve selector from element context
  function getSelector(ctx: unknown): string | undefined {
    if (ctx && typeof ctx === 'object') {
      const obj = ctx as Record<string, unknown>;
      if (typeof obj['selector'] === 'string') return obj['selector'];
      return elementSelectors.get(ctx);
    }
    return undefined;
  }

  const maxAttempts = config.maxAttempts ?? 2;

  // Install interceptor for each configured command
  for (const command of config.commands) {
    browser.overwriteCommand(command, async function (origCommand, ...args: unknown[]) {
      const selector = getSelector(this);
      return withHeal(browser, command, selector, origCommand, args, send, maxAttempts);
    }, true);
  }
}

// ── Command dispatch after healing ─────────────────────────────

async function executeElementCommand(
  el: ChainablePromiseElement,
  command: string,
  args: unknown[],
): Promise<unknown> {
  switch (command) {
    case 'click':
      return el.click();
    case 'setValue':
      return el.setValue(args[0] as string);
    case 'tap':
      return (el as unknown as { tap: () => Promise<unknown> }).tap();
    default:
      return el;
  }
}

async function withHeal(
  browser: WebdriverIO.Browser,
  commandName: string,
  selector: string | undefined,
  origCommand: Function,
  args: unknown[],
  send: (prompt: PromptInput) => Promise<string>,
  maxAttempts: number,
): Promise<unknown> {
  try {
    return await origCommand(...args);
  } catch (error) {
    if (!selector) throw error;
    const msg = (error as Error)?.message ?? '';

    // ── Stale element reference: DOM changed between find and act ──
    if (msg.includes('stale element reference')) {
      log.warn(`[Auto-Heal] Stale element "${selector}", re-finding...`);
      const refound = await browser.$(selector);
      return executeElementCommand(refound, commandName, args);
    }

    // ── Click intercepted: correct element, just covered by another ──
    if (msg.includes('element click intercepted') || msg.includes('other element would receive the click')) {
      log.warn(`[Auto-Heal] Click intercepted for "${selector}", scrolling into view...`);
      const el = await browser.$(selector);
      await el.scrollIntoView({ block: 'center', inline: 'center' });
      // Let animations settle
      await new Promise((resolve) => setTimeout(resolve, 200));
      return origCommand(...args);
    }

    // ── Invalid element state / not interactable: protocol issue ──
    if (msg.includes('invalid element state') || msg.includes('element not interactable')) {
      throw error;
    }

    // ── Element not found: selector is stale ──
    if (!isElementNotFoundError(error)) throw error;

    log.warn(`[Auto-Heal] Command "${commandName}" failed for selector "${selector}". Attempting LLM heal...`);

    const healedSelector = await healSelector(browser, selector, commandName, send, maxAttempts);

    if (!healedSelector) {
      healingReport.addEvent({
        command: commandName,
        originalSelector: selector,
        success: false,
        error: 'Could not heal selector',
      });
      log.warn(`[Auto-Heal] Could not heal "${selector}". Throwing original error.`);
      throw error;
    }

    try {
      const healedElement = await browser.$(healedSelector);
      const result = await executeElementCommand(healedElement, commandName, args);

      healingReport.addEvent({
        command: commandName,
        originalSelector: selector,
        healedSelector,
        success: true,
      });
      log.info(`[Auto-Heal] Successfully healed "${selector}" → "${healedSelector}"`);
      return result;
    } catch (retryError) {
      healingReport.addEvent({
        command: commandName,
        originalSelector: selector,
        healedSelector,
        success: false,
        error: (retryError as Error).message,
      });
      log.warn(`[Auto-Heal] Healed selector "${healedSelector}" also failed.`);
      throw error; // throw the original error
    }
  }
}

function isElementNotFoundError(error: unknown): boolean {
  const msg = (error as Error)?.message ?? '';

  return (
    msg.includes('element not found') ||
    msg.includes("element wasn't found") ||
    msg.includes('no such element') ||
    msg.includes('Could not find element') ||
    (msg.includes("Can't call") && msg.includes("because element wasn't found")) ||
    msg.includes('waitForExist') ||
    (msg.includes('element ("') && msg.includes('") not found'))
  );
}
