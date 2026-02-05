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

export type SnapshotType = 'visible' | 'a11y' | 'all';

export interface GetElementsOptions {
  /** Snapshot type. Default: 'visible' */
  type?: SnapshotType;
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
  if (platform !== 'browser') return getMobileVisibleElements(browser, platform);
  if (type === 'a11y') return getBrowserAccessibilityTree(browser);

  return getBrowserInteractableElements(browser, {
    elementType: type === 'all' ? 'all' : 'interactable',
  });
}

/**
 * Get elements from the page using @wdio/mcp/snapshot
 * Supports browser (visible, a11y, all) and mobile (iOS, Android)
 */
export async function getElements(
  browser: WebdriverIO.Browser,
  options: GetElementsOptions = {},
): Promise<string> {
  const { type = 'visible' } = options;
  const platform = detectPlatform(browser);
  const elements = await fetchElements(browser, platform, type);
  const encoded = encode(elements);
  return encoded.replace(/,""|"",/g, ',');
}