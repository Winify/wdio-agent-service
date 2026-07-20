import type { ActionType, AgentAction } from '../types';
import { VALID_ACTIONS } from '../types';

/**
 * Strip thinking blocks from model responses (e.g. qwen3 `<think>...</think>`).
 */
function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

interface LlmProposedAction {
  action: string;
  target: string;
  value?: string;
}

function validateAction(action: LlmProposedAction, index: number): AgentAction {
  if (!action || typeof action.action !== 'string') {
    throw new Error(`Invalid action at index ${index}: missing "action" field`);
  }
  const actionType = action.action.toUpperCase() as ActionType;
  if (!VALID_ACTIONS.includes(actionType)) {
    throw new Error(`Invalid action type "${actionType}" at index ${index}. Valid: ${VALID_ACTIONS.join(', ')}`);
  }

  if (!action.target) {
    throw new Error(`Missing target at index ${index}`);
  }

  if (actionType === 'SET_VALUE' && !action.value) {
    throw new Error(`SET_VALUE at index ${index} requires value field`);
  }

  return {
    type: actionType,
    target: action.target,
    value: action.value,
  };
}

/**
 * Parse a flat array of actions from LLM response.
 */
export const parseLlmResponse = (response: string, maxActions: number): AgentAction[] => {
  const cleaned = stripThinkingBlocks(response);

  // Fast path: try direct JSON.parse first (structured output)
  try {
    const direct = JSON.parse(cleaned.trim());
    if (Array.isArray(direct)) {
      return direct.slice(0, maxActions).map((a: LlmProposedAction, i: number) => validateAction(a, i));
    }
  } catch {
    // Fall through to regex extraction
  }

  // Strip markdown code blocks if present
  const stripped = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();

  // Extract JSON from response (LLM might include extra text)
  const jsonMatch = stripped.match(/\[[\s\S]*]/);
  if (!jsonMatch) {
    throw new Error(`No JSON array found in LLM response.\nResponse: ${cleaned}`);
  }

  let parsed: LlmProposedAction[];
  try {
    parsed = JSON.parse(jsonMatch[0]) as LlmProposedAction[];
  } catch (e) {
    throw new Error(`Failed to parse JSON from LLM response: ${e}\nResponse: ${cleaned}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`LLM returned empty or invalid actions array.\nResponse: ${cleaned}`);
  }

  return parsed.slice(0, maxActions).map((action, index) => validateAction(action, index));
};

/**
 * Resolve an eN virtual ID to a real CSS selector using the elements map.
 * The @wdio/elements getSnapshot() assigns e1, e2, e3... IDs.
 *
 * Returns the qualifiedSelector (disambiguated) if available, else the raw selector.
 * Falls back to returning the input unchanged (for NAVIGATE URLs, raw selectors).
 */
export function resolveTarget(
  target: unknown,
  elements: Record<string, { selector: string; qualifiedSelector?: string }>,
): string {
  if (typeof target !== 'string') {
    return String(target ?? '');
  }
  const match = target.match(/^e(\d+)$/i);
  if (match) {
    const key = `e${match[1]}`;
    const element = elements[key];
    if (element) {
      return element.qualifiedSelector ?? element.selector;
    }
  }
  // Not an eN ID — return as-is (URLs, raw selectors from fallback)
  return target;
}

/**
 * Resolve all eN virtual IDs in an array of actions to real selectors.
 */
export function resolveActionTargets(
  actions: AgentAction[],
  elements: Record<string, { selector: string; qualifiedSelector?: string }>,
): AgentAction[] {
  return actions.map(action => ({
    ...action,
    target: resolveTarget(action.target, elements),
  }));
}
