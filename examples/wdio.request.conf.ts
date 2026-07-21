/**
 * Example config using `request` override to drive LM Studio.
 *
 * Same specs and capabilities as wdio.conf.ts, but builds the HTTP
 * request manually instead of using the built-in schema adapter.
 *
 * LM Studio serves an OpenAI-compatible API at http://localhost:1234/v1
 * by default. Set PROVIDER_URL and AGENT_MODEL env vars to override.
 *
 * Usage:
 *   cd examples && pnpm install
 *   PROVIDER_URL=http://localhost:1234/v1 AGENT_MODEL=qwen/qwen3.5-4b npx wdio run wdio.request.conf.ts
 */

import type { PromptInput } from 'wdio-agent-service';

export const config: WebdriverIO.Config = {
  tsConfigPath: './tsconfig.json',

  specs: ['./test/specs/**/*.spec.ts'],
  exclude: ['./test/specs/**/*-mobile.spec.ts'],

  maxInstances: 1,

  capabilities: [{ browserName: 'chrome' }],

  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 5000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    ['agent', {
      /**
       * Manual LM Studio request — OpenAI-compatible Chat Completions.
       *
       * Flow:
       *  1. Agent service captures page snapshot, builds PromptInput
       *  2. This function constructs the HTTP request to LM Studio
       *  3. Response text returned → agent parses and executes actions
       */
      request: async ({ system, user }: PromptInput): Promise<string> => {
        const providerUrl = process.env.PROVIDER_URL || 'http://localhost:1234/v1';
        const model = process.env.AGENT_MODEL || 'qwen/qwen3.5-4b';

        const response = await fetch(`${providerUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
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

      maxActions: 3,
      timeout: 15000,

      autoHeal: {
        enabled: true,
        commands: ['click', 'setValue'],
        maxAttempts: 2,
      },
    }],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120000 },

  injectGlobals: true,
};
