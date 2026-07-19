import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (vi.mock factories are hoisted; variables must be too) ─

const {
  mockProviderSend,
  mockProviderChat,
  mockInitializeProvider,
  mockGetSnapshot,
  mockBuildPrompt,
  mockBuildAgenticPrompt,
  mockBuildObservationMessage,
  mockParseLlmResponse,
  mockParseAgentStep,
  mockResolveActionTargets,
  mockExecuteAgentAction,
  mockInstallInterceptors,
  mockHealingAddEvent,
  mockHealingGetReport,
  mockHealingClear,
  mockFormatHealingSummary,
  mockLogWarn,
  mockLogInfo,
  mockLogDebug,
  mockLogError,
} = vi.hoisted(() => ({
  mockProviderSend: vi.fn<[unknown], Promise<string>>(),
  mockProviderChat: vi.fn<[unknown], Promise<string>>(),
  mockInitializeProvider: vi.fn(() => ({ send: mockProviderSend, chat: mockProviderChat })),
  mockGetSnapshot: vi.fn(),
  mockBuildPrompt: vi.fn(),
  mockBuildAgenticPrompt: vi.fn(),
  mockBuildObservationMessage: vi.fn(),
  mockParseLlmResponse: vi.fn(),
  mockParseAgentStep: vi.fn(),
  mockResolveActionTargets: vi.fn(),
  mockExecuteAgentAction: vi.fn(),
  mockInstallInterceptors: vi.fn(),
  mockHealingAddEvent: vi.fn(),
  mockHealingGetReport: vi.fn(),
  mockHealingClear: vi.fn(),
  mockFormatHealingSummary: vi.fn(),
  mockLogWarn: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('../../providers/index.js', () => ({
  initializeProvider: (...args: unknown[]) => mockInitializeProvider(...args),
}));

vi.mock('../../scripts/get-snapshot.js', () => ({
  getSnapshot: (...args: unknown[]) => mockGetSnapshot(...args),
}));

vi.mock('../../prompts/index.js', () => ({
  buildPrompt: (...args: unknown[]) => mockBuildPrompt(...args),
  buildAgenticPrompt: (...args: unknown[]) => mockBuildAgenticPrompt(...args),
  buildObservationMessage: (...args: unknown[]) => mockBuildObservationMessage(...args),
}));

vi.mock('../../commands/parse-llm-response.js', () => ({
  parseLlmResponse: (...args: unknown[]) => mockParseLlmResponse(...args),
  parseAgentStep: (...args: unknown[]) => mockParseAgentStep(...args),
  resolveActionTargets: (...args: unknown[]) => mockResolveActionTargets(...args),
}));

vi.mock('../../commands/execute-agent-action.js', () => ({
  executeAgentAction: (...args: unknown[]) => mockExecuteAgentAction(...args),
}));

vi.mock('../../healing/interceptor.js', () => ({
  installInterceptors: (...args: unknown[]) => mockInstallInterceptors(...args),
}));

vi.mock('../../healing/report.js', () => ({
  healingReport: {
    addEvent: (...args: unknown[]) => mockHealingAddEvent(...args),
    getReport: (...args: unknown[]) => mockHealingGetReport(...args),
    clear: (...args: unknown[]) => mockHealingClear(...args),
  },
  formatHealingSummary: (...args: unknown[]) => mockFormatHealingSummary(...args),
}));

vi.mock('@wdio/logger', () => ({
  default: () => ({ warn: mockLogWarn, info: mockLogInfo, debug: mockLogDebug, error: mockLogError }),
}));

// ── Imports ───────────────────────────────────────────────────

import AgentService from '../../services/agent.service.js';
import type { AgentResult, HealConfig } from '../../types/index.js';

// ── Constants ─────────────────────────────────────────────────

const SNAPSHOT_RESULT = {
  text: 'e1  button "Login"  →  button*=Login',
  elements: { e1: { selector: 'button*=Login' } },
};

// ── Helpers ───────────────────────────────────────────────────

function createMockBrowser(overrides: Record<string, unknown> = {}) {
  return {
    addCommand: vi.fn(),
    isIOS: false,
    isAndroid: false,
    $: vi.fn(),
    ...overrides,
  } as unknown as WebdriverIO.Browser;
}

function resetAllMocks(): void {
  const fns = [
    mockProviderSend, mockProviderChat, mockInitializeProvider,
    mockGetSnapshot, mockBuildPrompt, mockBuildAgenticPrompt,
    mockBuildObservationMessage, mockParseLlmResponse, mockParseAgentStep,
    mockResolveActionTargets, mockExecuteAgentAction, mockInstallInterceptors,
    mockHealingAddEvent, mockHealingGetReport, mockHealingClear,
    mockFormatHealingSummary, mockLogWarn, mockLogInfo, mockLogDebug, mockLogError,
  ];
  fns.forEach(f => f.mockReset());
}

function setDefaults(): void {
  mockInitializeProvider.mockReturnValue({ send: mockProviderSend, chat: mockProviderChat });
  mockGetSnapshot.mockResolvedValue(SNAPSHOT_RESULT);
  mockProviderSend.mockResolvedValue('[{"action":"CLICK","target":"e1"}]');
  mockProviderChat.mockResolvedValue(JSON.stringify({
    reasoning: 'clicking login',
    actions: [{ action: 'CLICK', target: 'e1' }],
    done: true,
  }));
  mockParseLlmResponse.mockReturnValue([{ type: 'CLICK', target: 'button*=Login' }]);
  mockParseAgentStep.mockReturnValue({
    actions: [{ type: 'CLICK', target: 'button*=Login' }],
    done: true,
    reasoning: 'found it',
  });
  mockResolveActionTargets.mockImplementation((actions: unknown[]) => actions);
  mockExecuteAgentAction.mockResolvedValue({ action: { type: 'CLICK', target: 'button*=Login' }, success: true });
  mockBuildPrompt.mockReturnValue({ system: 'sys', user: 'usr' });
  mockBuildAgenticPrompt.mockReturnValue({ system: 'agentic-sys', user: 'agentic-usr' });
  mockBuildObservationMessage.mockReturnValue('## Observation\n...');
  mockHealingGetReport.mockReturnValue({ totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] });
}

// ── Tests ─────────────────────────────────────────────────────

describe('AgentService', () => {
  let browser: WebdriverIO.Browser;
  let agentCommand: (prompt: string, options?: { maxSteps?: number; maxActions?: number }) => Promise<AgentResult>;
  let getHealingReportCommand: () => Promise<unknown>;

  let registeredCommands: Record<string, Function> = {};

  beforeEach(() => {
    resetAllMocks();
    setDefaults();
    browser = createMockBrowser();
    registeredCommands = {};

    (browser.addCommand as ReturnType<typeof vi.fn>).mockImplementation(
      (name: string, fn: Function) => {
        registeredCommands[name] = fn;
      },
    );

    agentCommand = ((...args: unknown[]) =>
      registeredCommands['agent']?.(...args)) as typeof agentCommand;

    getHealingReportCommand = (() =>
      registeredCommands['getHealingReport']?.()) as typeof getHealingReportCommand;
  });

  // ── Constructor ─────────────────────────────────────────────

  describe('constructor', () => {
    it('applies defaults', () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInitializeProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: 'openai',
          maxActions: 1,
          maxSteps: 1,
          contextWindow: 3,
          timeout: 30000,
          maxRetries: 2,
          maxOutputTokens: 1024,
        }),
      );
    });

    it('accepts custom config overrides', () => {
      const service = new AgentService({
        schema: 'anthropic',
        maxSteps: 5,
        maxActions: 3,
        contextWindow: 2,
        maxSnapshotElements: 40,
      });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInitializeProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: 'anthropic',
          maxSteps: 5,
          maxActions: 3,
          contextWindow: 2,
          maxSnapshotElements: 40,
        }),
      );
    });
  });

  // ── before() hook ───────────────────────────────────────────

  describe('before() hook', () => {
    it('registers agent and getHealingReport commands', () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(browser.addCommand).toHaveBeenCalledWith('agent', expect.any(Function));
      expect(browser.addCommand).toHaveBeenCalledWith('getHealingReport', expect.any(Function));
    });

    it('clears healing report', () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockHealingClear).toHaveBeenCalled();
    });

    it('installs healing interceptors when autoHeal is enabled', () => {
      const healConfig: HealConfig = { enabled: true, commands: ['click'], maxAttempts: 2 };
      const service = new AgentService({ autoHeal: healConfig });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInstallInterceptors).toHaveBeenCalledWith(
        browser,
        healConfig,
        expect.any(Function),
      );
    });

    it('does not install interceptors when autoHeal is disabled', () => {
      const service = new AgentService({ autoHeal: { enabled: false, commands: ['click'], maxAttempts: 1 } });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInstallInterceptors).not.toHaveBeenCalled();
    });

    it('does not install interceptors when autoHeal is not configured', () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInstallInterceptors).not.toHaveBeenCalled();
    });
  });

  // ── Single-pass mode ────────────────────────────────────────

  describe('single-pass mode (maxSteps=1)', () => {
    it('executes actions and returns AgentResult', async () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const result = await agentCommand('click the login button');

      expect(result.goalAchieved).toBe(true);
      expect(result.totalSteps).toBe(1);
      expect(result.actions).toHaveLength(1);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].done).toBe(true);
      expect(mockGetSnapshot).toHaveBeenCalled();
      expect(mockBuildPrompt).toHaveBeenCalled();
      expect(mockProviderSend).toHaveBeenCalled();
      expect(mockParseLlmResponse).toHaveBeenCalled();
      expect(mockExecuteAgentAction).toHaveBeenCalled();
    });

    it('throws on failed action', async () => {
      mockExecuteAgentAction.mockResolvedValueOnce({
        action: { type: 'CLICK', target: 'button*=Login' },
        success: false,
        error: 'element not found',
      });

      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await expect(agentCommand('click missing button')).rejects.toThrow(
        'Action CLICK "button*=Login" failed: element not found',
      );
    });

    it('resolves eN virtual IDs via resolveActionTargets', async () => {
      mockParseLlmResponse.mockReturnValueOnce([
        { type: 'CLICK' as const, target: 'e1' },
      ]);

      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await agentCommand('click the login button');

      expect(mockResolveActionTargets).toHaveBeenCalledWith(
        expect.any(Array),
        SNAPSHOT_RESULT.elements,
      );
    });
  });

  // ── Agentic loop mode ───────────────────────────────────────

  describe('agentic loop mode (maxSteps > 1)', () => {
    it('runs multi-step ReAct loop until done=true', async () => {
      mockParseAgentStep
        .mockReturnValueOnce({
          actions: [{ type: 'SET_VALUE' as const, target: '#email', value: 'user@test.com' }],
          done: false,
          reasoning: 'filling email',
        })
        .mockReturnValueOnce({
          actions: [{ type: 'CLICK' as const, target: '#submit' }],
          done: true,
          reasoning: 'clicking submit',
        });

      const service = new AgentService({ maxSteps: 3 });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const result = await agentCommand('fill form and submit');

      expect(result.goalAchieved).toBe(true);
      expect(result.totalSteps).toBe(2);
      expect(result.actions).toHaveLength(2);
      expect(mockProviderChat).toHaveBeenCalledTimes(2);
      expect(mockBuildObservationMessage).toHaveBeenCalledTimes(1);
      expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
    });

    it('stops when maxSteps is reached without done flag', async () => {
      mockParseAgentStep.mockReturnValue({
        actions: [{ type: 'CLICK' as const, target: '#next' }],
        done: false,
        reasoning: 'clicking next',
      });

      const service = new AgentService({ maxSteps: 2 });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const result = await agentCommand('keep clicking next');

      expect(result.goalAchieved).toBe(false);
      expect(result.totalSteps).toBe(2);
      expect(mockProviderChat).toHaveBeenCalledTimes(2);
    });

    it('runs without crash with tight contextWindow', async () => {
      mockParseAgentStep.mockReturnValue({
        actions: [{ type: 'CLICK' as const, target: '#btn' }],
        done: false,
      });

      const service = new AgentService({ maxSteps: 4, contextWindow: 1 });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const result = await agentCommand('repeat');
      expect(result.totalSteps).toBe(4);
      expect(result.goalAchieved).toBe(false);
    });

    it('recovers from a single parse error and continues', async () => {
      mockParseAgentStep
        .mockImplementationOnce(() => {
          throw new Error('Invalid JSON');
        })
        .mockReturnValueOnce({
          actions: [{ type: 'CLICK' as const, target: '#btn' }],
          done: true,
          reasoning: 'fixed output',
        });

      mockProviderChat
        .mockResolvedValueOnce('bad json')
        .mockResolvedValueOnce(JSON.stringify({
          reasoning: 'fixed',
          actions: [{ action: 'CLICK', target: 'e1' }],
          done: true,
        }));

      const service = new AgentService({ maxSteps: 3 });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const result = await agentCommand('click the button');
      expect(result.goalAchieved).toBe(true);
    });

    it('aborts after MAX_CONSECUTIVE_PARSE_ERRORS (3)', async () => {
      mockParseAgentStep.mockImplementation(() => {
        throw new Error('malformed output');
      });

      const service = new AgentService({ maxSteps: 10 });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await expect(agentCommand('do something')).rejects.toThrow(
        'Agentic loop aborted: 3 consecutive parse errors',
      );
    });
  });

  // ── Per-call overrides ──────────────────────────────────────

  describe('per-call overrides', () => {
    it('overrides maxSteps to force agentic loop', async () => {
      const service = new AgentService({ maxSteps: 1 });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      mockParseAgentStep
        .mockReturnValueOnce({ actions: [{ type: 'CLICK' as const, target: '#a' }], done: false })
        .mockReturnValueOnce({ actions: [{ type: 'CLICK' as const, target: '#b' }], done: true });

      const result = await agentCommand('multi-step task', { maxSteps: 3 });
      expect(result.totalSteps).toBe(2);
    });

    it('overrides maxActions', async () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await agentCommand('do something', { maxActions: 5 });
      expect(mockParseLlmResponse).toHaveBeenCalledWith(expect.any(String), 5);
    });

    it('forces single-pass when maxSteps=1 on agentic config', async () => {
      const service = new AgentService({ maxSteps: 3 });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const result = await agentCommand('simple click', { maxSteps: 1 });

      expect(result.totalSteps).toBe(1);
      expect(mockParseLlmResponse).toHaveBeenCalled();
      expect(mockParseAgentStep).not.toHaveBeenCalled();
    });
  });

  // ── after() hook ────────────────────────────────────────────

  describe('after() hook', () => {
    it('emits healing summary when events exist', () => {
      mockHealingGetReport.mockReturnValueOnce({
        totalEvents: 3, fixableCount: 2, manualReviewCount: 1, events: [],
      });
      mockFormatHealingSummary.mockReturnValueOnce('[Healing] 2/3 healed');

      const service = new AgentService({ autoHeal: { enabled: true, commands: ['click'], maxAttempts: 1 } });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      service.after(0, {} as WebdriverIO.Capabilities, []);

      expect(mockLogError).toHaveBeenCalledWith('[Healing] 2/3 healed');
    });

    it('skips when no healing events occurred', () => {
      mockHealingGetReport.mockReturnValueOnce({
        totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [],
      });

      const service = new AgentService({ autoHeal: { enabled: true, commands: ['click'], maxAttempts: 1 } });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      service.after(0, {} as WebdriverIO.Capabilities, []);

      expect(mockFormatHealingSummary).not.toHaveBeenCalled();
    });

    it('skips when autoHeal is disabled', () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);
      service.after(0, {} as WebdriverIO.Capabilities, []);

      expect(mockHealingGetReport).not.toHaveBeenCalled();
    });

    it('clears healing report after emitting', () => {
      mockHealingGetReport.mockReturnValueOnce({
        totalEvents: 1, fixableCount: 1, manualReviewCount: 0, events: [],
      });

      const service = new AgentService({ autoHeal: { enabled: true, commands: ['click'], maxAttempts: 1 } });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      service.after(0, {} as WebdriverIO.Capabilities, []);

      expect(mockHealingClear).toHaveBeenCalled();
    });
  });

  // ── Platform detection ──────────────────────────────────────

  describe('platform detection', () => {
    it('detects browser platform by default', async () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await agentCommand('click button');

      expect(mockBuildPrompt).toHaveBeenCalledWith(
        expect.any(String), expect.any(String), expect.any(Number), 'browser',
      );
    });

    it('detects ios platform', async () => {
      const iosBrowser = createMockBrowser({ isIOS: true });
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], iosBrowser);

      const calls = (iosBrowser.addCommand as ReturnType<typeof vi.fn>).mock.calls;
      const cmd = calls.find((c: unknown[]) => c[0] === 'agent')?.[1] as Function;
      await cmd('tap button');

      expect(mockBuildPrompt).toHaveBeenCalledWith(
        expect.any(String), expect.any(String), expect.any(Number), 'ios',
      );
    });

    it('detects android platform', async () => {
      const androidBrowser = createMockBrowser({ isAndroid: true });
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], androidBrowser);

      const calls = (androidBrowser.addCommand as ReturnType<typeof vi.fn>).mock.calls;
      const cmd = calls.find((c: unknown[]) => c[0] === 'agent')?.[1] as Function;
      await cmd('tap button');

      expect(mockBuildPrompt).toHaveBeenCalledWith(
        expect.any(String), expect.any(String), expect.any(Number), 'android',
      );
    });
  });

  // ── getHealingReport command ─────────────────────────────────

  describe('getHealingReport command', () => {
    it('returns the current healing report', async () => {
      mockHealingGetReport.mockReturnValueOnce({
        totalEvents: 2, fixableCount: 1, manualReviewCount: 1, events: [],
      });

      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const report = await getHealingReportCommand();
      expect(report).toEqual({
        totalEvents: 2, fixableCount: 1, manualReviewCount: 1, events: [],
      });
    });
  });

  // ── maxSnapshotElements propagation ─────────────────────────

  describe('maxSnapshotElements', () => {
    it('passes maxSnapshotElements to getSnapshot', async () => {
      const service = new AgentService({ maxSnapshotElements: 40 });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await agentCommand('click button');

      expect(mockGetSnapshot).toHaveBeenCalledWith(
        browser,
        expect.objectContaining({ maxElements: 40 }),
      );
    });

    it('passes undefined when maxSnapshotElements is not set', async () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await agentCommand('click button');

      expect(mockGetSnapshot).toHaveBeenCalledWith(
        browser,
        expect.objectContaining({ maxElements: undefined }),
      );
    });
  });
});
