import process from 'node:process';

export const config: WebdriverIO.Config = {
  tsConfigPath: './tsconfig.json',
  specs: ['./test/specs/**/*-mobile.spec.ts'],
  exclude: [],

  hostname: process.env.APPIUM_HOST || 'localhost',
  port: Number(process.env.APPIUM_PORT || 4723),
  path: process.env.APPIUM_PATH || '/',

  maxInstances: 1,

  capabilities: [{
    platformName: 'Android',
    'appium:deviceName': process.env.DEVICE_NAME || 'emulator-5554',
    'appium:platformVersion': process.env.PLATFORM_VERSION || '17',
    'appium:automationName': 'UiAutomator2',
    'appium:autoGrantPermissions': true,
    'appium:autoAcceptAlerts': true,

    'appium:appPackage': 'com.google.android.deskclock',
    'appium:appActivity': 'com.android.deskclock.DeskClock',
  }],

  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 5000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    [
      'agent',
      {
        schema: process.env.AGENT_SCHEMA || 'openai',
        providerUrl: process.env.PROVIDER_URL || 'http://localhost:1234',
        model: process.env.AGENT_MODEL || 'qwen/qwen3.5-4b',
        maxActions: 3,
        timeout: 10_000,
        autoHeal: { enabled: true, commands: ['tap'], maxAttempts: 2 },
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
