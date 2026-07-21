import type { FixingSuggestionsConfig, HealConfig, PromptInput } from '../types';
import type { ChainablePromiseElement } from 'webdriverio';
import { healSelector } from './healer';
import { suggestFix } from './healer';
import { healingReport } from './report';
import { fixingSuggestionsStore } from './fixing-suggestions';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

// ── Shared selector tracker ─────────────────────────────────────

/**
 * Install a single $() overwrite that tracks element → selector mappings
 * in a WeakMap. Returns getSelector() which resolves selector from either
 * the element's .selector property or the WeakMap fallback.
 *
 * NOTE: $$() (multi-element lookup) is NOT tracked. Elements obtained via
 * $$() won't have their selectors in the WeakMap, so healing will rethrow
 * the original error for those element interactions.
 */
function createSelectorTracker(browser: WebdriverIO.Browser): {
  getSelector: (ctx: unknown) => string | undefined;
} {
  const elementSelectors = new WeakMap<object, string>();

  browser.overwriteCommand('$', function (origCommand, selector: string) {
    const el = origCommand(selector);
    if (el && typeof el === 'object') {
      elementSelectors.set(el, selector);
    }
    return el;
  });

  function getSelector(ctx: unknown): string | undefined {
    if (ctx && typeof ctx === 'object') {
      const obj = ctx as Record<string, unknown>;
      if (typeof obj['selector'] === 'string') return obj['selector'];
      return elementSelectors.get(ctx);
    }
    return undefined;
  }

  return { getSelector };
}

// ── Auto-Heal Interceptor ───────────────────────────────────────

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
  request: (prompt: PromptInput) => Promise<string>,
  snapshotType?: 'a11y' | 'elements',
): void {
  if (!config.enabled) return;
  if (!config.commands || config.commands.length === 0) return;

  log.info(`[Auto-Heal] Enabled for: ${config.commands.join(', ')} (maxAttempts: ${config.maxAttempts})`);

  const { getSelector } = createSelectorTracker(browser);

  const maxAttempts = config.maxAttempts ?? 1;

  const settleDelay = config.settleDelay ?? 200;

  const waitForHealing = config.waitForHealing ?? 1500;

  // Install interceptor for each configured command
  for (const command of config.commands) {
    browser.overwriteCommand(command, async function (origCommand, ...args: unknown[]) {
      const selector = getSelector(this);
      return withHeal(browser, command, selector, origCommand, args, request, maxAttempts, settleDelay, waitForHealing, snapshotType);
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
    case 'tap':
      return el.tap();
    case 'setValue':
      return el.setValue(args[0] as string);
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
  request: (prompt: PromptInput) => Promise<string>,
  maxAttempts: number,
  settleDelay: number,
  waitForHealing: number,
  snapshotType?: 'a11y' | 'elements',
): Promise<unknown> {
  // Cap waitForTimeout so healing kicks in quickly instead of
  // waiting the full WDIO default on a known-broken selector.
  const originalTimeout = browser.options.waitforTimeout ?? 5000;
  browser.options.waitforTimeout = Math.min(originalTimeout, waitForHealing);

  try {
    return await origCommand(...args);
  } catch (error) {
    if (!selector) {
      log.warn(`[Auto-Heal] No selector available for "${commandName}" — cannot heal`);
      throw error;
    }
    const msg = (error as Error)?.message ?? '';
    log.debug(`[Auto-Heal] "${commandName}" failed for "${selector}": ${msg.substring(0, 120)}`);

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
      await new Promise((resolve) => setTimeout(resolve, settleDelay));
      return origCommand(...args);
    }

    // ── Invalid element state / not interactable: protocol issue ──
    if (msg.includes('invalid element state') || msg.includes('element not interactable')) {
      throw error;
    }

    // ── Element not found: selector is stale ──
    if (!isElementNotFoundError(error)) throw error;

    log.warn(`[Auto-Heal] Command "${commandName}" failed for selector "${selector}". Attempting LLM heal...`);

    const healedSelector = await healSelector(browser, selector, commandName, request, maxAttempts, snapshotType);

    if (!healedSelector) {
      healingReport.addEvent({
        command: commandName,
        originalSelector: selector,
        fixable: false,
        suggestion: 'Element not found in page snapshot — update selector manually',
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
        fixable: true,
        suggestion: `Replace "${selector}" with "${healedSelector}"`,
      });
      log.info(`[Auto-Heal] Healed "${selector}" → "${healedSelector}"`);
      return result;
    } catch (retryError) {
      healingReport.addEvent({
        command: commandName,
        originalSelector: selector,
        healedSelector,
        fixable: false,
        suggestion: `LLM suggested "${healedSelector}" but retry failed — verify element state`,
        error: (retryError as Error).message,
      });
      log.warn(`[Auto-Heal] Healed selector "${healedSelector}" also failed.`);
      throw error; // throw the original error
    }
  } finally {
    browser.options.waitforTimeout = originalTimeout;
  }
}

async function captureSuggestion(
  browser: WebdriverIO.Browser,
  command: string,
  selector: string | undefined,
  origCommand: Function,
  args: unknown[],
  request: (prompt: PromptInput) => Promise<string>,
  snapshotType?: 'a11y' | 'elements',
): Promise<unknown> {
  try {
    return await origCommand(...args);
  } catch (error) {
    if (selector && isElementNotFoundError(error)) {
      log.info(`[FixingSuggestions] Capturing suggestion for "${selector}" (${command})`);
      const suggestion = await suggestFix(browser, selector, command, request, snapshotType);
      if (suggestion) {
        fixingSuggestionsStore.addSuggestion({
          command,
          originalSelector: selector,
          suggestedSelector: suggestion.selector,
          reasoning: suggestion.reasoning,
        });
      }
    }
    // Always re-throw — never retry
    throw error;
  }
}

function isElementNotFoundError(error: unknown): boolean {
  const msg = (error as Error)?.message ?? '';
  const errorCode = (error as Record<string, unknown>)?.error as string | undefined;

  return (
    msg.includes('element not found') ||
    msg.includes("element wasn't found") ||
    msg.includes('no such element') ||
    msg.includes('Could not find element') ||
    msg.includes('could not be located') ||                          // Appium
    errorCode === 'no such element' ||                              // W3C protocol
    (msg.includes("Can't call") && msg.includes("because element wasn't found")) ||
    msg.includes('waitForExist') ||
    (msg.includes('element ("') && msg.includes('") not found')) ||
    msg.includes('scroll to the element') ||                        // Appium tap auto-scroll failure
    msg.includes('Could not scroll')                                // generic scroll failure
  );
}

// ── Fixing Suggestions interceptor ──────────────────────────────

/**
 * Install fixing suggestions interceptors on the browser object.
 *
 * Differs from autoHeal: never retries. Only captures element-not-found errors,
 * asks the LLM for a suggested selector fix, and stores it for reporting.
 */
export function installFixingSuggestionsInterceptor(
  browser: WebdriverIO.Browser,
  config: FixingSuggestionsConfig,
  request: (prompt: PromptInput) => Promise<string>,
  snapshotType?: 'a11y' | 'elements',
): void {
  if (!config.enabled) return;
  if (!config.commands || config.commands.length === 0) return;

  log.info(`[FixingSuggestions] Enabled for: ${config.commands.join(', ')}`);

  const { getSelector } = createSelectorTracker(browser);

  for (const command of config.commands) {
    browser.overwriteCommand(command, async function (origCommand, ...args: unknown[]) {
      const selector = getSelector(this);
      return captureSuggestion(browser, command, selector, origCommand, args, request, snapshotType);
    }, true);
  }
}

// ── Combined Interceptor (both features enabled) ─────────────────

/**
 * Install both auto-heal and fixing-suggestions interceptors using a
 * single $() overwrite and a single element-scoped overwrite per command.
 *
 * autoHeal takes priority: commands in autoHeal get healing wrappers;
 * fixingSuggestions only applies to commands NOT already covered by autoHeal.
 */
export function installCombinedInterceptors(
  browser: WebdriverIO.Browser,
  healConfig: HealConfig,
  fixConfig: FixingSuggestionsConfig,
  request: (prompt: PromptInput) => Promise<string>,
  snapshotType?: 'a11y' | 'elements',
): void {
  const healCommands = healConfig.commands ?? [];
  const fixCommands = fixConfig.commands ?? [];

  if (healCommands.length === 0 && fixCommands.length === 0) return;

  const { getSelector } = createSelectorTracker(browser);

  const maxAttempts = healConfig.maxAttempts ?? 1;
  const settleDelay = healConfig.settleDelay ?? 200;
  const waitForHealing = healConfig.waitForHealing ?? 1500;

  // Auto-heal wrappers for all heal commands
  for (const command of healCommands) {
    browser.overwriteCommand(command, async function (origCommand, ...args: unknown[]) {
      const selector = getSelector(this);
      return withHeal(browser, command, selector, origCommand, args, request,
        maxAttempts, settleDelay, waitForHealing, snapshotType);
    }, true);
  }

  // Fixing suggestions only for commands NOT already covered by autoHeal
  for (const command of fixCommands) {
    if (healCommands.includes(command)) continue;
    browser.overwriteCommand(command, async function (origCommand, ...args: unknown[]) {
      const selector = getSelector(this);
      return captureSuggestion(browser, command, selector, origCommand, args, request, snapshotType);
    }, true);
  }
}
