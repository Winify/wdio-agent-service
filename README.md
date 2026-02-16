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

| Option          | Type                                                          | Default              | Description                                                                                                                |
|-----------------|---------------------------------------------------------------|----------------------|----------------------------------------------------------------------------------------------------------------------------|
| `provider`      | `'ollama' \| 'anthropic' \| 'openai' \| 'openrouter' \| 'gemini'` | `'ollama'`           | LLM provider                                                                                                              |
| `providerUrl`   | `string`                                                      | Depends on provider  | Provider API endpoint                                                                                                      |
| `token`         | `string`                                                      | —                    | API token. Falls back to env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`)          |
| `model`         | `string`                                                      | Depends on provider  | Model name (see [Providers](#providers) below)                                                                             |
| `maxActions`    | `number`                                                      | `1`                  | Maximum actions per prompt                                                                                                 |
| `timeout`       | `number`                                                      | `30000`              | Request timeout in ms                                                                                                      |
| `maxRetries`    | `number`                                                      | `2`                  | Max retry attempts on retryable errors (5xx, 429, network). Exponential backoff                                            |
| `maxOutputTokens` | `number`                                                    | `1024`               | Maximum output tokens per LLM response                                                                                    |
| `toonFormat`    | `'yaml-like' \| 'tabular'`                                    | `'yaml-like'`        | Element encoding format. `yaml-like` works better with smaller models, `tabular` is more token-efficient for larger models |
| `send`          | `(prompt: PromptInput) => Promise<string>`                    | —                    | Override the built-in provider entirely. When set, `provider`/`providerUrl`/`token`/`model` are ignored                    |

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

## Providers

### Provider Defaults

| Provider     | Default Model               | Default URL                                    | Token Env Var         |
|--------------|-----------------------------|-------------------------------------------------|-----------------------|
| `ollama`     | `qwen2.5-coder:3b`         | `http://localhost:11434`                        | —                     |
| `anthropic`  | `claude-haiku-4-5-20251001` | `https://api.anthropic.com`                     | `ANTHROPIC_API_KEY`   |
| `openai`     | `gpt-4o-mini`              | `https://api.openai.com`                        | `OPENAI_API_KEY`      |
| `gemini`     | `gemini-2.0-flash`         | `https://generativelanguage.googleapis.com`     | `GEMINI_API_KEY`      |
| `openrouter` | *(required)*               | `https://openrouter.ai/api`                     | `OPENROUTER_API_KEY`  |

Cloud providers (anthropic, openai, gemini, openrouter) require an API token via `token` config or the corresponding env var. OpenRouter additionally requires an explicit `model`.

### Using a Cloud Provider

```ts
services: [
  ['agent', {
    provider: 'anthropic',
    // token defaults to ANTHROPIC_API_KEY env var
    maxActions: 3,
  }]
],
```

### Using a Custom `send` Function

You can bypass the built-in providers entirely by supplying a `send` function:

```ts
services: [
  ['agent', {
    send: async ({ system, user }) => {
      const response = await myCustomLlm({ system, user });
      return response.text;
    },
    maxActions: 2,
  }]
],
```

### Local LLM Setup (Ollama)

1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull qwen2.5-coder:3b`
3. Run `ollama serve` in the terminal
4. Ollama runs on `http://localhost:11434` by default

#### Recommended Ollama Models

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
