/**
 * Recipe: Custom `request` override for OpenAI-compatible endpoints.
 *
 * This config demonstrates the complete flow when using a custom `request`
 * function instead of the built-in provider adapters:
 *
 *   1. Read provider URL / API key from environment variables
 *   2. Receive the assembled PromptInput (system + user) from the agent service
 *   3. Construct and send the HTTP request to the LLM server
 *   4. Extract the raw response text and return it
 *
 * The agent service handles everything else — snapshot capture, prompt
 * building, response parsing, and action execution.
 *
 * When `request` is set, `schema` / `providerUrl` / `model` are ignored.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... pnpm test
 *   # or: OPENAI_API_KEY=sk-... npx wdio run ./examples/recipes/request-override-openai.ts
 */

import type { PromptInput } from 'wdio-agent-service';

export const config: WebdriverIO.Config = {
  services: [
    ['agent', {
      /**
       * Custom request function — complete control over the LLM call.
       *
       * Receives:
       *   - system: the agent's system prompt (action definitions, output format)
       *   - user:   the page snapshot + user's natural-language instruction
       *
       * Must return: the raw LLM response text (string).
       * The agent service parses this into AgentAction[] and executes them.
       */
      request: async ({ system, user }: PromptInput): Promise<string> => {
        const providerUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com';
        const apiKey = process.env.OPENAI_API_KEY;

        if (!apiKey) {
          throw new Error('OPENAI_API_KEY environment variable is required');
        }

        const response = await fetch(`${providerUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: 0.1,
            max_tokens: 1024,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LLM request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('LLM response missing choices[0].message.content');
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
