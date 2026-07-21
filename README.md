# WebdriverIO Agent Service

A WebdriverIO service that adds LLM-powered browser and mobile automation through `browser.agent(prompt)`. Powered by [@wdio/elements](https://www.npmjs.com/package/@wdio/elements) for element snapshots.

## Why?

Modern UIs change frequently — cookie banners appear, button labels shift, modals pop up unexpectedly. Traditional selectors break. LLMs can handle this ambiguity, but running every action through an LLM is slow and expensive.

**The solution: use both.**

```ts
// Stable actions → regular WebdriverIO (fast, free, reliable)
await browser.url('https://shop.example.com');
await browser.$('input#search').setValue('mechanical keyboard');
await browser.$('button[type="submit"]').click();

// Unpredictable UI → LLM handles it (flexible, resilient)
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

**Peer dependencies:** `webdriverio >=9.0.0`, `@wdio/elements >=1.1.0`, `@wdio/globals >=9.0.0`, `@wdio/types >=9.0.0`

## Quick Start

Add the service to your `wdio.conf.ts`:

```ts
services: [
  ['agent', {
    schema: 'ollama',
    providerUrl: 'http://localhost:11434',
    model: 'qwen2.5-coder:7b',
    maxActions: 2,
  }]
],
```

For a working example with self-healing and LM Studio, see [`examples/wdio.conf.ts`](examples/wdio.conf.ts). Mobile example: [`examples/wdio.appium.conf.ts`](examples/wdio.appium.conf.ts).

## Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `schema` | `'anthropic' \| 'openai' \| 'ollama'` | — | API wire format. `'ollama'` for Ollama native API, `'openai'` for LM Studio/OpenRouter/etc., `'anthropic'` for Anthropic-compatible endpoints |
| `providerUrl` | `string` | — | **Required.** API endpoint base URL |
| `model` | `string` | — | **Required.** Model name |
| `maxActions` | `number` | `1` | Maximum actions per LLM response |
| `timeout` | `number` | `30000` | Request timeout in ms |
| `maxRetries` | `number` | `2` | Max retries on retryable errors (5xx, 429, network). Exponential backoff |
| `maxOutputTokens` | `number` | `1024` | Maximum output tokens per LLM response |
| `inViewportOnly` | `boolean` | `true` | Only include viewport-visible elements in snapshots |
| `snapshotType` | `'a11y' \| 'elements'` | `'elements'` | `'elements'` = flat list (lean, better for small models). `'a11y'` = accessibility tree (rich, token-heavy) |
| `maxSnapshotElements` | `number` | — | Cap elements in snapshot. Set ~40 for 4B local models |
| `autoHeal` | `HealConfig` | — | Self-healing config (see [Self-Healing](#self-healing)) |
| `fixingSuggestions` | `FixingSuggestionsConfig` | — | Fixing suggestions config (see [Fixing Suggestions](#fixing-suggestions)) |
| `request` | `(prompt: PromptInput) => Promise<string>` | — | Override built-in adapter entirely. When set, `schema`/`providerUrl`/`model` are ignored |
| `send` | `(prompt: PromptInput) => Promise<string>` | — | **Deprecated.** Use `request` instead. Mapped automatically with a warning |

> **Deprecated:** `provider` is an alias for `schema`. `send` is an alias for `request`. Both map automatically with a warning.

## Usage

```ts
const result = await browser.agent('click the login button');
// result.actions → [{ type: 'CLICK', target: 'button*=Login' }]
```

```ts
interface AgentResult {
  actions: AgentAction[];   // executed actions in order
}

interface AgentCallOptions {
  maxActions?: number;      // override maxActions for this call
}
```

```ts
// Override maxActions per call
await browser.agent('fill the login form and submit', { maxActions: 3 });
```

Complete example specs: [`examples/test/specs/agent.spec.ts`](examples/test/specs/agent.spec.ts) (web) and [`examples/test/specs/agent-mobile.spec.ts`](examples/test/specs/agent-mobile.spec.ts) (Appium).

## Actions

### Browser

| Action | Description | Example Prompt |
|--------|-------------|----------------|
| `CLICK` | Click an element | `"click the login button"` |
| `SET_VALUE` | Type into an input | `"type hello@example.com in the email field"` |
| `NAVIGATE` | Go to a URL | `"navigate to https://example.com"` |

### Mobile

| Action | Description | Example Prompt |
|--------|-------------|----------------|
| `TAP` | Tap an element | `"tap the Sign In button"` |
| `SET_VALUE` | Type into an input | `"enter admin in the username field"` |

Platform (browser, Android, iOS) is auto-detected. Available actions and prompts adjust accordingly.

## Debug Commands

### `browser.snapshot()`

Dump the current page element tree — useful for debugging what the LLM sees:

```ts
const snap = await browser.snapshot({
  inViewportOnly: true,      // default true
  snapshotType: 'elements',  // 'elements' (flat) or 'a11y' (rich tree)
  maxElements: 50,           // cap for 'elements' mode
});
```

### `browser.getHealingReport()`

Retrieve structured healing report (populated when `autoHeal` is enabled):

```ts
const report = await browser.getHealingReport();
// { totalEvents: 3, fixableCount: 2, manualReviewCount: 1, events: [...] }
```

### `browser.getFixingSuggestions()`

Retrieve fixing suggestions (populated when `fixingSuggestions` is enabled):

```ts
const report = await browser.getFixingSuggestions();
// { totalEvents: 3, suggestions: [{ command, originalSelector, suggestedSelector, reasoning, timestamp }] }
```

## Self-Healing

When enabled, the service intercepts element commands and heals broken selectors. If `click`, `setValue`, or `tap` fails with "element not found", the healer:

1. Takes a fresh page snapshot
2. Asks the LLM to find the most likely intended element
3. Retries with the healed selector

```ts
services: [
  ['agent', {
    schema: 'openai',
    providerUrl: 'http://localhost:1234/v1',
    model: 'qwen/qwen3.5-4b',
    autoHeal: {
      enabled: true,
      commands: ['click', 'setValue'],    // commands to intercept
      maxAttempts: 2,                      // max healing attempts per failure
      settleDelay: 200,                    // ms to wait for animations after scroll
      waitForHealing: 1500,               // ms to wait for element before triggering healing
    },
  }]
],
```

### Healing decision tree

| Error Pattern | Action |
|---------------|--------|
| `stale element reference` | Re-find element by original selector |
| `element click intercepted` | Scroll into view, retry |
| `invalid element state` | Re-throw immediately (not healable) |
| `element not found` / `no such element` | LLM-based healing, then retry |

After a test suite, a healing summary is logged:

```
[Healing] 2 selector(s) can be fixed automatically, 1 need(s) manual review
[Healing]   FIX: click "#old-btn" → "button*=Sign in"
[Healing]   FIX: setValue "#stale-input" → "#email"
[Healing]   MANUAL: click "#gone" — Element not found in page snapshot — update selector manually
```

## Fixing Suggestions

Like self-healing, but read-only: captures element-not-found errors and asks the LLM what selector to use instead, **without retrying**. Useful for collecting fix suggestions without altering test flow.

```ts
services: [
  ['agent', {
    schema: 'openai',
    providerUrl: 'http://localhost:1234/v1',
    model: 'qwen/qwen3.5-4b',
    fixingSuggestions: {
      enabled: true,
      commands: ['click', 'setValue', 'tap'],
    },
  }]
],
```

## Mobile (Appium)

Works with Appium for Android and iOS. See [`examples/wdio.appium.conf.ts`](examples/wdio.appium.conf.ts) for a complete configuration with emulator capabilities. Example spec: [`examples/test/specs/agent-mobile.spec.ts`](examples/test/specs/agent-mobile.spec.ts) and [`examples/test/specs/self-healing-mobile.spec.ts`](examples/test/specs/self-healing-mobile.spec.ts).

## Provider Setup

`providerUrl` and `model` are **required** unless using a `request` override. `schema` selects the wire format — choose based on your endpoint.

### Schema reference

| Schema | URL path appended | Request format |
|--------|-------------------|----------------|
| `ollama` | `/api/chat` | Ollama native (`stream`, `options.num_predict`) |
| `openai` | `/v1/chat/completions` | OpenAI Chat Completions (`temperature`, `max_tokens`) |
| `anthropic` | `/v1/messages` | Anthropic Messages (`system`, `max_tokens`) |

### Anthropic-compatible endpoints

```ts
services: [
  ['agent', {
    schema: 'anthropic',
    providerUrl: 'https://your-anthropic-proxy.example.com',
    model: 'claude-haiku-4-5-20251001',
    maxActions: 3,
  }]
],
```

### OpenAI-compatible endpoints

```ts
services: [
  ['agent', {
    schema: 'openai',
    providerUrl: 'https://api.openai.com',
    model: 'gpt-4o-mini',
    maxActions: 2,
  }]
],
```

### Custom `request` function

Bypass the built-in adapter entirely by providing your own `request` function. This gives you full control over the LLM call — provider URL, authentication, model selection, and response extraction.

```ts
services: [
  ['agent', {
    request: async ({ system, user }) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      const data = await response.json();
      return data.choices[0].message.content;
    },
    maxActions: 2,
  }]
],
```

Complete recipe configs: [`examples/recipes/request-override-openai.ts`](examples/recipes/request-override-openai.ts) (OpenAI-compatible) and [`examples/recipes/request-override-anthropic.ts`](examples/recipes/request-override-anthropic.ts) (Anthropic).

> **Deprecated:** The `send` option is an alias for `request`. It maps automatically with a deprecation warning. Migrate to `request`.

### Ollama Setup

1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull qwen2.5-coder:7b`
3. Configure:

```ts
services: [
  ['agent', {
    schema: 'ollama',
    providerUrl: 'http://localhost:11434',
    model: 'qwen2.5-coder:7b',
    maxSnapshotElements: 40,
  }]
],
```

**Recommended models:**

| Model | Size | Speed | Accuracy |
|-------|------|-------|----------|
| `qwen2.5-coder:3b` | 1.9GB | Fastest | Good |
| `qwen2.5-coder:7b` | 4.7GB | Fast | Better |

> For 4B-7B models, set `maxSnapshotElements: ~40` to keep snapshots within local model context limits.

### LM Studio Setup

1. Install [LM Studio](https://lmstudio.ai)
2. Download a model (Qwen 2.5 Coder 7B, Llama 3.2 3B, etc.)
3. Start the local inference server — defaults to port `1234`
4. Configure with `schema: 'openai'` and the `/v1` path:

```ts
services: [
  ['agent', {
    schema: 'openai',
    providerUrl: 'http://localhost:1234/v1',
    model: 'qwen/qwen3.5-4b',
    maxSnapshotElements: 40,
  }]
],
```

## How It Works

1. `browser.agent(prompt)` captures a page snapshot using `@wdio/elements`' `getSnapshot()` — returns a tree with virtual IDs (`e1`, `e2`, ...) and an elements map
2. Elements and prompt are sent to the LLM in a structured format
3. The LLM returns actions using virtual IDs as targets (e.g., `{"action":"CLICK","target":"e1"}`)
4. Virtual IDs are resolved to real CSS selectors using the elements map
5. Actions are executed via WebdriverIO

The platform (browser, Android, iOS) is auto-detected, and the prompt and available actions adjust accordingly.

## When to Use `agent()` vs Regular Commands

| Scenario | Recommendation |
|----------|---------------|
| Static selectors that rarely change | Regular WebdriverIO |
| Login forms with stable IDs | Regular WebdriverIO |
| Cookie consent banners | `agent()` |
| Promotional popups/modals | `agent()` |
| Third-party widgets | `agent()` |
| Elements with dynamic/generated IDs | `agent()` |
| A/B tested UI components | `agent()` |
| Mobile onboarding flows | `agent()` |

## License

MIT
