# Development Guide

## Prerequisites

- Node.js ≥ 22.21.0
- npm ≥ 10
- .NET SDK 9.0 preview (matching `src/Nika.Host`)

Run `npm install` followed by `dotnet restore src/Nika.Host` to hydrate both toolchains.

## Common Workflows

- `npm run build` – builds every workspace (TypeScript output lands in `dist/`).
- `npm run test --workspace prettier-plugin-nika` – builds the plugin then executes Vitest (integration tests spawn the Roslyn host).
- `dotnet build src/Nika.Host` – compiles the host and restores Roslyn dependencies.
- `npm run demo` – formats all C# fixtures with the built plugin so you can quickly inspect the output.

## Telemetry & Logging

- Set `NIKA_LOG_LEVEL=debug` to surface client/host debug logs.
- Optional JSON telemetry can be enabled by exporting `NIKA_TELEMETRY_FILE=/tmp/nika-telemetry.log`; every format request appends a line with timing, diagnostics, and range metadata.
- The host emits structured log notifications (level + context). When the process exceeds `NIKA_HOST_MEMORY_BUDGET_MB` (default 512MB) a warning is logged.

## VS Code Support

- `.vscode/launch.json` includes launch configs to run Vitest under the Node debugger and attach to the .NET host.
- `.vscode/tasks.json` mirrors common commands (`npm: demo`, `npm: test plugin`, `dotnet: build host`).

## Fixture Corpus

- Format samples live in `packages/prettier-plugin-nika/fixtures`. They are used by snapshot tests (`fixtures.test.ts`) and the demo script.
  - Add new scenarios here when verifying tricky trivia or language features.

## Conventions

- Keep Prettier option plumbing thread-safe—always normalise values before sending to the worker.
- For Roslyn changes, add tests that assert the formatted output for the relevant language feature or pattern.
- Host logs should avoid leaking file contents; environment variables control verbosity.
