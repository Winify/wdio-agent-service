export const config: WebdriverIO.Config = {

  tsConfigPath: './tsconfig.json',
  specs: [
    './test/specs/**/*.spec.ts',
  ],
  exclude: [],

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
      schema: 'openai',                          // 'anthropic' | 'openai'
      providerUrl: 'http://100.69.254.5:1234',   // LM Studio, Ollama, OpenAI, etc.
      model: 'qwen/qwen3.5-4b',                  // model name
      maxActions: 3,                             // max actions per LLM response
      maxSteps: 4,                               // 1 = single-pass, >1 = ReAct loop
      contextWindow: 3,                          // conversation memory window
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
