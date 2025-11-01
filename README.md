# Project Dixie

Prettier plugin for C# powered by a persistent Roslyn host process.

Targets the latest Roslyn preview so C# 12, 13, and 14 syntax (raw strings, partial properties, optional lambda parameters, collection expressions, etc.) format correctly without waiting for compiler updates.

Additional docs:

- `docs/development.md` – day-to-day workflows, telemetry, and VS Code setup.
- `docs/troubleshooting.md` – common failure modes and mitigations.
- `docs/faq.md` – language feature coverage and debugging tips.
- `docs/packaging-strategy.md` – plan for shipping host binaries via npm.
- `docs/release.md` – release checklist for npm/GitHub packages.

## Packages

- `packages/prettier-plugin-csharp`: JavaScript bridge that integrates with Prettier and forwards formatting requests to the host.
- `src/Dixie.Host`: .NET console application that will expose formatting via Roslyn.

## Development

1. Ensure Node.js LTS (>=22.21.0) is installed.
2. Install dependencies with npm: `npm install`.
3. Build the plugin: `npm run build --workspace @df49b9cd/prettier-plugin-csharp`.
4. Restore the .NET host: `dotnet restore src/Dixie.Host`.
5. (Optional) Produce self-contained host binaries for packaging: `npm run build:host`.
6. Run the demo formatter over the sample corpus: `npm run demo`.

See `docs/architecture.md` for detailed plans and next steps.

## Installation Notes

The npm package installs without Dixie.Host binaries to stay within registry size limits. Download the archive for your platform from the Project Dixie GitHub releases page, then either:

- place the extracted executable at `node_modules/@df49b9cd/prettier-plugin-csharp/bin/<rid>/dixie-host`, or
- point the plugin to the binary with the `DIXIE_HOST_PATH` environment variable.

`manifest.json` records expected checksums; the postinstall script verifies the binary when present and otherwise emits guidance. Useful environment variables:

- `DIXIE_HOST_PATH` — explicit path to a host binary (useful for air-gapped setups or custom builds).
- `DIXIE_POSTINSTALL_SKIP_SMOKE` — set to `1` to skip the host smoke test during installation.
- `DIXIE_TELEMETRY_FILE` — opt-in JSON lines log for format metrics; leave unset to disable.

Before publishing a new release, run `npm run build:host` to refresh `packages/prettier-plugin-csharp/bin/` and `manifest.json`, then attach the binaries to the GitHub release so consumers can download them manually.
