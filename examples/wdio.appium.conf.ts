import process from 'node:process';

export const config: WebdriverIO.Config = {
  tsConfigPath: './tsconfig.json',
  specs: ['./test/specs/**/mobile.spec.ts'],
  exclude: [],

  // Appium server connection
  hostname: process.env.APPIUM_HOST ?? '127.0.0.1',
  port: Number(process.env.APPIUM_PORT ?? 4723),
  path: process.env.APPIUM_PATH ?? '/',

  maxInstances: 1,

  capabilities: [
    {
      platformName: 'Android',
      'appium:deviceName': 'emulator-5554',
      'appium:platformVersion': '16',
      'appium:automationName': 'UiAutomator2',
      'appium:app': '/Users/vince/Documents/ziffit-devApiGbRegionRelease-3019194.apk',

      'appium:autoGrantPermissions': true,
      'appium:autoAcceptAlerts': true,
    },
  ],

  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    [
      'agent',
      {
        provider: 'ollama',
        providerUrl: 'http://localhost:11434',
        model: 'qwen2.5-coder:3b',
        maxActions: 5,
        maxSteps: 1, // Agentic loop mode
      },
    ],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  injectGlobals: true,
};