# Contributing to Project Dixie

Thanks for helping build a Roslyn-powered Prettier plugin for C#! This guide explains how to get your environment ready, the workflows we follow, and the quality checks every change must pass.

## Prerequisites

- Node.js ≥ 22.21.0 (LTS). Use a version manager such as `nvm` or `fnm` to switch quickly.
- npm ≥ 10 (bundled with Node 22).
- .NET SDK ≥ 9.0 preview (or whichever version matches `src/Dixie.Host/Dixie.Host.csproj`).
- macOS, Windows, or Linux with the ability to run self-contained .NET executables.

## Repository Setup

1. Install dependencies: `npm install`
   - The `prepare` script bootstraps Husky so Git hooks are ready after the first install.
2. Build the TypeScript sources: `npm run build --workspace prettier-plugin-csharp`
3. Restore and build the Roslyn host: `dotnet build src/Dixie.Host`

## Development Workflow

- Use feature branches; keep `main` releasable at all times.
- Write TypeScript in `packages/prettier-plugin-csharp/src` and C# in `src/Dixie.Host`.
- Keep pull requests focused. Preferable size: under 500 LOC diff unless justified.
- If your change touches the protocol, update `docs/protocol.md` with the new schema and version notes.

## Tooling Cheatsheet

- `npm run format` — runs Prettier for all workspaces (used automatically by lint-staged on staged files).
- `npm run lint` — executes ESLint in every workspace with a lint script.
- `npm run test` — runs Vitest (with integration coverage that exercises the host handshake).
- `npm run build` — compiles all TypeScript packages.
- `dotnet build src/Dixie.Host` — builds the Roslyn host; required for integration tests.

## Quality Gates

- `npm run lint`
- `npm run test`
- `npm run build`
- `dotnet build src/Dixie.Host`

CI enforces the same commands. Run them locally before opening a PR.

## Formatting & Pre-commit Hooks

- Prettier is configured according to `.prettierrc.json`; keep your editor aligned or run `npm run format`.
- Husky + lint-staged automatically format staged files and run ESLint on TypeScript before each commit. If a hook fails, fix the issues and recommit.
- Avoid bypassing hooks unless you have maintainer approval.

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

Project Dixie follows the Contributor Covenant. Respectful communication and inclusive behavior are mandatory.

Thank you for contributing!
