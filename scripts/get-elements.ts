import 'webdriverio';
import { encode } from '@toon-format/toon';
import {
  type AccessibilityNode,
  type BrowserElementInfo,
  getBrowserAccessibilityTree,
  getBrowserInteractableElements,
  getMobileVisibleElements,
  type MobileElementInfo,
} from '@wdio/mcp/snapshot';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

export type SnapshotType = 'visible' | 'a11y' | 'all';

export interface GetElementsOptions {
  /** Snapshot type. Default: 'visible' */
  type?: SnapshotType;
  /** TOON encoding format. 'yaml-like' simplifies to essential fields (better for smaller models), 'tabular' keeps all fields (more token-efficient for larger models). Default: 'yaml-like' */
  toonFormat?: 'yaml-like' | 'tabular';
}

type Platform = 'browser' | 'ios' | 'android';
type ElementsResult = BrowserElementInfo[] | MobileElementInfo[] | AccessibilityNode[];

function detectPlatform(browser: WebdriverIO.Browser): Platform {
  if (browser.isIOS) return 'ios';
  if (browser.isAndroid) return 'android';
  return 'browser';
}

/**
 * Fetch elements based on platform and snapshot type
 */
async function fetchElements(
  browser: WebdriverIO.Browser,
  platform: Platform,
  type: SnapshotType,
): Promise<ElementsResult> {
  try {
    if (platform !== 'browser') {
      return await getMobileVisibleElements(browser, platform, { filterOptions: { visibleOnly: false } });
    }
    if (type === 'a11y') {
      return await getBrowserAccessibilityTree(browser);
    }

    return await getBrowserInteractableElements(browser, {
      elementType: type === 'all' ? 'all' : 'interactable',
    });
  } catch (error) {
    log.error(`[Agent] Error fetching elements (platform: ${platform}, type: ${type}):`, error);
    return [];
  }
}

/**
 * Simplify element to essential fields only.
 * This produces YAML-like TOON output which works better with smaller models.
 */
function simplifyElement(obj: Record<string, unknown>): Record<string, unknown> {
  const keep = ['selector', 'cssSelector', 'text', 'textContent', 'tagName', 'accessibilityId', 'ariaLabel', 'placeholder', 'type', 'id'];
  return Object.fromEntries(
    Object.entries(obj).filter(([k, v]) => keep.includes(k) && v !== '' && v !== null && v !== undefined),
  );
}

/**
 * Get elements from the page using @wdio/mcp/snapshot
 * Supports browser (visible, a11y, all) and mobile (iOS, Android)
 */
export async function getElements(
  browser: WebdriverIO.Browser,
  options: GetElementsOptions = {},
): Promise<string> {
  const { type = 'visible', toonFormat = 'yaml-like' } = options;

  const platform = detectPlatform(browser);
  const elements = await fetchElements(browser, platform, type);

  if (elements?.length < 1) {
    log.warn(`[Agent] No elements found (platform: ${platform}, type: ${type})`);
  }

  if (toonFormat === 'yaml-like') {
    // Simplify to essential fields - produces YAML-like output, better for smaller models
    const simplified = elements.map((el) => simplifyElement(el as unknown as Record<string, unknown>));
    return encode(simplified);
  }

  // Tabular: keep all fields - more token-efficient for larger models
  const encoded = encode(elements);
  return encoded.replace(/,""|"",/g, ',');
}