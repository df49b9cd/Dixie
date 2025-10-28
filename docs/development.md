# Development Guide

## Prerequisites

- Node.js ≥ 22.21.0
- npm ≥ 10
- .NET SDK 9.0 preview (matching `src/Dixie.Host`)

Run `npm install` followed by `dotnet restore src/Dixie.Host` to hydrate both toolchains.

## Common Workflows

- `npm run build` – builds every workspace (TypeScript output lands in `dist/`).
- `npm run test --workspace prettier-plugin-c-sharp` – builds the plugin then executes Vitest (integration tests spawn the Roslyn host).
- `dotnet build src/Dixie.Host` – compiles the host and restores Roslyn dependencies.
- `npm run build:host` – publishes ReadyToRun binaries for each RID, syncs them into `packages/prettier-plugin-c-sharp/bin/`, and refreshes `manifest.json`.
- `npm run demo` – formats all C# fixtures with the built plugin so you can quickly inspect the output (`DIXIE_DEMO_TIMEOUT_MS` controls the per-file timeout).

## Telemetry & Logging

- Set `DIXIE_LOG_LEVEL=debug` to surface client/host debug logs.
- Optional JSON telemetry can be enabled by exporting `DIXIE_TELEMETRY_FILE=/tmp/dixie-telemetry.log`; every format request appends a line with timings, diagnostics, and range metadata.
- Host binaries are validated during `npm install` by `scripts/postinstall.mjs`; set `DIXIE_HOST_CACHE` to override where verified binaries are cached.
- The host emits structured log notifications (level + context). When the process exceeds `DIXIE_HOST_MEMORY_BUDGET_MB` (default 512MB) a warning is logged.

## VS Code Support

- `.vscode/launch.json` includes launch configs to run Vitest under the Node debugger and attach to the .NET host.
- `.vscode/tasks.json` mirrors common commands (`npm: demo`, `npm: test plugin`, `dotnet: build host`).

## Fixture Corpus

- Format samples live in `packages/prettier-plugin-c-sharp/fixtures`. They are used by snapshot tests (`fixtures.test.ts`) and the demo script.
  - Add new scenarios here when verifying tricky trivia or language features.

## Conventions

- Keep Prettier option plumbing thread-safe—always normalise values before sending to the worker.
- For Roslyn changes, add tests that assert the formatted output for the relevant language feature or pattern.
- Host logs should avoid leaking file contents; environment variables control verbosity.
