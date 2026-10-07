/**
 * Example config driving the Jev (TypeSafe System One) decision engine.
 *
 * Same site and capabilities as wdio.conf.ts, but healing, fixing suggestions,
 * and single-action browser.agent() all run through Jev instead of the LLM.
 * The LLM config below stays required: intents Jev declines (typing, navigating,
 * multi-step) fall back to it.
 *
 * Requires OPENROUTER_API_KEY (or `typesafe.apiKey`).
 *
 * Usage:
 *   cd examples && pnpm install
 *   OPENROUTER_API_KEY=... npx wdio run wdio.typesafe.conf.ts
 */

export const config: WebdriverIO.Config = {
  tsConfigPath: './tsconfig.json',

  specs: ['./test/specs-typesafe/**/*.spec.ts'],
  exclude: [],

  maxInstances: 1,

  capabilities: [{ browserName: 'chrome' }],

  // 'info' (not the usual 'warn') so the per-call [Jev] cost lines from healing/jev.ts are visible
  logLevel: 'info',
  bail: 0,
  waitforTimeout: 5000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    ['agent', {
      schema: process.env.AGENT_SCHEMA || 'openai',
      providerUrl: process.env.PROVIDER_URL || 'http://localhost:1234',
      model: process.env.AGENT_MODEL || 'qwen/qwen3.5-4b',
      maxActions: 3,
      timeout: 60_000,
      typesafe: {
        enabled: true,
        agent: true,
      },
      autoHeal: {
        enabled: true,
        commands: ['click', 'setValue'],
        maxAttempts: 2,
      },
      fixingSuggestions: {
        enabled: true,
        commands: ['click', 'setValue'],
      },
    }],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120000 },

  injectGlobals: true,
};
