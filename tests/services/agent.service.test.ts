import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (vi.mock factories are hoisted; variables must be too) ─

const {
  mockProviderSend,
  mockInitializeProvider,
  mockGetSnapshot,
  mockBuildPrompt,
  mockParseLlmResponse,
  mockResolveActionTargets,
  mockExecuteAgentAction,
  mockInstallInterceptors,
  mockInstallFixingSuggestionsInterceptor,
  mockHealingAddEvent,
  mockHealingGetReport,
  mockHealingClear,
  mockFormatHealingSummary,
  mockFixingSuggestionsAddSuggestion,
  mockFixingSuggestionsGetReport,
  mockFixingSuggestionsClear,
  mockFormatFixingSuggestions,
  mockLogWarn,
  mockLogInfo,
  mockLogDebug,
  mockLogError,
} = vi.hoisted(() => ({
  mockProviderSend: vi.fn(),
  mockInitializeProvider: vi.fn((_config?: unknown) => ({ send: mockProviderSend })),
  mockGetSnapshot: vi.fn(),
  mockBuildPrompt: vi.fn(),
  mockParseLlmResponse: vi.fn(),
  mockResolveActionTargets: vi.fn(),
  mockExecuteAgentAction: vi.fn(),
  mockInstallInterceptors: vi.fn(),
  mockInstallFixingSuggestionsInterceptor: vi.fn(),
  mockHealingAddEvent: vi.fn(),
  mockHealingGetReport: vi.fn(),
  mockHealingClear: vi.fn(),
  mockFormatHealingSummary: vi.fn(),
  mockFixingSuggestionsAddSuggestion: vi.fn(),
  mockFixingSuggestionsGetReport: vi.fn(),
  mockFixingSuggestionsClear: vi.fn(),
  mockFormatFixingSuggestions: vi.fn(),
  mockLogWarn: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock('../../providers/index.js', () => ({
  initializeProvider: (...args: unknown[]) => mockInitializeProvider(...(args as [unknown])),
}));

vi.mock('../../scripts/get-snapshot.js', () => ({
  getSnapshot: (...args: unknown[]) => mockGetSnapshot(...(args as [unknown, unknown?])),
}));

vi.mock('../../prompts/index.js', () => ({
  buildPrompt: (...args: unknown[]) => mockBuildPrompt(...(args as [string, string, number, unknown])),
}));

vi.mock('../../commands/parse-llm-response.js', () => ({
  parseLlmResponse: (...args: unknown[]) => mockParseLlmResponse(...(args as [string, number])),
  resolveActionTargets: (...args: unknown[]) => mockResolveActionTargets(...(args as [unknown, unknown])),
}));

vi.mock('../../commands/execute-agent-action.js', () => ({
  executeAgentAction: (...args: unknown[]) => mockExecuteAgentAction(...(args as [unknown, unknown])),
}));

vi.mock('../../healing/interceptor.js', () => ({
  installInterceptors: (...args: unknown[]) => mockInstallInterceptors(...(args as [unknown, unknown, unknown])),
  installFixingSuggestionsInterceptor: (...args: unknown[]) =>
    mockInstallFixingSuggestionsInterceptor(...(args as [unknown, unknown, unknown])),
}));

vi.mock('../../healing/report.js', () => ({
  healingReport: {
    addEvent: (...args: unknown[]) => mockHealingAddEvent(...(args as [unknown])),
    getReport: () => mockHealingGetReport(),
    clear: () => mockHealingClear(),
  },
  formatHealingSummary: (...args: unknown[]) => mockFormatHealingSummary(...(args as [unknown])),
}));

vi.mock('../../healing/fixing-suggestions.js', () => ({
  fixingSuggestionsStore: {
    addSuggestion: (...args: unknown[]) => mockFixingSuggestionsAddSuggestion(...(args as [unknown])),
    getReport: () => mockFixingSuggestionsGetReport(),
    clear: () => mockFixingSuggestionsClear(),
  },
  formatFixingSuggestions: (...args: unknown[]) => mockFormatFixingSuggestions(...(args as [unknown])),
}));

vi.mock('@wdio/logger', () => ({
  default: () => ({ warn: mockLogWarn, info: mockLogInfo, debug: mockLogDebug, error: mockLogError }),
}));

// ── Imports ───────────────────────────────────────────────────

import AgentService from '../../services/agent.service.js';
import type { AgentResult, HealConfig, FixingSuggestionsConfig } from '../../types/index.js';

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
    mockProviderSend, mockInitializeProvider,
    mockGetSnapshot, mockBuildPrompt,
    mockParseLlmResponse, mockResolveActionTargets,
    mockExecuteAgentAction, mockInstallInterceptors,
    mockInstallFixingSuggestionsInterceptor,
    mockHealingAddEvent, mockHealingGetReport, mockHealingClear,
    mockFormatHealingSummary,
    mockFixingSuggestionsAddSuggestion, mockFixingSuggestionsGetReport, mockFixingSuggestionsClear,
    mockFormatFixingSuggestions,
    mockLogWarn, mockLogInfo, mockLogDebug, mockLogError,
  ];
  fns.forEach(f => f.mockReset());
}

function setDefaults(): void {
  mockInitializeProvider.mockReturnValue({ send: mockProviderSend });
  mockGetSnapshot.mockResolvedValue(SNAPSHOT_RESULT);
  mockProviderSend.mockResolvedValue('[{"action":"CLICK","target":"e1"}]');
  mockParseLlmResponse.mockReturnValue([{ type: 'CLICK', target: 'button*=Login' }]);
  mockResolveActionTargets.mockImplementation((actions: unknown[]) => actions);
  mockExecuteAgentAction.mockResolvedValue({ action: { type: 'CLICK', target: 'button*=Login' }, success: true });
  mockBuildPrompt.mockReturnValue({ system: 'sys', user: 'usr' });
  mockHealingGetReport.mockReturnValue({ totalEvents: 0, fixableCount: 0, manualReviewCount: 0, events: [] });
  mockFixingSuggestionsGetReport.mockReturnValue({ totalEvents: 0, suggestions: [] });
}

// ── Tests ─────────────────────────────────────────────────────

describe('AgentService', () => {
  let browser: WebdriverIO.Browser;
  let agentCommand: (prompt: string, options?: { maxActions?: number }) => Promise<AgentResult>;
  let getHealingReportCommand: () => Promise<unknown>;
  let getFixingSuggestionsCommand: () => Promise<unknown>;

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

    getFixingSuggestionsCommand = (() =>
      registeredCommands['getFixingSuggestions']?.()) as typeof getFixingSuggestionsCommand;
  });

  // ── Constructor ─────────────────────────────────────────────

  describe('constructor', () => {
    it('applies defaults', () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInitializeProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          maxActions: 1,
          timeout: 30000,
          maxRetries: 2,
          maxOutputTokens: 1024,
        }),
      );
    });

    it('accepts custom config overrides', () => {
      const service = new AgentService({
        schema: 'anthropic',
        maxActions: 3,
        snapshotType: 'elements',
        maxSnapshotElements: 30,
      });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInitializeProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: 'anthropic',
          maxActions: 3,
          snapshotType: 'elements',
          maxSnapshotElements: 30,
        }),
      );
    });
  });

  // ── before() hook ───────────────────────────────────────────

  describe('before() hook', () => {
    it('registers agent, getHealingReport, and getFixingSuggestions commands', () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(browser.addCommand).toHaveBeenCalledWith('agent', expect.any(Function));
      expect(browser.addCommand).toHaveBeenCalledWith('getHealingReport', expect.any(Function));
      expect(browser.addCommand).toHaveBeenCalledWith('getFixingSuggestions', expect.any(Function));
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
        'elements',
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

    it('clears fixing suggestions store', () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockFixingSuggestionsClear).toHaveBeenCalled();
    });

    it('installs fixing suggestions interceptor when configured', () => {
      const config: FixingSuggestionsConfig = { enabled: true, commands: ['click', 'tap'] };
      const service = new AgentService({ fixingSuggestions: config });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInstallFixingSuggestionsInterceptor).toHaveBeenCalledWith(
        browser,
        config,
        expect.any(Function),
        'elements',
      );
    });

    it('does not install fixing suggestions interceptor when disabled', () => {
      const config: FixingSuggestionsConfig = { enabled: false, commands: [] };
      const service = new AgentService({ fixingSuggestions: config });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      expect(mockInstallFixingSuggestionsInterceptor).not.toHaveBeenCalled();
    });
  });

  // ── Agent execution ─────────────────────────────────────────

  describe('agent command', () => {
    it('executes actions and returns AgentResult', async () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const result = await agentCommand('click the login button');

      expect(result.actions).toHaveLength(1);
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

    it('overrides maxActions per call', async () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await agentCommand('do something', { maxActions: 5 });
      expect(mockParseLlmResponse).toHaveBeenCalledWith(expect.any(String), 5);
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

    it('emits fixing suggestions when suggestions exist', () => {
      mockFixingSuggestionsGetReport.mockReturnValueOnce({
        totalEvents: 2, suggestions: [],
      });
      mockFormatFixingSuggestions.mockReturnValueOnce('[FixingSuggestions] 2 suggestions');

      const config: FixingSuggestionsConfig = { enabled: true, commands: ['click'] };
      const service = new AgentService({ fixingSuggestions: config });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      service.after(0, {} as WebdriverIO.Capabilities, []);

      expect(mockLogError).toHaveBeenCalledWith('[FixingSuggestions] 2 suggestions');
    });

    it('skips fixing suggestions when no events', () => {
      mockFixingSuggestionsGetReport.mockReturnValueOnce({
        totalEvents: 0, suggestions: [],
      });

      const config: FixingSuggestionsConfig = { enabled: true, commands: ['click'] };
      const service = new AgentService({ fixingSuggestions: config });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      service.after(0, {} as WebdriverIO.Capabilities, []);

      expect(mockFormatFixingSuggestions).not.toHaveBeenCalled();
    });

    it('clears fixing suggestions after emitting', () => {
      mockFixingSuggestionsGetReport.mockReturnValueOnce({
        totalEvents: 1, suggestions: [],
      });

      const config: FixingSuggestionsConfig = { enabled: true, commands: ['click'] };
      const service = new AgentService({ fixingSuggestions: config });
      service.before({} as WebdriverIO.Capabilities, [], browser);
      service.after(0, {} as WebdriverIO.Capabilities, []);

      expect(mockFixingSuggestionsClear).toHaveBeenCalled();
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

  // ── Commands ────────────────────────────────────────────────

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

  describe('getFixingSuggestions command', () => {
    it('returns the current fixing suggestions report', async () => {
      mockFixingSuggestionsGetReport.mockReturnValueOnce({
        totalEvents: 3, suggestions: [],
      });

      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const report = await getFixingSuggestionsCommand();
      expect(report).toEqual({
        totalEvents: 3, suggestions: [],
      });
    });
  });

  // ── snapshot config propagation ──────────────────────────────

  describe('snapshot config', () => {
    it('passes default options to snapshot command', async () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const snapshotCommand = (browser.addCommand as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'snapshot',
      )?.[1];
      await snapshotCommand();

      expect(mockGetSnapshot).toHaveBeenCalledWith(
        browser,
        expect.objectContaining({
          inViewportOnly: true,
          snapshotType: undefined,
          maxElements: undefined,
        }),
      );
    });

    it('passes snapshotType and maxElements through', async () => {
      const service = new AgentService();
      service.before({} as WebdriverIO.Capabilities, [], browser);

      const snapshotCommand = (browser.addCommand as Mock).mock.calls.find(
        (call: unknown[]) => call[0] === 'snapshot',
      )?.[1];
      await snapshotCommand({ snapshotType: 'elements', maxElements: 20 });

      expect(mockGetSnapshot).toHaveBeenCalledWith(
        browser,
        expect.objectContaining({
          snapshotType: 'elements',
          maxElements: 20,
        }),
      );
    });

    it('propagates snapshotType and maxSnapshotElements from config to agent', async () => {
      const service = new AgentService({
        snapshotType: 'elements',
        maxSnapshotElements: 15,
      });
      service.before({} as WebdriverIO.Capabilities, [], browser);

      await agentCommand('click button');

      expect(mockGetSnapshot).toHaveBeenCalledWith(
        browser,
        expect.objectContaining({
          snapshotType: 'elements',
          maxElements: 15,
        }),
      );
    });
  });
});
