# WebdriverIO Agent Service

A WebdriverIO service that adds LLM-powered browser automation through a simple `browser.agent(prompt)` command.

## Why?

Modern web UIs change frequently—cookie banners appear, button labels shift, modals pop up unexpectedly. Traditional selectors break. LLMs can handle this ambiguity, but running every action through an LLM is slow and expensive.

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
      provider: 'ollama', // LLM provider (currently supports 'ollama')
      providerUrl: 'http://localhost:11434', // Provider API endpoint
      model: 'qwen2.5-coder:7b', // Model to use
      maxActions: 1, // Max actions per prompt (default: 1)
      timeout: 30000, // Request timeout in ms (default: 30000)
      debug: false, // Enable debug logging (default: false)
    }]
  ],
};
```

## Usage

The service adds a single command to the browser object:

```ts
await browser.agent('your natural language instruction');
```

### Supported Actions

The LLM can return three types of actions:

| Action | Description | Example Prompt |
|--------|-------------|----------------|
| `CLICK` | Click on an element | `"click the login button"` |
| `SET_VALUE` | Type into an input field | `"type hello@example.com in the email field"` |
| `NAVIGATE` | Go to a URL | `"navigate to https://example.com"` |

### Examples

```ts
// Handle cookie consent (varies wildly across sites)
await browser.agent('accept all cookies');

// Dismiss popups and modals
await browser.agent('close the newsletter signup modal');

// Navigate dynamic menus
await browser.agent('click on Settings in the user menu');

// Fill forms with context
await browser.agent('enter john.doe@test.com in the email input');
```

### Return Value

`browser.agent()` returns an array of executed actions:

```ts
const actions = await browser.agent('click the submit button');
// [{ type: 'CLICK', target: 'button[type="submit"]' }]
```

## When to Use `agent()` vs Regular Commands

| Scenario | Recommendation |
|----------|----------------|
| Static selectors that rarely change | Regular WebdriverIO |
| Login forms with stable IDs | Regular WebdriverIO |
| Cookie consent banners | `agent()` |
| Promotional popups/modals | `agent()` |
| Third-party widgets | `agent()` |
| Elements with dynamic/generated IDs | `agent()` |
| A/B tested UI components | `agent()` |

## Local LLM Setup (Ollama)

1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull qwen2.5-coder:7b`
3. Run `ollama serve` in the terminal
4. Ollama runs on `http://localhost:11434` by default

### Recommended Models

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| `qwen2.5-coder:7b` | 4.7GB | Fast | Good |
| `qwen2.5-coder:14b` | 9GB | Medium | Better |
| `llama3.1:8b` | 4.7GB | Fast | Good |

### Agent Flow

1. `browser.agent(prompt)` extracts visible, interactable elements from the page
2. Elements + prompt are sent to the LLM
3. LLM returns structured actions (CLICK, SET_VALUE, NAVIGATE)
4. Actions are executed via WebdriverIO

## License

MIT