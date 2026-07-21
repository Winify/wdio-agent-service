# Changelog

## [1.1.0](https://github.com/Winify/wdio-agent-service/compare/v1.0.0...v1.1.0) (2026-07-21)

### Features

* **providers:** Introduce `request` for overriding provider communications ([4afac10](https://github.com/Winify/wdio-agent-service/commit/4afac108146eb32ab7b5f6be3c14a9366c103a24))

## [1.0.0](https://github.com/Winify/wdio-agent-service/compare/v0.2.0...v1.0.0) (2026-07-21)

### ⚠ BREAKING CHANGES

* `maxSteps` now defaults to 1 (single-pass execution). The ReAct agentic loop only activates with explicit maxSteps > 1 — requires 7B+ parameter models. Snapshot output capped at 40 elements. Prompts rewritten for compactness (~15 lines) and strict JSON output format.
* Config field provider renamed to schema. Values reduced from 5 (ollama, anthropic, openai, openrouter, gemini) to 2 (anthropic, openai). The deprecated provider field still maps with a console warning, but openrouter and gemini values are removed entirely. Any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, etc.) uses schema: 'openai'.
* browser.agent() return type changed from Promise<AgentAction[]> to Promise<AgentResult>. Access .actions for the flat action list, or use .steps, .goalAchieved, .totalSteps for detailed execution data. browser.agent() now accepts optional second AgentCallOptions parameter for per-call maxSteps/maxActions overrides.
* All individual provider classes deleted (anthropic, ollama, openai, gemini, openrouter, base) — replaced by unified adapter at providers/send.ts. LLMProvider interface now requires both send() and chat() methods. @wdio/mcp and @toon-format/toon peer dependencies replaced by @wdio/elements ^1.1.0. toonFormat config option removed. getElements() replaced by getSnapshot(). LLM output format changed: models emit e1, e2... virtual element IDs instead of raw CSS selectors — custom send handlers or prompt overrides relying on CSS selector output will break.

### Features

* Add self-healing locator strategy with LLM-powered repair and summary reporting ([ecfe174](https://github.com/Winify/wdio-agent-service/commit/ecfe1745badddc45b135c2553108f8b0613bfaff))
* Merge ReAct agentic loop with dual-mode execution ([416c4f9](https://github.com/Winify/wdio-agent-service/commit/416c4f9c97cedf4001bd4748d25b4d98c68a5181))

### Bug Fixes

* Improve healing summary output and add broken-selector test coverage ([b1ddefe](https://github.com/Winify/wdio-agent-service/commit/b1ddefe493f607c2596be44fe4d1fdd33e67169b))
* Manage tap() auto-healing ([4975251](https://github.com/Winify/wdio-agent-service/commit/497525126aa719b7070fb834e557aeb93a575194))
* Optimize for small models with compact prompts, snapshot trimming, single-pass default ([eebba4e](https://github.com/Winify/wdio-agent-service/commit/eebba4e287ec6ec4a638c0a2508e236bb2099636))

### Refactoring

* Combine `autoHeal` and `fixingSuggestions` config ([3697916](https://github.com/Winify/wdio-agent-service/commit/369791638e63d0e1ea416183b2c08539e69bb79d))
* Consolidate providers and migrate to @wdio/elements ([8dff2cb](https://github.com/Winify/wdio-agent-service/commit/8dff2cb40f0d45c96ca120b0f66624c26ace309d))
* Extract healing prompts into `prompts` directory ([2a42302](https://github.com/Winify/wdio-agent-service/commit/2a42302924a35347319dc6e2aac3015bdd9feba3))
* Option to use @wdio/elements' snapshot instead of element list ([cf1108f](https://github.com/Winify/wdio-agent-service/commit/cf1108f4f3da98c5e36ffa8f1777707b4c10f103))
* Remove unused provider config ([cbc7434](https://github.com/Winify/wdio-agent-service/commit/cbc7434179ef7f24f2c8f6864aa64ba94b27a3ea))
* Replace provider enum with schema-based config ([d59923a](https://github.com/Winify/wdio-agent-service/commit/d59923a01ded5564a0f1583901aa7a1fc30b45da))

## [0.2.0](https://github.com/Winify/wdio-agent-service/compare/v0.1.1...v0.2.0) (2026-02-16)

### Features

* Introduce provider support and configuration flexibility ([52899e1](https://github.com/Winify/wdio-agent-service/commit/52899e1032068ea3e995620b752d0c3a9eab2ec7))

## [0.1.1](https://github.com/Winify/wdio-agent-service/compare/v0.1.0...v0.1.1) (2026-02-08)

## 0.1.0 (2026-02-08)

### Features

* Add mobile platform support and enhance prompt handling ([4a34cab](https://github.com/Winify/wdio-agent-service/commit/4a34cab178ef6a0d3500e50659c9ce00ab1eb8bc))
* Add WebdriverIO agent service with LLM-powered browser automation ([3c9b27c](https://github.com/Winify/wdio-agent-service/commit/3c9b27cb8e744dea37c52c176bc1499fad86ca92))
* Replace custom browser element detection with @wdio/mcp/snapshot package ([27289a7](https://github.com/Winify/wdio-agent-service/commit/27289a7ab90277ad79f7ef42441ad116ccacc3c0))

### Bug Fixes

* Configure types with specific 'webdriverio' import ([5ee7399](https://github.com/Winify/wdio-agent-service/commit/5ee7399e7b4e22e0c8ced2f77914335d7cd1cc25))

### Refactoring

* Replace console logs with @wdio/logger for consistent logging ([5477576](https://github.com/Winify/wdio-agent-service/commit/54775765e6f28087430e6bf86811958bc78d32df))
