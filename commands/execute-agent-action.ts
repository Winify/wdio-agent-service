import 'webdriverio';
import type { ActionResult, ActionType, AgentAction } from '../types';
import logger from '@wdio/logger';

const log = logger('wdio-agent-service');

const actionsByType: Record<ActionType, (_browser: WebdriverIO.Browser, action: AgentAction) => Promise<void>> = {
  // Browser actions
  CLICK: async (_browser: WebdriverIO.Browser, action: AgentAction) => {
    await _browser.$(action.target).click();
  },
  NAVIGATE: async (_browser: WebdriverIO.Browser, action: AgentAction) => {
    const url = action.target;
    const targetUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
    await _browser.url(targetUrl);
  },
  // Mobile actions
  TAP: async (_browser: WebdriverIO.Browser, action: AgentAction) => {
    await _browser.$(action.target).tap();
  },
  // Shared actions
  SET_VALUE: async (_browser: WebdriverIO.Browser, action: AgentAction) => {
    await _browser.$(action.target).setValue(action.value!);
  },
};

/**
 * Execute a single agent action. Returns ActionResult with success/failure info.
 * Never throws — errors are captured as observation data for the agentic loop.
 */
export const executeAgentAction = async (_browser: WebdriverIO.Browser, action: AgentAction): Promise<ActionResult> => {
  log.debug(`[Agent] Executing: ${action.type} on "${action.target}"${action.value ? ` with value "${action.value}"` : ''}`);

  const agentAction = actionsByType[action.type];

  if (!agentAction) {
    return { action, success: false, error: `Unknown action type: ${action.type}` };
  }

  try {
    await agentAction(_browser, action);
    return { action, success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.debug(`[Agent] Action failed: ${action.type} — ${errorMessage}`);

    return { action, success: false, error: errorMessage };
  }
};
