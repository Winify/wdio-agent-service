import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWarn, mockInfo, mockDebug, mockError } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockInfo: vi.fn(),
  mockDebug: vi.fn(),
  mockError: vi.fn(),
}));
vi.mock('@wdio/logger', () => ({
  default: () => ({ warn: mockWarn, info: mockInfo, debug: mockDebug, error: mockError }),
}));

const mockGetSnapshot = vi.fn();
vi.mock('../../scripts/get-snapshot.js', () => ({
  getSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  healSelectorWithJev,
  suggestFixWithJev,
  decideAgentActionWithJev,
  verifyGoalWithJev,
} from '../../healing/jev.js';

const mockBrowser = {} as unknown as WebdriverIO.Browser;

const ELEMENTS = {
  e1: { selector: 'button*=Login', qualifiedSelector: 'button*=Login.instance(0)', label: 'Login' },
  e2: { selector: '#email', label: 'Email' },
};

const SNAPSHOT = {
  text: 'e1: Login → button*=Login\ne2: Email → #email',
  elements: ELEMENTS,
};

const CONFIG = { apiKey: 'test-key', maxRetries: 0 };

function createResponse(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

function jevResponse(answers: Record<string, unknown>): Response {
  return createResponse(200, { answers, usage: { input_tokens: 10, output_tokens: 1, cost: 0.0004 } });
}

function choice(choiceName: string, confidence: number, probabilities: Record<string, number>) {
  return { type: 'choice', choice: choiceName, confidence, probabilities };
}

function noul(value: number) {
  return { type: 'noul', noul: value };
}

interface JevRequestBody {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> }>;
}

function requestBody(callIndex = 0): JevRequestBody {
  return JSON.parse(mockFetch.mock.calls[callIndex][1].body) as JevRequestBody;
}

describe('Jev engine', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue(SNAPSHOT);
    mockWarn.mockReset();
    mockInfo.mockReset();
  });

  // ── healSelectorWithJev ─────────────────────────────────────

  describe('healSelectorWithJev', () => {
    it('sends one choice question with sliced criteria and no snapshot text in state', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9, e2: 0.05, none: 0.05 }),
      }));

      const outcome = await healSelectorWithJev(mockBrowser, '#old-login', 'click', CONFIG);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/alpha/decisions');
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');

      const body = requestBody();
      expect(body.model).toBe('typesafe/jev-1.13');
      expect(Object.keys(body.questions)).toEqual(['element']);
      expect(body.questions.element.type).toBe('choice');
      expect(Object.keys(body.questions.element.criteria)).toEqual(['e1', 'e2', 'none']);
      expect(body.questions.element.criteria.e1).toBe('Login → button*=Login.instance(0)');
      expect(body.questions.element.criteria.e2).toBe('Email → #email');
      expect(body.state).toEqual({ brokenSelector: '#old-login', intendedAction: 'click' });
      expect(JSON.stringify(body.state)).not.toContain(SNAPSHOT.text);

      expect(outcome).toEqual({ healed: true, selector: 'button*=Login.instance(0)', runnerUp: 'e2' });
    });

    it('reports the runner-up when the top pick is accepted', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.7, { e1: 0.7, e2: 0.25, none: 0.05 }),
      }));

      const outcome = await healSelectorWithJev(mockBrowser, '#old-login', 'click', CONFIG);

      expect(outcome).toEqual({
        healed: true,
        selector: 'button*=Login.instance(0)',
        runnerUp: 'e2',
      });
    });

    it('retries on 429 through the shared request()', async () => {
      mockFetch
        .mockResolvedValueOnce(createResponse(429, {}))
        .mockResolvedValueOnce(jevResponse({ element: choice('e1', 0.9, { e1: 0.9 }) }));

      const outcome = await healSelectorWithJev(mockBrowser, '#old-login', 'click', { ...CONFIG, maxRetries: 1 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(outcome).toEqual({ healed: true, selector: 'button*=Login.instance(0)' });
    });

    it('rejects a pick below the confidence gate, keeping the best guess as runner-up', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e2', 0.4, { e2: 0.4, e1: 0.3, none: 0.3 }),
      }));

      const outcome = await healSelectorWithJev(mockBrowser, '#old-login', 'click', CONFIG);

      expect(outcome).toEqual({ healed: false, reason: 'low_confidence', runnerUp: 'e2' });
    });

    it('rejects an answer with a missing confidence value', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: { type: 'choice', choice: 'e1', probabilities: { e1: 0.9 } },
      }));

      const outcome = await healSelectorWithJev(mockBrowser, '#old-login', 'click', CONFIG);

      expect(outcome).toEqual({ healed: false, reason: 'low_confidence', runnerUp: 'e1' });
    });

    it('rejects the none option', async () => {
      mockFetch.mockResolvedValue(jevResponse({ element: choice('none', 0.95, { none: 0.95 }) }));

      const outcome = await healSelectorWithJev(mockBrowser, '#old-login', 'click', CONFIG);

      expect(outcome).toEqual({ healed: false, reason: 'none' });
    });

    it('rejects a healed selector identical to the broken one', async () => {
      mockGetSnapshot.mockResolvedValue({
        text: 'e1: Same → #same-btn',
        elements: { e1: { selector: '#same-btn', label: 'Same' } },
      });
      mockFetch.mockResolvedValue(jevResponse({ element: choice('e1', 0.9, { e1: 0.9 }) }));

      const outcome = await healSelectorWithJev(mockBrowser, '#same-btn', 'click', CONFIG);

      expect(outcome).toEqual({ healed: false, reason: 'none' });
    });

    it('clamps criteria to 254 elements plus the none option (255 total)', async () => {
      const many = Object.fromEntries(
        Array.from({ length: 300 }, (_, i) => [`e${i + 1}`, { selector: `#el${i + 1}`, label: `El ${i + 1}` }]),
      );
      mockGetSnapshot.mockResolvedValue({ text: 'many elements', elements: many });
      mockFetch.mockResolvedValue(jevResponse({ element: choice('e1', 0.9, { e1: 0.9 }) }));

      await healSelectorWithJev(mockBrowser, '#old', 'click', CONFIG);

      expect(Object.keys(requestBody().questions.element.criteria)).toHaveLength(255);
    });

    it('returns null when the Jev request fails', async () => {
      mockFetch.mockResolvedValue(createResponse(401, { error: { message: 'invalid api key' } }));

      const outcome = await healSelectorWithJev(mockBrowser, '#old-login', 'click', CONFIG);

      expect(outcome).toBeNull();
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Decision request failed'));
    });

    it('skips the request entirely on an empty snapshot', async () => {
      mockGetSnapshot.mockResolvedValue({ text: '', elements: {} });

      const outcome = await healSelectorWithJev(mockBrowser, '#gone', 'click', CONFIG);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(outcome).toEqual({ healed: false, reason: 'empty_snapshot' });
    });

    it('returns null for a11y snapshots without a maxElements cap', async () => {
      const outcome = await healSelectorWithJev(mockBrowser, '#gone', 'click', CONFIG, { snapshotType: 'a11y' });

      expect(outcome).toBeNull();
      expect(mockGetSnapshot).not.toHaveBeenCalled();
    });
  });

  // ── suggestFixWithJev ───────────────────────────────────────

  describe('suggestFixWithJev', () => {
    it('synthesizes reasoning from the answer distribution', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e2', 0.62, { e2: 0.62, e1: 0.28, none: 0.1 }),
      }));

      const suggestion = await suggestFixWithJev(mockBrowser, '#old-email', 'setValue', CONFIG);

      expect(suggestion).toEqual({
        selector: '#email',
        reasoning: 'Jev: e2 (62%) — next: e1 (28%)',
      });
    });

    it('returns null when the answer is rejected', async () => {
      mockFetch.mockResolvedValue(jevResponse({ element: choice('none', 0.9, { none: 0.9 }) }));

      expect(await suggestFixWithJev(mockBrowser, '#old-email', 'setValue', CONFIG)).toBeNull();
    });

    it('returns null on a failed request', async () => {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      expect(await suggestFixWithJev(mockBrowser, '#old-email', 'setValue', CONFIG)).toBeNull();
    });
  });

  // ── decideAgentActionWithJev ────────────────────────────────

  describe('decideAgentActionWithJev', () => {
    it('asks element, action, and goalMet questions in a single call', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9, e2: 0.05, none: 0.05 }),
        action: choice('CLICK', 0.95, { CLICK: 0.95, needs_llm: 0.05 }),
        goalMet: noul(0.12),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'click on JavaScript Alerts', 'browser', SNAPSHOT, CONFIG);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = requestBody();
      expect(Object.keys(body.questions)).toEqual(['element', 'action', 'goalMet']);
      expect(body.questions.goalMet.type).toBe('noul');
      expect(body.questions.goalMet.criteria).toEqual({
        true: 'The page now reflects the completed goal.',
        false: 'The page does not show the intended result.',
      });
      expect(body.questions.element.criteria.e1).toBe('Login');
      expect(body.questions.element.criteria.e2).toBe('Email');
      expect(body.questions.element.criteria.none).toBe('None of the listed elements matches the intent.');
      expect(body.state).toEqual({
        userIntent: 'click on JavaScript Alerts',
        platform: 'browser',
        elements: ['e1: Login → button*=Login.instance(0)', 'e2: Email → #email'],
        executed: [],
      });

      expect(decision).toEqual({ engine: 'jev', action: 'CLICK', targetId: 'e1', goalMetNoul: 0.12 });
    });

    it('carries already-executed actions as state history', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('DONE', 0.9, { DONE: 0.9 }),
        goalMet: noul(0.9),
      }));

      await decideAgentActionWithJev(
        mockBrowser, 'click on JavaScript Alerts', 'browser', SNAPSHOT, CONFIG,
        ['CLICK a*=JavaScript Alerts'],
      );

      expect(requestBody().state.executed).toEqual(['CLICK a*=JavaScript Alerts']);
    });

    it('offers WAIT, SCROLL, and DONE alongside the platform action', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('CLICK', 0.9, { CLICK: 0.9 }),
        goalMet: noul(0.1),
      }));

      await decideAgentActionWithJev(mockBrowser, 'click login', 'browser', SNAPSHOT, CONFIG);

      expect(requestBody().questions.action.criteria).toEqual({
        CLICK: expect.any(String),
        WAIT: expect.any(String),
        SCROLL: expect.any(String),
        DONE: expect.any(String),
        needs_llm: 'Intent requires typing a value or navigating to a URL.',
      });
    });

    it('offers TAP on mobile platforms', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('TAP', 0.9, { TAP: 0.9 }),
        goalMet: noul(0.1),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'tap login', 'android', SNAPSHOT, CONFIG);

      expect(Object.keys(requestBody().questions.action.criteria)).toEqual([
        'TAP', 'WAIT', 'DONE', 'needs_llm',
      ]);
      expect(decision).toEqual({ engine: 'jev', action: 'TAP', targetId: 'e1', goalMetNoul: 0.1 });
    });

    it.each(['WAIT', 'SCROLL', 'DONE'] as const)(
      'returns %s without a target even when no element matches',
      async (chosen) => {
        mockFetch.mockResolvedValue(jevResponse({
          element: choice('none', 0.9, { none: 0.9 }),
          action: choice(chosen, 0.9, { [chosen]: 0.9 }),
          goalMet: noul(0.2),
        }));

        const decision = await decideAgentActionWithJev(mockBrowser, 'wait for the page', 'browser', SNAPSHOT, CONFIG);

        expect(decision).toEqual({ engine: 'jev', action: chosen, goalMetNoul: 0.2 });
      },
    );

    it('passes the raw goalMet noul through', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('CLICK', 0.9, { CLICK: 0.9 }),
        goalMet: noul(0.87),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'click login', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'jev', action: 'CLICK', targetId: 'e1', goalMetNoul: 0.87 });
    });

    it('reports a null goalMet noul when the answer is malformed', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('CLICK', 0.9, { CLICK: 0.9 }),
        goalMet: { type: 'noul', noul: 'high' },
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'click login', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'jev', action: 'CLICK', targetId: 'e1', goalMetNoul: null });
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Goal noul answer missing or malformed'));
    });

    it('reports a null goalMet noul when the answer is missing', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('CLICK', 0.9, { CLICK: 0.9 }),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'click login', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'jev', action: 'CLICK', targetId: 'e1', goalMetNoul: null });
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Goal noul answer missing or malformed'));
    });

    it('defers to the LLM when the action question picks needs_llm', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e2', 0.9, { e2: 0.9 }),
        action: choice('needs_llm', 0.9, { needs_llm: 0.9 }),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'type tomsmith into username', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'llm' });
    });

    it('defers to the LLM when the action choice was not an offered criterion', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('NAVIGATE', 0.9, { NAVIGATE: 0.9 }),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'click login', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'llm' });
      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('was not offered'));
    });

    it('defers to the LLM when the other platform action is chosen', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('TAP', 0.9, { TAP: 0.9 }),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'tap login', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'llm' });
    });

    it('defers to the LLM when the element question picks none', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('none', 0.9, { none: 0.9 }),
        action: choice('CLICK', 0.9, { CLICK: 0.9 }),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'click something odd', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'llm' });
    });

    it('defers to the LLM when a confidence is below the gate', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.3, { e1: 0.3, none: 0.7 }),
        action: choice('CLICK', 0.9, { CLICK: 0.9 }),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'click login', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'llm' });
    });

    it('defers to the LLM when the chosen element id is not in the snapshot', async () => {
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e99', 0.9, { e99: 0.9 }),
        action: choice('CLICK', 0.9, { CLICK: 0.9 }),
      }));

      const decision = await decideAgentActionWithJev(mockBrowser, 'click login', 'browser', SNAPSHOT, CONFIG);

      expect(decision).toEqual({ engine: 'llm' });
    });

    it('clamps element criteria and state lines to 254 elements plus the none option', async () => {
      const many = Object.fromEntries(
        Array.from({ length: 300 }, (_, i) => [`e${i + 1}`, { selector: `#el${i + 1}`, label: `El ${i + 1}` }]),
      );
      mockFetch.mockResolvedValue(jevResponse({
        element: choice('e1', 0.9, { e1: 0.9 }),
        action: choice('CLICK', 0.9, { CLICK: 0.9 }),
        goalMet: noul(0.1),
      }));

      await decideAgentActionWithJev(mockBrowser, 'click login', 'browser', { text: 'many', elements: many }, CONFIG);

      const body = requestBody();
      expect(Object.keys(body.questions.element.criteria)).toHaveLength(255);
      expect(body.state.elements).toHaveLength(254);
    });

    it('defers to the LLM without fetching when the snapshot has no elements', async () => {
      const decision = await decideAgentActionWithJev(
        mockBrowser, 'click login', 'browser', { text: '', elements: {} }, CONFIG,
      );

      expect(decision).toEqual({ engine: 'llm' });
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── verifyGoalWithJev ───────────────────────────────────────

  describe('verifyGoalWithJev', () => {
    it('asks both noul questions in one call and returns booleans with raw values', async () => {
      mockGetSnapshot.mockResolvedValue({ text: 'post-action page', elements: ELEMENTS });
      mockFetch.mockResolvedValue(jevResponse({ actionWorked: noul(0.92), goalMet: noul(0.31) }));

      const verdict = await verifyGoalWithJev(mockBrowser, 'click login', 'CLICK button*=Login', CONFIG);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const body = requestBody();
      expect(Object.keys(body.questions)).toEqual(['actionWorked', 'goalMet']);
      expect(body.questions.actionWorked.type).toBe('noul');
      expect(body.questions.goalMet.type).toBe('noul');
      expect(body.state).toEqual({
        userIntent: 'click login',
        actionTaken: 'CLICK button*=Login',
        pageState: 'post-action page',
      });

      expect(verdict).toEqual({
        actionWorked: true,
        goalMet: false,
        noul: { actionWorked: 0.92, goalMet: 0.31 },
      });
    });

    it('passes the gate when both noul values clear the threshold', async () => {
      mockGetSnapshot.mockResolvedValue({ text: 'post-action page', elements: ELEMENTS });
      mockFetch.mockResolvedValue(jevResponse({ actionWorked: noul(0.8), goalMet: noul(0.5) }));

      const verdict = await verifyGoalWithJev(mockBrowser, 'click login', 'CLICK button*=Login', CONFIG);

      expect(verdict).toEqual({
        actionWorked: true,
        goalMet: true,
        noul: { actionWorked: 0.8, goalMet: 0.5 },
      });
    });

    it('returns null when a noul answer is missing', async () => {
      mockGetSnapshot.mockResolvedValue({ text: 'post-action page', elements: ELEMENTS });
      mockFetch.mockResolvedValue(jevResponse({ actionWorked: noul(0.9) }));

      expect(await verifyGoalWithJev(mockBrowser, 'click login', 'CLICK x', CONFIG)).toBeNull();
    });

    it('returns null when the gate request fails', async () => {
      mockGetSnapshot.mockResolvedValue({ text: 'post-action page', elements: ELEMENTS });
      mockFetch.mockResolvedValue(createResponse(500, { error: 'boom' }));

      expect(await verifyGoalWithJev(mockBrowser, 'click login', 'CLICK x', CONFIG)).toBeNull();
    });

    it('returns null for a11y snapshots without a maxElements cap', async () => {
      const verdict = await verifyGoalWithJev(mockBrowser, 'click login', 'CLICK x', CONFIG, { snapshotType: 'a11y' });

      expect(verdict).toBeNull();
      expect(mockGetSnapshot).not.toHaveBeenCalled();
    });
  });
});
