import type { ActionType, AgentAction, AgentStep } from '../types';
import { VALID_ACTIONS } from '../types';

/**
 * Strip thinking blocks from model responses (e.g. qwen3 `<think>...</think>`)
 */
function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/**
 * Strip JS-style line comments from JSON strings (small models often add these).
 * Uses a simple state machine to skip `//` that appear inside quoted strings
 * (e.g. URLs like "https://example.com").
 */
function stripJsonComments(text: string): string {
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      result += ch;
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      result += ch;
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    // Outside a string: check for // comment
    if (!inString && ch === '/' && text[i + 1] === '/') {
      // Skip until end of line
      while (i < text.length && text[i] !== '\n') {
        i++;
      }
      // Keep the newline itself
      if (i < text.length) {
        result += '\n';
      }
      continue;
    }

    result += ch;
  }

  return result;
}

interface LlmProposedAction {
  action: string;
  target: string;
  value?: string;
}

function validateAction(action: LlmProposedAction, index: number): AgentAction {
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
 * Used in single-pass mode (maxSteps === 1).
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
 * Build an AgentStep from parsed raw data, handling "DONE" pseudo-actions
 * that small models sometimes emit instead of setting done: true.
 */
function buildAgentStep(raw: { actions?: LlmProposedAction[]; done?: boolean; reasoning?: string }): AgentStep {
  const actions: AgentAction[] = [];
  let done = Boolean(raw.done);

  for (const [i, a] of (raw.actions ?? []).entries()) {
    const actionType = a.action.toUpperCase();
    if (actionType === 'DONE' || actionType === 'COMPLETE' || actionType === 'FINISH') {
      // Model signaled completion via a pseudo-action instead of done flag
      done = true;
      continue;
    }
    actions.push(validateAction(a, i));
  }

  return { actions, done, reasoning: raw.reasoning };
}

/**
 * Parse an AgentStep from LLM response.
 * Used in agentic loop mode (maxSteps > 1).
 * Expects: { actions: [...], done: boolean, reasoning?: string }
 */
export const parseAgentStep = (response: string): AgentStep => {
  const cleaned = stripThinkingBlocks(response);
  // Strip JS-style comments (small models often add // comments in JSON)
  const commentFree = stripJsonComments(cleaned);

  // Fast path: direct JSON.parse
  try {
    const direct = JSON.parse(commentFree.trim());
    if (direct && typeof direct === 'object' && Array.isArray(direct.actions)) {
      return buildAgentStep(direct);
    }
  } catch {
    // Fall through to regex extraction
  }

  // Strip markdown code blocks
  const stripped = commentFree.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim();

  // Try to extract a JSON object with actions/done fields
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    throw new Error(`No JSON object found in LLM response.\nResponse: ${cleaned}`);
  }

  let parsed: { actions?: LlmProposedAction[]; done?: boolean; reasoning?: string };
  try {
    parsed = JSON.parse(objMatch[0]);
  } catch (e) {
    throw new Error(`Failed to parse AgentStep JSON: ${e}\nResponse: ${cleaned}`);
  }

  if (!parsed.actions || !Array.isArray(parsed.actions)) {
    throw new Error(`AgentStep missing "actions" array.\nResponse: ${cleaned}`);
  }

  return buildAgentStep(parsed);
};
