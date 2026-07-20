import process from 'node:process';

// Same usage as wdio.appium.conf.ts but with autoHeal enabled.

const capabilities: Record<string, unknown> = {
  platformName: 'Android',
  'appium:deviceName': process.env.DEVICE_NAME || 'emulator-5554',
  'appium:platformVersion': process.env.PLATFORM_VERSION || '17',
  'appium:automationName': 'UiAutomator2',
  'appium:autoGrantPermissions': true,
  'appium:autoAcceptAlerts': true,
};

if (process.env.APP_PACKAGE) {
  capabilities['appium:appPackage'] = process.env.APP_PACKAGE;
  capabilities['appium:appActivity'] = process.env.APP_ACTIVITY || '.Main';
} else if (process.env.APP) {
  capabilities['appium:app'] = process.env.APP;
}

export const config: WebdriverIO.Config = {
  tsConfigPath: './tsconfig.json',
  specs: [
    './test/specs/**/mobile-self-healing*.spec.ts',
    './test/specs/**/mobile-healing-report*.spec.ts',
  ],
  exclude: [],

  hostname: process.env.APPIUM_HOST || 'localhost',
  port: Number(process.env.APPIUM_PORT || 4723),
  path: process.env.APPIUM_PATH || '/',

  maxInstances: 1,

  capabilities: [capabilities],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  services: [
    [
      'agent',
      {
        schema: process.env.AGENT_SCHEMA || 'openai',
        providerUrl: process.env.PROVIDER_URL || 'http://localhost:1234',
        model: process.env.AGENT_MODEL || 'qwen/qwen3.5-4b',
        token: process.env.AGENT_API_KEY,
        maxActions: 3,
        timeout: 60000,
        autoHeal: {
          enabled: true,
          commands: ['click', 'tap', 'setValue'],
          maxAttempts: 2,
        },
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
