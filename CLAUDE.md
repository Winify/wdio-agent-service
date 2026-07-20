# wdio-agent-service

## Quick Start
```ts
// wdio.conf.ts
services: [['agent', {
  schema: 'openai',                          // 'anthropic' | 'openai'
  providerUrl: 'http://localhost:1234',       // LM Studio, Ollama, etc.
  model: 'qwen/qwen3.5-4b',
}]]
```

## Mobile Testing
```bash
# Pre-installed ApiDemos on emulator
APP_PACKAGE=io.appium.android.apis APP_ACTIVITY=.ApiDemos \
  cd examples && npx wdio wdio.appium.conf.ts

# Or use npm scripts
pnpm test:mobile          # agentic commands
pnpm test:mobile-healing  # self-healing + healing report
```

### Mobile Env Vars
| Variable | Default | Purpose |
|---|---|---|
| `APPIUM_HOST` | `localhost` | Appium server hostname |
| `APPIUM_PORT` | `4723` | Appium server port |
| `PROVIDER_URL` | `http://localhost:1234` | LLM endpoint |
| `AGENT_MODEL` | `qwen/qwen3.5-4b` | Model name |
| `DEVICE_NAME` | `emulator-5554` | AVD name |
| `APP` | — | Path to APK file |
| `APP_PACKAGE` | — | Android package (pre-installed apps) |
| `APP_ACTIVITY` | `.Main` | Launch activity |

## Three Core Use-Cases
- **Agentic commands**: `browser.agent("tap App")` — natural language → LLM → single action (single-pass, `maxSteps: 1`). Pass `{ maxSteps: >1 }` for ReAct observation loop (needs 7B+ models).
- **Self-healing**: `autoHeal: { enabled: true, commands: ['click','tap','setValue'] }` — broken selector → LLM finds replacement element in snapshot → retries with `click` (avoids `tap` auto-scroll).
- **Healing report**: `browser.getHealingReport()` → `{ totalEvents, fixableCount, manualReviewCount, events[] }` — each event has `originalSelector`, `healedSelector`, `fixable`, `suggestion`. Use `formatHealingSummary(report)` from `healing/report.ts` for canonical display format.

## Directory Structure
- `types/` — entry point, all interfaces, global WebdriverIO augmentation
- `services/` — AgentService (WDIO plugin lifecycle, single-pass + agentic execution)
- `providers/` — 2-schema LLM adapter (`send.ts`) + factory (`index.ts`)
- `commands/` — LLM response parser + action executor
- `prompts/` — single-pass + agentic system/user prompt builders
- `healing/` — interceptor, LLM healer, report store
- `scripts/` — `get-snapshot.ts` (wraps `@wdio/elements`)
- `examples/` — WDIO specs + configs (**separate pnpm workspace**). Specs named by intent: `agent-natural-language.spec.ts`, `self-healing.spec.ts`, `healing-report.spec.ts`.

## Build & Test
- `pnpm lint` — eslint --fix + tsc --noEmit.
- `pnpm build` — tsup bundles from `types/index.ts` → `build/`. ESM only.
- `pnpm test` — vitest unit tests (`tests/**/*.test.ts`). Excludes examples.
- `pnpm test:examples` — build + run WDIO specs against test site.
- `npx wdio wdio.conf.ts` — WDIO integration specs (run from `examples/` dir).
- `cd examples && pnpm install` first — `examples/` is separate pnpm workspace.
- `tsc --noEmit` — type check. `tsconfig.json` only lists `types/**/*` but follows all imports transitively.
- pnpm workspace at root; `pnpm add` from root gets "adding to workspace root" error.

## Mobile Gotchas
- `browser.back()` unreliable on some emulators — use `browser.execute('mobile: pressKey', { keycode: 4 })` for Android back key.
- WDIO skips `implicitWait` for mobile `tap` (hardcoded at webdriverio). `tap` overwrite fires on element-not-found but `click`/`setValue` overwrites don't — error thrown in elementErrorHandler before overwrite runs.
- `isElementNotFoundError` must match Appium's `"could not be located"` message — not just browser `"element not found"`.

## Environment
- `@wdio/elements` ^1.1.0 from npm. Provides `getSnapshot()` → `{ text, elements }` with `e1, e2...` virtual IDs.
- `webdriverio ^9.0.0` peer dependency.
- Any OpenAI-compatible endpoint works with `schema: 'openai'` (LM Studio, Ollama, OpenRouter, etc.).

## @wdio/elements
- Published package from npm (`^1.1.1`). Provides `getSnapshot()` → `{ text, elements }` with `e1, e2...` virtual IDs.
- For local development: `pnpm link ../devtools/packages/elements` then use `"@wdio/elements": "^1.1.1"` in devDependencies (link overrides resolution).

## Debug
- `browser.snapshot({ maxElements?: number })` — custom command registered in `agent.service.ts`, dumps `@wdio/elements` text tree + elements map. For mobile element tree exploration.
- Set `logLevel: 'debug'` in WDIO config to see full LLM request/response payloads.
- `[Agent] Executing: TAP on "..."` log (info level) shows each resolved selector before execution.

## Code Patterns
- eslint: no `as any`, no ternary-as-statement, no `browser.pause()`, camelCase, unused vars match `/^_/`.
- Agentic loop parse errors don't consume `maxSteps` budget — separate `MAX_CONSECUTIVE_PARSE_ERRORS=3` counter aborts loop on persistent bad output.
- `formatHealingSummary(report)` in `healing/report.ts` — canonical healing summary formatter. Use this, not inline formatting.
- WDIO custom commands (`browser.addCommand`) always return Promises — must `await`.
- Service `after()` hook output NOT visible in spec reporter (worker isolates stdout). Use `console.log` from `it()` blocks for visible output.
- `overwriteCommand(name, fn, true)` — third arg `true` = element-scoped interceptor.
- `@wdio/logger` for logging. Use `log.error()` for messages that should survive filter levels.

## Model Constraints
- Default to single-pass (`maxSteps: 1`). ReAct loop needs 7B+ models.
- Compact prompts (~15 lines) for 4B models. Strict JSON output format with explicit examples.
- Optional `maxSnapshotElements` config (no default cap). Set ~40 for 4B local models.
- 10-15s LLM timeout for local 4B models.

## Provider Architecture
- Two schemas only: `anthropic` (Messages API) and `openai` (Chat Completions).
- Ollama detected by port 11434 or `/api/chat` path suffix — NOT by localhost hostname.
- Deprecated `provider` field maps to `schema` with warning. `schema` takes priority.
- Config `send` override bypasses all built-in logic.