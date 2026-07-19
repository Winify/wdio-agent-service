# WebdriverIO Agent Service

A WebdriverIO service that adds LLM-powered browser and mobile automation through a simple `browser.agent(prompt)` command. Powered by [@wdio/elements](https://www.npmjs.com/package/@wdio/elements) for element snapshots.

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
npm install wdio-agent-service @wdio/elements
```

**Peer dependencies:** `webdriverio >=9.0.0`, `@wdio/elements >=1.0.0`

## Configuration

Add the service to your `wdio.conf.ts`:

```ts
export const config: WebdriverIO.Config = {
  // ...
  services: [
    ['agent', {
      schema: 'openai', // OpenAI Chat Completions; defaults to local Ollama
      model: 'qwen2.5-coder:7b',
      maxActions: 2,
      maxSteps: 1,          // 1 = single-pass, >1 = ReAct loop
    }]
  ],
};
```

### Config Options

| Option           | Type                                                          | Default              | Description                                                                                                                |
|------------------|---------------------------------------------------------------|----------------------|----------------------------------------------------------------------------------------------------------------------------|
| `schema`         | `'anthropic' \| 'openai'`                                    | `'openai'`           | Request/response API schema                                                                                               |
| `providerUrl`    | `string`                                                      | Depends on schema    | API endpoint base URL                                                                                                      |
| `token`          | `string`                                                      | —                    | API token. Falls back to env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)                                                  |
| `model`          | `string`                                                      | Depends on schema    | Model name (see [Schemas and endpoints](#schemas-and-endpoints) below)                                                    |
| `maxActions`     | `number`                                                      | `1`                  | Maximum actions per LLM response                                                                                           |
| `maxSteps`       | `number`                                                      | `1`                  | Agentic loop steps. `1` = single-pass (fast, no loop). `>1` = ReAct loop (iterative observe-think-act)                     |
| `contextWindow`  | `number`                                                      | `3`                  | Number of recent step-pairs to keep in conversation memory (agentic mode only)                                             |
| `timeout`        | `number`                                                      | `30000`              | Request timeout in ms                                                                                                      |
| `maxRetries`     | `number`                                                      | `2`                  | Max retry attempts on retryable errors (5xx, 429, network). Exponential backoff                                            |
| `maxOutputTokens`| `number`                                                      | `1024`               | Maximum output tokens per LLM response                                                                                     |
| `maxSnapshotElements` | `number`                                                 | —                    | Limit interactive elements in page snapshot. Set ~40 for 4B local models. No limit by default                             |
| `autoHeal`       | `HealConfig`                                                  | —                    | Self-healing configuration (see [Self-Healing](#self-healing) below)                                                       |
| `send`           | `(prompt: PromptInput) => Promise<string>`                    | —                    | Override the built-in adapter entirely. When set, `schema`/`providerUrl`/`token`/`model` are ignored                       |

## Usage

The service adds commands to the browser object:

```ts
// Single-pass mode (maxSteps: 1)
const result = await browser.agent('click the login button');
// result.actions → [{ type: 'CLICK', target: 'button*=Login' }]
// result.goalAchieved → true
// result.totalSteps → 1

// Agentic mode (maxSteps > 1) — multi-step ReAct loop
const result = await browser.agent('fill in the login form and submit', { maxSteps: 3 });
// result.steps → [{ step: 1, actions: [...], done: false }, ...]
// result.totalSteps → 2
```

### AgentResult

```ts
interface AgentResult {
  actions: AgentAction[];          // Flat list of all executed actions
  steps: Array<{                   // Detailed step history (agentic mode)
    step: number;
    actions: ActionResult[];
    done: boolean;
  }>;
  goalAchieved: boolean;           // Whether the LLM set done=true
  totalSteps: number;              // Number of loop iterations executed
}
```

### Per-Call Overrides

You can override `maxSteps` and `maxActions` per call:

```ts
await browser.agent('skip onboarding', { maxSteps: 1 });      // force single-pass
await browser.agent('fill the form', { maxSteps: 3 });        // force agentic loop
await browser.agent('search for cats', { maxActions: 1 });    // limit to one action
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

## ReAct Agentic Loop

When `maxSteps > 1`, the service enters **agentic mode** using the ReAct (Reasoning + Acting) pattern:

```
Observe → Think → Act → Observe → Think → Act → ... (until goal achieved or maxSteps reached)
```

Each step:
1. **Snapshot** current page elements
2. **Send** to LLM with conversation history
3. **Parse** the `{ reasoning, actions, done }` response
4. **Execute** actions and observe results
5. **Feed back** action results + updated page state as an "Observation" message

The conversation window is controlled by `contextWindow` (default: 3 step-pairs). Older messages are trimmed to stay within token limits.

Use agentic mode for complex multi-step tasks (form filling, multi-page flows, conditional interactions). Use single-pass mode (`maxSteps: 1`, the default) for simple one-shot actions.

## Self-Healing

When enabled, the service intercepts element commands and attempts to heal broken selectors. If `click`, `setValue`, or `tap` fails with "element not found", the healer:

1. Takes a fresh page snapshot
2. Asks the LLM to find the most likely intended element
3. Retries with the healed selector

```ts
services: [
  ['agent', {
    schema: 'openai',
    autoHeal: {
      enabled: true,
      commands: ['click', 'setValue'],    // which commands to intercept
      maxAttempts: 2,                      // max healing attempts per failure
      settleDelay: 200,                    // ms to wait for animations after scroll-into-view
    },
  }]
],
```

**Healing decision tree:**

| Error Pattern                          | Action                                    |
|----------------------------------------|-------------------------------------------|
| `stale element reference`              | Re-find element by original selector      |
| `element click intercepted`            | Scroll into view, retry                   |
| `invalid element state`                | Re-throw immediately (not healable)       |
| `element not found` / `no such element`| LLM-based healing, then retry             |

After a test suite completes, a healing summary is logged:

```
[Healing] Summary: 2/3 healed successfully
[Healing]   HEALED: click "#old-btn" → "button*=Sign in"
[Healing]   HEALED: setValue "#stale-input" → "#email"
[Healing]   FAILED: click "#gone" (Could not heal selector)
```

Access the report programmatically:

```ts
const report = await browser.getHealingReport();
// { totalHeals: 3, successfulHeals: 2, failedHeals: 1, events: [...] }
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
      schema: 'openai',
      model: 'qwen2.5-coder:7b',
      maxActions: 5,
    }]
  ],
};
```

## Schemas and endpoints

### Schema defaults

| Schema      | Default Model                | Default URL                     | Token Env Var         |
|-------------|------------------------------|---------------------------------|-----------------------|
| `openai`    | `qwen2.5-coder:7b`          | `http://localhost:11434` (Ollama) | `OPENAI_API_KEY` when needed |
| `anthropic` | `claude-sonnet-4-20250514`  | `https://api.anthropic.com`     | `ANTHROPIC_API_KEY`   |

`schema` selects the wire format, not a provider. The OpenAI schema works with OpenAI-compatible servers such as LM Studio and OpenRouter. The default endpoint is local Ollama; configure another endpoint explicitly.

### Using the Anthropic schema

```ts
services: [
  ['agent', {
    schema: 'anthropic',
    // token defaults to ANTHROPIC_API_KEY env var
    maxActions: 3,
  }]
],
```

### Using a Custom `send` Function

You can bypass the built-in schema adapter entirely by supplying a `send` function:

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
2. Pull a model: `ollama pull qwen2.5-coder:7b`
3. Run `ollama serve` in the terminal
4. Ollama runs on `http://localhost:11434` by default

For a non-default Ollama host, set `providerUrl` to its native chat endpoint (for example, `http://ollama.internal:11434/api/chat`). For LM Studio use its OpenAI-compatible base URL, for example `http://localhost:1234/v1`.

#### Recommended Ollama Models

| Model               | Size  | Speed   | Accuracy |
|---------------------|-------|---------|----------|
| `qwen2.5-coder:3b`  | 1.9GB | Fastest | Good     |
| `qwen2.5-coder:7b`  | 4.7GB | Fast    | Better   |
| `qwen2.5-coder:14b` | 9GB   | Medium  | Best     |

## How It Works

1. `browser.agent(prompt)` captures a page snapshot using `@wdio/elements`' `getSnapshot()` — returns a tree with virtual IDs (e1, e2, ...) and an elements map
2. Elements and prompt are sent to the LLM in a structured format
3. The LLM returns actions using virtual IDs as targets (e.g., `{"action":"CLICK","target":"e1"}`)
4. Virtual IDs are resolved to real CSS selectors using the elements map
5. Actions are executed via WebdriverIO

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
