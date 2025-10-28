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
3. Build the plugin: `npm run build --workspace prettier-plugin-csharp`.
4. Restore the .NET host: `dotnet restore src/Dixie.Host`.
5. (Optional) Produce self-contained host binaries for packaging: `npm run build:host`.
6. Run the demo formatter over the sample corpus: `npm run demo`.

See `docs/architecture.md` for detailed plans and next steps.

## Installation Notes

During `npm install`, the plugin verifies the bundled host binary using `manifest.json`. Override behaviour via:

- `DIXIE_HOST_CACHE` — custom cache directory for downloaded/verified hosts.
- `DIXIE_HOST_PATH` — explicit path to a host binary (helpful for air-gapped environments or locally built snapshots).
- `DIXIE_TELEMETRY_FILE` — opt-in JSON lines log for format metrics; leave unset to disable.

To ship updated binaries as part of a release run `npm run build:host`; the script refreshes `packages/prettier-plugin-csharp/bin/` and the manifest with new checksums.
