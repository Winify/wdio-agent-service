import type { ActionType, AgentAction } from '../types';
import { VALID_ACTIONS } from '../types';

interface LlmProposedAction {
  action: string;
  target: string;
  value?: string;
}

export const parseLlmResponse = (response: string, maxActions: number): AgentAction[] => {
  // Strip markdown code blocks if present
  const stripped = response.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();

  // Extract JSON from response (LLM might include extra text)
  const jsonMatch = stripped.match(/\[[\s\S]*]/);
  if (!jsonMatch) {
    throw new Error(`No JSON array found in LLM response.\nResponse: ${response}`);
  }

  let parsed: LlmProposedAction[];
  try {
    parsed = JSON.parse(jsonMatch[0]) as LlmProposedAction[];
  } catch (e) {
    throw new Error(`Failed to parse JSON from LLM response: ${e}\nResponse: ${response}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`LLM returned empty or invalid actions array.\nResponse: ${response}`);
  }

  // Limit to maxActions
  const limited = parsed.slice(0, maxActions);

  return limited.map((action, index) => {
    // Accept both "action" and "type" field names from LLM
    const actionType = action.action.toUpperCase() as ActionType;
    if (!VALID_ACTIONS.includes(actionType)) {
      throw new Error(`Invalid action type "${actionType}" at index ${index}.Valid: ${VALID_ACTIONS.join(', ')}`);
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
  });
};