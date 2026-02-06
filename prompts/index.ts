import type { ActionResult, Platform, PromptInput } from '../types';
import { browserSystemPrompt, mobileSystemPrompt } from './single-pass';
import { agenticBrowserSystemPrompt, agenticMobileSystemPrompt } from './agentic';

// ── Single-pass prompt builders ───────────────────────────────

function getUserPrompt(elements: string, userRequest: string, maxActions: number, platform: Platform): string {
  const contextLabel = platform === 'browser' ? 'webpage' : 'mobile app';
  return `
Here are the ${contextLabel} elements available for interaction:
<elements>
${elements}
</elements>

Here is the user's request:
<user_request>
${userRequest}
</user_request>

The maximum number of actions you can return is:
<max_actions>
${maxActions}
</max_actions>
`.trim();
}

// ── Agentic prompt builders ───────────────────────────────────

function getAgenticUserPrompt(elements: string, userRequest: string, platform: Platform): string {
  const contextLabel = platform === 'browser' ? 'webpage' : 'mobile app';
  return `
Here are the current ${contextLabel} elements:
<elements>
${elements}
</elements>

Goal: ${userRequest}

Think step by step. What do you observe? What action should you take?
`.trim();
}

// ── Public API ────────────────────────────────────────────────

/**
 * Build a single-pass prompt (used when maxSteps === 1).
 */
export function buildPrompt(
  elements: string,
  userRequest: string,
  maxActions: number,
  platform: Platform,
): PromptInput {
  const system = platform === 'browser' ? browserSystemPrompt : mobileSystemPrompt;
  return {
    system,
    user: getUserPrompt(elements, userRequest, maxActions, platform),
  };
}

/**
 * Build the initial agentic prompt (used when maxSteps > 1, DOM mode).
 */
export function buildAgenticPrompt(
  elements: string,
  userRequest: string,
  platform: Platform,
): PromptInput {
  const system = platform === 'browser' ? agenticBrowserSystemPrompt : agenticMobileSystemPrompt;
  return {
    system,
    user: getAgenticUserPrompt(elements, userRequest, platform),
  };
}

/**
 * Build an observation message to feed back into the agentic loop.
 * Contains action results and updated page elements.
 */
export function buildObservationMessage(
  actionResults: ActionResult[],
  updatedElements: string,
  step: number,
  maxSteps: number,
): string {
  const resultsSummary = actionResults.map((r) => {
    const status = r.success ? 'SUCCESS' : `FAILED: ${r.error}`;
    return `- ${r.action.type} "${r.action.target}": ${status}`;
  }).join('\n');

  return `
## Observation (step ${step}/${maxSteps})

### Action Results
${resultsSummary}

### Current Page Elements
<elements>
${updatedElements}
</elements>

**Thought:** Analyze the results and current page state. What changed? Did the actions succeed?
**Action:** Decide your next actions or set done=true if the goal is achieved.
`.trim();
}
