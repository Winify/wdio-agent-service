import type { PromptInput } from '../types';
import { getSnapshot } from '../scripts/get-snapshot';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

/**
 * Attempt to heal a broken selector by asking the LLM to find
 * the intended element in the current page snapshot.
 *
 * Uses @wdio/elements getSnapshot() which returns e1, e2, ... virtual IDs
 * already baked into the text. The LLM selects the correct eN ID.
 *
 * Returns the healed selector (real CSS selector), or null if healing failed.
 */
export async function healSelector(
  browser: WebdriverIO.Browser,
  brokenSelector: string,
  actionType: string,
  send: (prompt: PromptInput) => Promise<string>,
  maxAttempts: number = 1,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      log.info(`[Auto-Heal] Attempt ${attempt + 1}/${maxAttempts} for "${brokenSelector}" (${actionType})`);

      // Snapshot the current page state with eN virtual IDs
      const { text, elements } = await getSnapshot(browser);

      if (!text || Object.keys(elements).length === 0) {
        log.warn('[Auto-Heal] Snapshot is empty, cannot heal');
        return null;
      }

      // Ask the LLM to find the intended element
      const systemPrompt = [
        'You are a test healing assistant. A test command failed because an element selector changed.',
        '',
        'Given the broken selector and the current page snapshot, find the element most likely intended.',
        'Elements have virtual IDs (e1, e2, e3...). Use the eN ID as the target_id.',
        '',
        'Respond with ONLY a JSON object:',
        '{"target_id": "eN", "confidence": "high|medium|low", "reasoning": "why you chose this element"}',
      ].join('\n');

      const userPrompt = [
        '<broken_selector>',
        brokenSelector,
        '</broken_selector>',
        '',
        '<intended_action>',
        actionType,
        '</intended_action>',
        '',
        '<elements>',
        text,
        '</elements>',
      ].join('\n');

      const rawResponse = await send({ system: systemPrompt, user: userPrompt });
      const parsed = parseHealingResponse(rawResponse);

      if (parsed?.target_id) {
        // Resolve eN virtual ID → real selector
        const el = elements[parsed.target_id];
        if (el) {
          const healedSelector = el.qualifiedSelector ?? el.selector;
          if (healedSelector !== brokenSelector) {
            log.info(`[Auto-Heal] Healed: "${brokenSelector}" → "${healedSelector}" (${parsed.target_id})`);
            return healedSelector;
          }
          log.warn(`[Auto-Heal] Healed selector matches broken selector: "${healedSelector}"`);
        } else {
          log.warn(`[Auto-Heal] Virtual ID "${parsed.target_id}" not found in elements map`);
        }
      } else {
        log.warn('[Auto-Heal] LLM response did not contain a target_id');
      }
    } catch (error) {
      log.warn(`[Auto-Heal] Attempt ${attempt + 1} failed:`, (error as Error).message);
    }
  }

  return null;
}

interface HealingResponse {
  target_id?: string;
  confidence?: string;
  reasoning?: string;
}

function parseHealingResponse(raw: string): HealingResponse | null {
  // Strip thinking blocks and markdown fences
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*$/g, '')
    .trim();

  // Fast path: direct JSON.parse
  try {
    const d = JSON.parse(cleaned);
    if (d && d.target_id) return d;
  } catch {
    // Fall through to regex
  }

  // Try to extract JSON object
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const d = JSON.parse(match[0]);
      if (d && d.target_id) return d;
    } catch {
      // Ignore
    }
  }

  // Try to extract target_id field directly
  const idMatch = cleaned.match(/["']target_id["']\s*:\s*["'](e\d+)["']/i);
  if (idMatch) {
    return { target_id: idMatch[1] };
  }

  return null;
}
