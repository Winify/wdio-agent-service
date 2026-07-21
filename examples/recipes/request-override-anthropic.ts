/**
 * Recipe: Custom `request` override for Anthropic-compatible endpoints.
 *
 * This config demonstrates the complete flow when using a custom `request`
 * function instead of the built-in provider adapters:
 *
 *   1. Read API key from environment variables
 *   2. Receive the assembled PromptInput (system + user) from the agent service
 *   3. Construct and send the HTTP request to the Anthropic Messages API
 *   4. Extract the raw response text and return it
 *
 * Key difference from OpenAI: Anthropic's Messages API separates the system
 * prompt from the messages array. The system prompt goes in a top-level
 * `system` field, not as a message with role "system".
 *
 * When `request` is set, `schema` / `providerUrl` / `model` are ignored.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm test
 *   # or: ANTHROPIC_API_KEY=sk-ant-... npx wdio run ./examples/recipes/request-override-anthropic.ts
 */

import type { PromptInput } from 'wdio-agent-service';

export const config: WebdriverIO.Config = {
  services: [
    ['agent', {
      /**
       * Custom request function for Anthropic Messages API.
       *
       * Receives:
       *   - system: the agent's system prompt (action definitions, output format)
       *   - user:   the page snapshot + user's natural-language instruction
       *
       * Must return: the raw LLM response text (string).
       */
      request: async ({ system, user }: PromptInput): Promise<string> => {
        const apiKey = process.env.ANTHROPIC_API_KEY;

        if (!apiKey) {
          throw new Error('ANTHROPIC_API_KEY environment variable is required');
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = (await response.json()) as {
          content: Array<{ text: string }>;
        };

        const content = data.content?.[0]?.text;
        if (!content) {
          throw new Error('LLM response missing content[0].text');
        }

        return content;
      },

      maxActions: 2,
    }],
  ],

  // ── Standard WDIO boilerplate ─────────────────────────────────

  specs: ['./test/specs/**/*.spec.ts'],

  capabilities: [{ browserName: 'chrome' }],

  logLevel: 'warn',
  waitforTimeout: 5000,
  bail: 0,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120000 },

  injectGlobals: true,
};
