export const config: WebdriverIO.Config = {

  tsConfigPath: './tsconfig.json',
  specs: [
    './test/specs/**/agentic.spec.ts',
  ],
  exclude: [],

  maxInstances: 1,

  capabilities: [{
    browserName: 'chrome',
  }],

  logLevel: 'debug',

  bail: 0,

  waitforTimeout: 10000,

  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    ['agent', {
      provider: 'ollama',
      providerUrl: 'http://localhost:11434',
      model: 'qwen2.5-coder:3b',
      maxActions: 5,
      maxSteps: 5, // Agentic loop mode
    }],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000, // Higher timeout for multi-step agentic tests
  },

  injectGlobals: true,
};
