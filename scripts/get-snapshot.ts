import 'webdriverio';
import { getSnapshot as elementsGetSnapshot } from '@wdio/elements';
import type { SnapshotResult } from '@wdio/elements';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

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

    log.debug(`[Agent] Snapshot captured: ${Object.keys(result.elements).length} elements`);
    return result;
  } catch (error) {
    log.error('[Agent] Snapshot failed:', error);
    return { text: '[Snapshot error]', elements: {} };
  }
}

// Re-export for convenience
export type { SnapshotResult } from '@wdio/elements';
