# WebdriverIO Agent Service

A WebdriverIO service that adds LLM-powered browser and mobile automation through a simple `browser.agent(prompt)` command. Powered by [@wdio/mcp](https://www.npmjs.com/package/@wdio/mcp) for element snapshots.

## Why?

Modern UIs change frequently — cookie banners appear, button labels shift, modals pop up unexpectedly. Traditional selectors break. LLMs can handle this ambiguity, but running every action through an LLM is slow and expensive.

**The solution: use both.**

```ts
// Stable actions → use regular WebdriverIO (fast, free, reliable)
await browser.url('https://shop.example.com');
await browser.$('input#search').setValue('mechanical keyboard');
await browser.$('button[type="submit"]').click();

// Unpredictable UI → let the LLM handle it (flexible, resilient)
await browser.agent('accept the cookie consent banner');
await browser.agent('close any promotional popup');

// Back to stable actions
await browser.$('.product-card').click();
await browser.$('#add-to-cart').click();
```

This hybrid approach lets you:
- **Save tokens** on predictable interactions
- **Stay resilient** against UI changes where they matter most
- **Keep tests fast** by only invoking the LLM when needed
- **Reduce flakiness** in areas prone to A/B tests or dynamic content

## Installation

```bash
npm install wdio-agent-service
```

## Configuration

Add the service to your `wdio.conf.ts`:

```ts
export const config: WebdriverIO.Config = {
  // ...
  services: [
    ['agent', {
      provider: 'ollama',
      model: 'qwen2.5-coder:3b',
      maxActions: 2,
    }]
  ],
};
```

### Config Options

| Option        | Type                       | Default                    | Description                                                                                                                |
|---------------|----------------------------|----------------------------|----------------------------------------------------------------------------------------------------------------------------|
| `provider`    | `'ollama'`                 | `'ollama'`                 | LLM provider                                                                                                               |
| `providerUrl` | `string`                   | `'http://localhost:11434'` | Provider API endpoint                                                                                                      |
| `model`       | `string`                   | `'qwen2.5-coder:7b'`       | Model name                                                                                                                 |
| `maxActions`  | `number`                   | `1`                        | Maximum actions per prompt                                                                                                 |
| `timeout`     | `number`                   | `30000`                    | Request timeout in ms                                                                                                      |
| `toonFormat`  | `'yaml-like' \| 'tabular'` | `'yaml-like'`              | Element encoding format. `yaml-like` works better with smaller models, `tabular` is more token-efficient for larger models |

## Usage

The service adds a single command to the browser object:

```ts
const actions = await browser.agent('your natural language instruction');
// [{ type: 'CLICK', target: 'button#submit' }]
```

### Browser Actions

| Action      | Description              | Example Prompt                                |
|-------------|--------------------------|-----------------------------------------------|
| `CLICK`     | Click on an element      | `"click the login button"`                    |
| `SET_VALUE` | Type into an input field | `"type hello@example.com in the email field"` |
| `NAVIGATE`  | Go to a URL              | `"navigate to https://example.com"`           |

### Mobile Actions

| Action      | Description              | Example Prompt                        |
|-------------|--------------------------|---------------------------------------|
| `TAP`       | Tap on an element        | `"tap the Sign In button"`            |
| `SET_VALUE` | Type into an input field | `"enter admin in the username field"` |

The service auto-detects the platform (browser, Android, iOS) and adjusts the available actions and prompts accordingly.

### Browser Examples

```ts
await browser.agent('accept all cookies');
await browser.agent('close the newsletter signup modal');
await browser.agent('click on Settings in the user menu');
await browser.agent('enter john.doe@test.com in the email input');
```

### Mobile Examples (Appium)

```ts
await browser.agent('skip the onboarding');
await browser.agent('accept all cookies');
await browser.agent('go to Account');
await browser.agent('fill in admin into username field and password into password field');
```

## Mobile Setup (Appium)

The service works with Appium for Android and iOS automation. Configure your `wdio.conf.ts` with Appium capabilities:

```ts
export const config: WebdriverIO.Config = {
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',

  capabilities: [{
    platformName: 'Android',
    'appium:deviceName': 'emulator-5554',
    'appium:automationName': 'UiAutomator2',
    'appium:app': '/path/to/your/app.apk',
  }],

  services: [
    ['agent', {
      provider: 'ollama',
      model: 'qwen2.5-coder:3b',
      maxActions: 5,
    }]
  ],
};
```

## Local LLM Setup (Ollama)

1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull qwen2.5-coder:3b`
3. Run `ollama serve` in the terminal
4. Ollama runs on `http://localhost:11434` by default

### Recommended Models

| Model               | Size  | Speed   | Accuracy |
|---------------------|-------|---------|----------|
| `qwen2.5-coder:3b`  | 1.9GB | Fastest | Good     |
| `qwen2.5-coder:7b`  | 4.7GB | Fast    | Better   |
| `qwen2.5-coder:14b` | 9GB   | Medium  | Best     |

## How It Works

1. `browser.agent(prompt)` captures visible, interactable elements using `@wdio/mcp/snapshot`
2. Elements are encoded in a token-efficient format (TOON) and sent to the LLM alongside the prompt
3. The LLM returns structured JSON actions (CLICK, SET_VALUE, NAVIGATE, TAP)
4. Actions are executed via WebdriverIO

The platform (browser/Android/iOS) is auto-detected, and the prompt and available actions adjust accordingly.

## When to Use `agent()` vs Regular Commands

| Scenario                            | Recommendation      |
|-------------------------------------|---------------------|
| Static selectors that rarely change | Regular WebdriverIO |
| Login forms with stable IDs         | Regular WebdriverIO |
| Cookie consent banners              | `agent()`           |
| Promotional popups/modals           | `agent()`           |
| Third-party widgets                 | `agent()`           |
| Elements with dynamic/generated IDs | `agent()`           |
| A/B tested UI components            | `agent()`           |
| Mobile onboarding flows             | `agent()`           |

## License

MIT
