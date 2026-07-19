import 'webdriverio';
import { getSnapshot as elementsGetSnapshot } from '@wdio/elements';
import type { SnapshotResult } from '@wdio/elements';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

/** Maximum elements to include in the snapshot for small-model performance. */
const MAX_ELEMENTS = 40;

/**
 * Trim the snapshot text to at most `limit` elements (lines with eN IDs).
 * Keeps structural lines (no eN IDs) and the first N interactive elements.
 */
function trimSnapshot(snapshot: SnapshotResult, limit: number): SnapshotResult {
  const lines = snapshot.text.split('\n');
  const trimmed: string[] = [];
  const trimmedElements: Record<string, typeof snapshot.elements[string]> = {};
  let count = 0;

  for (const line of lines) {
    const eMatch = line.match(/^\s*(e\d+)\s/);
    if (eMatch) {
      if (count >= limit) continue;
      const id = eMatch[1];
      if (snapshot.elements[id]) {
        trimmedElements[id] = snapshot.elements[id];
        count++;
      }
    }
    trimmed.push(line);
  }

  if (count >= limit) {
    trimmed.push(`  ... (${Object.keys(snapshot.elements).length - limit} more elements omitted)`);
  }

  return { text: trimmed.join('\n'), elements: trimmedElements };
}

/**
 * Take a snapshot of the current page/app state using @wdio/elements.
 * Returns the native snapshot format with `text` (tree with e1, e2, ... IDs)
 * and `elements` map (eN → SnapshotElement).
 */
export async function getSnapshot(
  browser: WebdriverIO.Browser,
  options?: { inViewportOnly?: boolean },
): Promise<SnapshotResult> {
  try {
    const result = await elementsGetSnapshot(browser, {
      inViewportOnly: options?.inViewportOnly ?? true,
    });

    if (!result || !result.text) {
      log.warn('[Agent] Snapshot returned empty result');
      return { text: '[No elements found]', elements: {} };
    }

    const trimmed = result.elements && Object.keys(result.elements).length > MAX_ELEMENTS
      ? trimSnapshot(result, MAX_ELEMENTS)
      : result;

    log.debug(`[Agent] Snapshot captured: ${Object.keys(trimmed.elements).length} elements${Object.keys(result.elements).length > MAX_ELEMENTS ? ` (trimmed from ${Object.keys(result.elements).length})` : ''}`);
    return trimmed;
  } catch (error) {
    log.error('[Agent] Snapshot failed:', error);
    return { text: '[Snapshot error]', elements: {} };
  }
}

// Re-export for convenience
export type { SnapshotResult } from '@wdio/elements';
