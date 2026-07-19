export const config: WebdriverIO.Config = {

  tsConfigPath: './tsconfig.json',
  specs: [
    './test/specs/**/agent.spec.ts',
  ],
  // Patterns to exclude.
  exclude: [
    // 'path/to/excluded/files'
  ],

  maxInstances: 1,

  capabilities: [{
    browserName: 'chrome',
  }],

  logLevel: 'error',

  bail: 0,

  waitforTimeout: 10000,

  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    ['agent', {
      provider: 'ollama',
      providerUrl: 'http://localhost:11434',
      model: 'qwen2.5-coder:7b',
      maxActions: 2,
      maxSteps: 1,          // 1 = single-pass, >1 = ReAct loop
      contextWindow: 3,     // conversation memory window for agentic mode
      // autoHeal: {        // self-healing configuration (opt-in)
      //   enabled: true,
      //   commands: ['click', 'setValue'],
      //   maxAttempts: 2,
      // },
    }],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  injectGlobals: true,
};