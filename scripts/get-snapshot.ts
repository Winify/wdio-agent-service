import 'webdriverio';
import { getElements, getSnapshot as wdioGetSnapshot } from '@wdio/elements';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

interface ElementInfo {
  name?: string;
  text?: string;
  role?: string;
  tag?: string;
  selector: string;
  qualifiedSelector?: string;
  [key: string]: unknown;
}

/**
 * Take a page/app snapshot.
 *
 * Two modes (controlled by snapshotType):
 * - 'elements' (default): uses getElements — flat list. Lean, produces resource-id/UiSelector selectors.
 *   Better for small models and healing.
 * - 'a11y': uses getSnapshot — rich accessibility tree with depth, roles, context.
 *   Token-heavy, produces ~accessibilityId selectors.
 */
export async function getSnapshot(
  browser: WebdriverIO.Browser,
  options?: {
    inViewportOnly?: boolean;
    snapshotType?: 'a11y' | 'elements';
    maxElements?: number;
  },
): Promise<{ text: string; elements: Record<string, { selector: string; qualifiedSelector?: string }> }> {
  const snapshotType = options?.snapshotType ?? 'elements';

  try {
    if (snapshotType === 'elements') {
      return getElementsSnapshot(browser, options);
    }
    return getA11ySnapshot(browser, options);
  } catch (error) {
    log.error('[Agent] Snapshot failed:', error);
    return { text: '[Snapshot error]', elements: {} };
  }
}

// ── a11y mode: getSnapshot ──────────────────────────────────────

async function getA11ySnapshot(
  browser: WebdriverIO.Browser,
  options?: { inViewportOnly?: boolean },
): Promise<{ text: string; elements: Record<string, { selector: string; qualifiedSelector?: string }> }> {
  const result = await wdioGetSnapshot(browser, {
    inViewportOnly: options?.inViewportOnly ?? true,
  });

  if (!result || !result.elements || Object.keys(result.elements).length === 0) {
    log.warn('[Agent] Snapshot returned empty result');
    return { text: result?.text ?? '[No interactive elements found]', elements: {} };
  }

  const count = Object.keys(result.elements).length;
  log.debug(`[Agent] Snapshot captured: ${count} elements (a11y mode)\n${result.text}`);
  log.debug(JSON.stringify(result.elements, null, 2));
  return { text: result.text, elements: result.elements };
}

// ── elements mode: getElements ──────────────────────────────────

async function getElementsSnapshot(
  browser: WebdriverIO.Browser,
  options?: { inViewportOnly?: boolean; maxElements?: number },
): Promise<{ text: string; elements: Record<string, { selector: string; qualifiedSelector?: string }> }> {
  const result = await getElements(browser, {
    inViewportOnly: options?.inViewportOnly ?? true,
  });

  if (!result || !result.elements || result.elements.length === 0) {
    log.warn('[Agent] Snapshot returned empty result');
    return { text: '[No interactive elements found]', elements: {} };
  }

  const rawElements = result.elements as ElementInfo[];
  const limit = options?.maxElements;
  const sliced = limit ? rawElements.slice(0, limit) : rawElements;

  const lines: string[] = [];
  const elementsMap: Record<string, { selector: string; qualifiedSelector?: string }> = {};

  for (let i = 0; i < sliced.length; i++) {
    const el = sliced[i];
    const id = `e${i + 1}`;
    const qSel = el.qualifiedSelector ?? el.selector;
    elementsMap[id] = { selector: el.selector, qualifiedSelector: el.qualifiedSelector };

    const label = el.name || el.text || el.role || el.tag || '';
    lines.push(`${id}: ${label} → ${qSel}`);
  }

  let text = lines.join('\n');
  if (limit && rawElements.length > limit) {
    text = `(showing ${limit} of ${rawElements.length} elements)\n${text}`;
  }

  log.debug(`[Agent] Snapshot captured: ${sliced.length} elements (elements mode)${limit ? ` (trimmed from ${rawElements.length})` : ''}\n${text}`);
  return { text, elements: elementsMap };
}
