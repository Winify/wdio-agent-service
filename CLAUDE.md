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
- `cd examples && pnpm install` first — `examples/` is a separate pnpm workspace.
- `tsc --noEmit` — type check. `tsconfig.json` only lists `types/**/*` but follows all imports transitively.
- pnpm workspace at root; `pnpm add` from root gets "adding to workspace root" error.

## Environment
- `@wdio/elements` ^1.1.0 from npm. Provides `getSnapshot()` → `{ text, elements }` with `e1, e2...` virtual IDs.
- `webdriverio ^9.0.0` peer dependency.
- Any OpenAI-compatible endpoint works with `schema: 'openai'` (LM Studio, Ollama, OpenRouter, etc.).

## Code Patterns
- eslint: no `as any`, no ternary-as-statement, no `browser.pause()`, camelCase, unused vars match `/^_/`.
- Agentic loop parse errors don't consume `maxSteps` budget — separate `MAX_CONSECUTIVE_PARSE_ERRORS=3` counter aborts loop on persistent bad output.
- `formatHealingSummary(report)` in `healing/report.ts` — canonical healing summary formatter. Use this, not inline formatting.
- WDIO custom commands (`browser.addCommand`) always return Promises — must `await`.
- Service `after()` hook output is NOT visible in spec reporter (worker isolates stdout). Use `console.log` from `it()` blocks for visible output.
- `overwriteCommand(name, fn, true)` — third arg `true` = element-scoped interceptor.
- `@wdio/logger` for logging. Use `log.error()` for messages that should survive filter levels.

## Model Constraints
- Default to single-pass (`maxSteps: 1`). ReAct loop requires 7B+ models.
- Compact prompts (~15 lines) for 4B models. Strict JSON output format with explicit examples.
- Optional `maxSnapshotElements` config (no default cap). Set ~40 for 4B local models.
- 10-15s LLM timeout for local 4B models.

## Provider Architecture
- Two schemas only: `anthropic` (Messages API) and `openai` (Chat Completions).
- Ollama detected by port 11434 or `/api/chat` path suffix — NOT by localhost hostname.
- Deprecated `provider` field maps to `schema` with warning. `schema` takes priority.
- Config `send` override bypasses all built-in logic.

