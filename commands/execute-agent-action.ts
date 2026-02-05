import 'webdriverio';
import type { ActionType, AgentAction } from '../types';
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

export const executeAgentAction = async (_browser: WebdriverIO.Browser, action: AgentAction): Promise<void> => {
  log.debug(`[Agent] Executing: ${action.type} on "${action.target}"${action.value ? ` with value "${action.value}"` : ''}`);

  const agentAction = actionsByType[action.type];

  if (!agentAction) {
    throw new Error(`Unknown action type: ${action.type}`);
  }

  return agentAction(_browser, action);
};
