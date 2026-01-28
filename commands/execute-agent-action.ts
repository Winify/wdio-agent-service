import 'webdriverio';
import type { ActionType, AgentAction } from '../types';

const actionsByType: Record<ActionType, (_browser: WebdriverIO.Browser, action: AgentAction) => Promise<void>> = {
  CLICK: async (_browser: WebdriverIO.Browser, action: AgentAction) => {
    await _browser.$(action.target).click();
  },
  SET_VALUE: async (_browser: WebdriverIO.Browser, action: AgentAction) => {
    await _browser.$(action.target).setValue(action.value!);
  },
  NAVIGATE: async (_browser: WebdriverIO.Browser, action: AgentAction) => {
    const url = action.target;
    const targetUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
    await _browser.url(targetUrl);
  },
};

export const executeAgentAction = async (_browser: WebdriverIO.Browser, debug: boolean, action: AgentAction): Promise<void> => {
  if (debug) {
    console.log(`[Agent] Executing: ${action.type} on "${action.target}"${action.value ? ` with value "${action.value}"` : ''}`);
  }

  const agentAction = actionsByType[action.type];

  if (!agentAction) {
    throw new Error(`Unknown action type: ${action.type}`);
  }

  return agentAction(_browser, action);
};
