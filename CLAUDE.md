# wdio-agent-service

WDIO service: natural-language browser commands, self-healing selectors, healing reports.

## Commands

```bash
pnpm lint              # eslint --fix + tsc --noEmit
pnpm build             # tsup: types/index.ts → build/ (ESM)
pnpm test              # vitest unit (tests/**/*.test.ts)
pnpm test:examples     # build + WDIO specs against test site
pnpm test:examples-mobile  # build + WDIO mobile specs on emulator
```

Run from `examples/` directly:
```bash
cd examples && pnpm install
pnpm test             # wdio wdio.conf.ts
pnpm test:mobile      # wdio wdio.appium.conf.ts
```

## Project Map

| Directory | Purpose | Key File(s) |
|-----------|---------|-------------|
| `types/` | Interfaces, WDIO augmentation | `index.ts` |
| `services/` | WDIO plugin lifecycle, custom commands | `agent.service.ts` |
| `providers/` | LLM adapter (anthropic, openai, ollama) | `send.ts`, `index.ts` |
| `commands/` | LLM response parser + action executor | `parse-llm-response.ts`, `execute-agent-action.ts` |
| `prompts/` | System/user prompt builders | `index.ts` |
| `healing/` | Interceptor, LLM healer, report store, fixing suggestions | `interceptor.ts`, `healer.ts`, `report.ts`, `fixing-suggestions.ts` |
| `scripts/` | Snapshot wrapper (`@wdio/elements`) | `get-snapshot.ts` |
| `examples/` | WDIO specs + configs (**separate pnpm workspace**) | — |

## Core APIs

```ts
// Single-pass: snapshot → LLM → execute actions sequentially. Throws on first failure.
browser.agent("tap the login button", { maxActions?: number })  // default 1

// Self-healing: broken selector → LLM finds replacement → retries with click.
// Config: autoHeal: { enabled: true, commands: ['click','tap','setValue'], maxAttempts?: number, settleDelay?: number, waitForHealing?: number }

// Fixing suggestions: collect selector fix suggestions without retrying.
// Config: fixingSuggestions: { enabled: true, commands: ['click','tap','setValue'] }

// Healing report — use canonical formatter:
browser.getHealingReport() → formatHealingSummary(report) // from healing/report.ts

// Debug / fixing suggestions:
browser.snapshot({ maxElements?: number })           // dump element tree
browser.getFixingSuggestions()                       // selector fix suggestions
```

## Quick Start Config

```ts
// wdio.conf.ts
services: [['agent', {
  schema: 'openai',                    // 'anthropic' | 'openai' | 'ollama'
  providerUrl: 'http://localhost:1234',
  model: 'qwen/qwen3.5-4b',
  maxActions: 3,                       // max actions per LLM response
}]]
```

## Critical Gotchas

- `examples/` is **separate pnpm workspace**: `cd examples && pnpm install` first. `pnpm add` from root errors.
- `browser.back()` unreliable on Android emulators — use `browser.execute('mobile: pressKey', { keycode: 4 })`.
- WDIO skips `implicitWait` for `tap` on mobile (hardcoded in webdriverio). `tap` fails immediately if element missing; `click`/`setValue` wait for `implicitWait` timeout first. Both trigger the self-healing overwrite — difference is timing only.
- `isElementNotFoundError` matches Appium "could not be located" and tap auto-scroll failures — see `healing/interceptor.ts`.
- Custom commands (`browser.addCommand`) always return Promises — must `await`.
- Service `after()` hook output invisible in spec reporter — use `console.log` from `it()` blocks.

## Provider

Three schemas: `anthropic` (Messages API), `openai` (Chat Completions), `ollama` (native API). `providerUrl` and `model` are required unless using `send` override. Config `request` override bypasses built-in logic.

## Mobile

Env vars in `examples/wdio.appium.conf.ts`: `APPIUM_HOST`, `APPIUM_PORT`, `APPIUM_PATH`, `DEVICE_NAME`, `PLATFORM_VERSION`, `AGENT_SCHEMA`, `PROVIDER_URL`, `AGENT_MODEL`. See config file for defaults.

`APP_PACKAGE` and `APP_ACTIVITY` are hardcoded in the config (not env vars). For ApiDemos, edit the config or set via environment in your own WDIO setup.
