export const config: WebdriverIO.Config = {

  tsConfigPath: './tsconfig.json',
  specs: [
    './test/specs/**/*.spec.ts',
  ],
  exclude: [
    './test/specs/**/*-mobile.spec.ts',
  ],

  maxInstances: 1,

  capabilities: [{
    browserName: 'chrome',
  }],

  logLevel: 'warn',

  bail: 0,

  waitforTimeout: 5000,

  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    ['agent', {
      schema: process.env.AGENT_SCHEMA || 'openai',                          // 'anthropic' | 'openai'
      providerUrl: process.env.PROVIDER_URL || 'http://localhost:1234',   // LM Studio, Ollama, OpenAI, etc.
      model: process.env.AGENT_MODEL || 'qwen/qwen3.5-4b',                  // model name
      maxActions: 3,                             // max actions per LLM response
      timeout: 15000,                            // LLM request timeout (ms)
      autoHeal: {                                // self-healing (opt-in)
        enabled: true,
        commands: ['click', 'setValue'],
        maxAttempts: 2,
      },
    }],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  injectGlobals: true,
};
