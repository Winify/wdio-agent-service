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
      model: 'qwen2.5-coder:3b',
      maxActions: 2,
      debug: true,
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