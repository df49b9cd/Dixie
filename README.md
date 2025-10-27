# Project Nika

Prettier plugin for C# powered by a persistent Roslyn host process.

Targets the latest Roslyn preview so C# 12, 13, and 14 syntax (raw strings, partial properties, optional lambda parameters, collection expressions, etc.) format correctly without waiting for compiler updates.

## Packages

- `packages/prettier-plugin-nika`: JavaScript bridge that integrates with Prettier and forwards formatting requests to the host.
- `src/Nika.Host`: .NET console application that will expose formatting via Roslyn.

## Development

1. Ensure Node.js LTS (>=22.21.0) is installed.
2. Install dependencies with npm: `npm install`.
3. Build the plugin: `npm run build --workspace prettier-plugin-nika`.
4. Restore the .NET host: `dotnet restore src/Nika.Host`.

See `docs/architecture.md` for detailed plans and next steps.
