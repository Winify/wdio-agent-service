import type { Platform } from '../types';
import { request } from '../providers/send';
import { getSnapshot, type SnapshotElements } from '../scripts/get-snapshot';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

const JEV_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
const DEFAULT_MODEL = 'typesafe/jev-1.13';
const DEFAULT_MIN_CONFIDENCE = 0.6;
const DEFAULT_GOAL_NOUL_THRESHOLD = 0.5;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_CHOICE_OPTIONS = 255;
const NONE_OPTION = 'none';
const NEEDS_LLM_OPTION = 'needs_llm';

export interface JevConfig {
  apiKey: string;
  model?: string;
  minConfidence?: number;
  goalNoulThreshold?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface JevSnapshotOptions {
  snapshotType?: 'a11y' | 'elements';
  maxElements?: number;
}

export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
}

export interface JevNoulAnswer {
  type: 'noul';
  noul: number;
}

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer;

export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string; criteria: Record<'true' | 'false', string> };

export type JevHealOutcome =
  | { healed: true; selector: string; runnerUp?: string }
  | { healed: false; runnerUp?: string; reason: 'none' | 'low_confidence' | 'empty_snapshot' };

export interface GoalVerdict {
  actionWorked: boolean;
  goalMet: boolean;
  noul: { actionWorked: number; goalMet: number };
}

/**
 * Ask Jev one or more typed questions about a state.
 * Throws on HTTP failure, timeout, or exhausted retries (see providers/send.ts request()).
 */
export async function jevDecide(
  config: JevConfig,
  state: Record<string, unknown>,
  questions: Record<string, JevQuestion>,
): Promise<Record<string, JevAnswer>> {
  const data = await request(
    JEV_ENDPOINT,
    { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    { model: config.model ?? DEFAULT_MODEL, state, questions },
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    config.maxRetries ?? DEFAULT_MAX_RETRIES,
  ) as { answers?: Record<string, JevAnswer>; usage?: { cost?: number } };

  if (typeof data?.usage?.cost === 'number') {
    log.info(`[Jev] cost $${data.usage.cost}`);
  }

  return data?.answers ?? {};
}

function choiceCriteria(elements: SnapshotElements): Record<string, string> {
  const criteria: Record<string, string> = {};
  // MAX_CHOICE_OPTIONS includes the none option, so the slice leaves room for it —
  // safe whether the API's 255 cap counts none or not.
  for (const [id, el] of Object.entries(elements).slice(0, MAX_CHOICE_OPTIONS - 1)) {
    criteria[id] = `${el.label || el.selector} → ${el.qualifiedSelector ?? el.selector}`;
  }
  criteria[NONE_OPTION] = 'None of the listed elements matches the intent.';
  return criteria;
}

type ChoiceOutcome =
  | { status: 'accepted'; choice: string }
  | { status: 'rejected'; reason: 'none' | 'low_confidence' };

function evaluateChoice(
  answer: JevAnswer | undefined,
  minConfidence: number,
  reject: string[],
): ChoiceOutcome {
  if (!answer || answer.type !== 'choice' || !answer.choice) return { status: 'rejected', reason: 'none' };
  if (reject.includes(answer.choice)) return { status: 'rejected', reason: 'none' };
  // Written as a positive check so a missing/NaN confidence fails the gate instead of passing it.
  if (!(answer.confidence >= minConfidence)) return { status: 'rejected', reason: 'low_confidence' };
  return { status: 'accepted', choice: answer.choice };
}

function topByProbability(answer: JevChoiceAnswer, exclude: string[] = []): string | undefined {
  const ranked = Object.entries(answer.probabilities ?? {})
    .filter(([key]) => key !== NONE_OPTION && !exclude.includes(key))
    .sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0];
}

type ElementAsk =
  | { status: 'ok'; elements: SnapshotElements; answer?: JevAnswer }
  | { status: 'empty' }
  | { status: 'unavailable' };

async function askElementChoice(
  browser: WebdriverIO.Browser,
  brokenSelector: string,
  actionType: string,
  config: JevConfig,
  snapshot?: JevSnapshotOptions,
): Promise<ElementAsk> {
  if (snapshot?.snapshotType === 'a11y' && !snapshot?.maxElements) {
    log.warn('[Jev] a11y snapshots require maxSnapshotElements for the Jev path — skipping');
    return { status: 'unavailable' };
  }

  const { elements } = await getSnapshot(browser, {
    snapshotType: snapshot?.snapshotType,
    maxElements: snapshot?.maxElements,
  });

  if (Object.keys(elements).length === 0) return { status: 'empty' };

  try {
    const answers = await jevDecide(
      config,
      { brokenSelector, intendedAction: actionType },
      {
        element: {
          type: 'choice',
          instructions: `Which element is the intended target of the broken selector "${brokenSelector}" (${actionType})?`,
          criteria: choiceCriteria(elements),
        },
      },
    );
    return { status: 'ok', elements, answer: answers.element };
  } catch (error) {
    log.warn(`[Jev] Decision request failed for "${brokenSelector}": ${(error as Error).message}`);
    return { status: 'unavailable' };
  }
}

// ponytail: single-shot heal, parity with withHeal's single LLM retry. Add ranked-candidate
// retries if Jev's top-1 accuracy turns out measurably poor.
export async function healSelectorWithJev(
  browser: WebdriverIO.Browser,
  brokenSelector: string,
  actionType: string,
  config: JevConfig,
  snapshot?: JevSnapshotOptions,
): Promise<JevHealOutcome | null> {
  const asked = await askElementChoice(browser, brokenSelector, actionType, config, snapshot);
  if (asked.status === 'empty') {
    log.warn('[Jev] Snapshot is empty, cannot heal');
    return { healed: false, reason: 'empty_snapshot' };
  }
  if (asked.status === 'unavailable') return null;

  const answer = asked.answer;
  const outcome = evaluateChoice(answer, config.minConfidence ?? DEFAULT_MIN_CONFIDENCE, [NONE_OPTION]);

  if (outcome.status === 'rejected') {
    if (outcome.reason === 'low_confidence' && answer?.type === 'choice') {
      const runnerUp = topByProbability(answer);
      log.warn(`[Jev] Best guess "${answer.choice}" below confidence gate for "${brokenSelector}"`);
      return { healed: false, reason: 'low_confidence', runnerUp };
    }
    log.warn(`[Jev] No element matched "${brokenSelector}"`);
    return { healed: false, reason: 'none' };
  }

  const el = asked.elements[outcome.choice];
  if (!el) return { healed: false, reason: 'none' };

  const healedSelector = el.qualifiedSelector ?? el.selector;
  if (healedSelector === brokenSelector) {
    log.warn(`[Jev] Healed selector matches broken selector: "${healedSelector}"`);
    return { healed: false, reason: 'none' };
  }

  log.info(`[Jev] Healed: "${brokenSelector}" → "${healedSelector}" (${outcome.choice})`);
  return { healed: true, selector: healedSelector, runnerUp: topByProbability(answer as JevChoiceAnswer, [outcome.choice]) };
}

export async function suggestFixWithJev(
  browser: WebdriverIO.Browser,
  brokenSelector: string,
  actionType: string,
  config: JevConfig,
  snapshot?: JevSnapshotOptions,
): Promise<{ selector: string; reasoning?: string } | null> {
  const asked = await askElementChoice(browser, brokenSelector, actionType, config, snapshot);
  if (asked.status !== 'ok') return null;

  const answer = asked.answer;
  const outcome = evaluateChoice(answer, config.minConfidence ?? DEFAULT_MIN_CONFIDENCE, [NONE_OPTION]);
  if (outcome.status === 'rejected') return null;

  const el = asked.elements[outcome.choice];
  if (!el) return null;

  const probabilities = (answer as JevChoiceAnswer).probabilities ?? {};
  const pct = (value: number | undefined) => `${Math.round((value ?? 0) * 100)}%`;
  const runnerUp = topByProbability(answer as JevChoiceAnswer, [outcome.choice]);
  const winner = `${outcome.choice} (${pct(probabilities[outcome.choice])})`;

  return {
    selector: el.qualifiedSelector ?? el.selector,
    reasoning: runnerUp
      ? `Jev: ${winner} — next: ${runnerUp} (${pct(probabilities[runnerUp])})`
      : `Jev: ${winner}`,
  };
}

export async function decideAgentActionWithJev(
  _browser: WebdriverIO.Browser,
  intent: string,
  platform: Platform,
  snapshot: { text: string; elements: SnapshotElements },
  config: JevConfig,
): Promise<{ engine: 'jev'; action: 'CLICK' | 'TAP'; targetId: string } | { engine: 'llm' }> {
  if (Object.keys(snapshot.elements).length === 0) return { engine: 'llm' };

  const actionCriteria: Record<string, string> = platform === 'browser'
    ? {
      CLICK: 'Click the chosen element in place.',
      [NEEDS_LLM_OPTION]: 'Intent requires typing a value, navigating to a URL, or multiple steps.',
    }
    : {
      TAP: 'Tap the chosen element.',
      [NEEDS_LLM_OPTION]: 'Intent requires typing a value, navigating to a URL, or multiple steps.',
    };

  let answers: Record<string, JevAnswer>;
  try {
    answers = await jevDecide(
      config,
      { userIntent: intent, platform },
      {
        element: {
          type: 'choice',
          instructions: `Which element accomplishes the user intent: "${intent}"?`,
          criteria: choiceCriteria(snapshot.elements),
        },
        action: {
          type: 'choice',
          instructions: `Which single action accomplishes the user intent: "${intent}"?`,
          criteria: actionCriteria,
        },
      },
    );
  } catch (error) {
    log.error(`[Jev] Agent decision failed: ${(error as Error).message}`);
    return { engine: 'llm' };
  }

  const minConfidence = config.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const element = evaluateChoice(answers.element, minConfidence, [NONE_OPTION]);
  const action = evaluateChoice(answers.action, minConfidence, [NEEDS_LLM_OPTION]);
  if (element.status === 'rejected' || action.status === 'rejected') return { engine: 'llm' };
  // Anything outside the offered action criteria is a hallucination, not a command to reinterpret.
  if (!(action.choice in actionCriteria)) {
    log.warn(`[Jev] Action choice "${action.choice}" was not offered — using the LLM`);
    return { engine: 'llm' };
  }

  if (!snapshot.elements[element.choice]) {
    log.warn(`[Jev] Chosen element "${element.choice}" is not in the snapshot — using the LLM`);
    return { engine: 'llm' };
  }

  return {
    engine: 'jev',
    action: action.choice === 'CLICK' ? 'CLICK' : 'TAP',
    targetId: element.choice,
  };
}

export async function verifyGoalWithJev(
  browser: WebdriverIO.Browser,
  intent: string,
  actionTaken: string,
  config: JevConfig,
  snapshot?: JevSnapshotOptions,
): Promise<GoalVerdict | null> {
  if (snapshot?.snapshotType === 'a11y' && !snapshot?.maxElements) {
    log.warn('[Jev] a11y snapshots require maxSnapshotElements for the goal gate — skipping');
    return null;
  }

  const { text, elements } = await getSnapshot(browser, {
    snapshotType: snapshot?.snapshotType,
    maxElements: snapshot?.maxElements ?? MAX_CHOICE_OPTIONS,
  });
  if (Object.keys(elements).length === 0) {
    log.warn('[Jev] Snapshot is empty, cannot verify the goal');
    return null;
  }

  let answers: Record<string, JevAnswer>;
  try {
    answers = await jevDecide(
      config,
      { userIntent: intent, actionTaken, pageState: text },
      {
        actionWorked: {
          type: 'noul',
          instructions: `Did the action "${actionTaken}" take effect on the page?`,
          criteria: {
            true: 'The page shows a visible effect of the action.',
            false: 'The page state is unchanged by the action.',
          },
        },
        goalMet: {
          type: 'noul',
          instructions: `Has the user's goal been achieved: "${intent}"?`,
          criteria: {
            true: 'The page now reflects the completed goal.',
            false: 'The page does not show the intended result.',
          },
        },
      },
    );
  } catch (error) {
    log.warn(`[Jev] Goal gate request failed: ${(error as Error).message}`);
    return null;
  }

  const actionAnswer = answers.actionWorked;
  const goalAnswer = answers.goalMet;
  if (actionAnswer?.type !== 'noul' || goalAnswer?.type !== 'noul') {
    log.warn('[Jev] Goal gate answers missing or malformed');
    return null;
  }
  if (!Number.isFinite(actionAnswer.noul) || !Number.isFinite(goalAnswer.noul)) {
    log.warn('[Jev] Goal gate returned non-numeric noul values');
    return null;
  }

  const threshold = config.goalNoulThreshold ?? DEFAULT_GOAL_NOUL_THRESHOLD;
  return {
    actionWorked: actionAnswer.noul >= threshold,
    goalMet: goalAnswer.noul >= threshold,
    noul: { actionWorked: actionAnswer.noul, goalMet: goalAnswer.noul },
  };
}
