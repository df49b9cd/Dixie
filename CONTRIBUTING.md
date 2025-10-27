# Contributing to Project Nika

Thanks for helping build a Roslyn-powered Prettier plugin for C#! This guide explains how to get your environment ready, the workflows we follow, and the quality checks every change must pass.

## Prerequisites
- Node.js ≥ 22.21.0 (LTS). Use a version manager such as `nvm` or `fnm` to switch quickly.
- npm ≥ 10 (bundled with Node 22).
- .NET SDK ≥ 9.0 preview (or whichever version matches `src/Nika.Host/Nika.Host.csproj`).
- macOS, Windows, or Linux with the ability to run self-contained .NET executables.

## Repository Setup
1. Install dependencies: `npm install`
2. Build the plugin: `npm run build --workspace prettier-plugin-nika`
3. Restore .NET packages: `dotnet restore src/Nika.Host`

## Development Workflow
- Use feature branches; keep `main` releasable at all times.
- Write TypeScript in `packages/prettier-plugin-nika/src` and C# in `src/Nika.Host`.
- Keep pull requests focused. Preferable size: under 500 LOC diff unless justified.
- If your change touches the protocol, update `docs/protocol.md` with the new schema and version notes.

## Quality Gates
- `npm run lint --workspace prettier-plugin-nika`
- `npm run test --workspace prettier-plugin-nika`
- `npm run build --workspaces`
- `dotnet build src/Nika.Host`

CI enforces the same commands. Run them locally before opening a PR.

## Coding Standards
- Follow Prettier defaults (`.prettierrc.json`) for all JS/TS/JSON files.
- Lint clean with ESLint; avoid suppressions. If unavoidable, include a short comment explaining why.
- Keep TypeScript strict (no implicit `any`). Use explicit return types for exported functions.
- In C#, prefer `readonly` fields, `async` suffix for async methods, and configure Roslyn formatting via `Formatter` APIs rather than manual string manipulation.

## Commit & PR Tips
- Write meaningful commit messages (`feat: add host client` / `fix: handle host retries`).
- Reference issues using `Fixes #123` when applicable.
- Include screenshots or logs when fixing user-visible issues or crashes.
- For significant features, add a short design note in `docs/` and link it in the PR description.

## Support & Discussion
- Use GitHub Discussions (planned) for design questions.
- File bugs with reproduction steps, environment details, and host logs if available.
- Join the planned Discord/Matrix channel (see README once available) for live collaboration.

## Security
- Do not commit secrets, tokens, or private certificates.
- Report vulnerabilities privately to the maintainers before disclosing.

## Code of Conduct
Project Nika follows the Contributor Covenant. Respectful communication and inclusive behavior are mandatory.

Thank you for contributing!
