import 'webdriverio';
import { getElements } from '@wdio/elements';
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
 * Take a compact snapshot using @wdio/elements' getElements.
 * Serializes the element array to text for the LLM prompt.
 * Each element gets an eN virtual ID mapped to its qualifiedSelector.
 */
export async function getSnapshot(
  browser: WebdriverIO.Browser,
  options?: { inViewportOnly?: boolean; maxElements?: number },
): Promise<{ text: string; elements: Record<string, { selector: string; qualifiedSelector?: string }> }> {
  try {
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
      text = `(showing ${limit} of ${rawElements.length} interactive elements)\n${text}`;
    }

    log.debug(`[Agent] Snapshot captured: ${sliced.length} elements${limit ? ` (trimmed from ${rawElements.length})` : ''}`);
    return { text, elements: elementsMap };
  } catch (error) {
    log.error('[Agent] Snapshot failed:', error);
    return { text: '[Snapshot error]', elements: {} };
  }
}
