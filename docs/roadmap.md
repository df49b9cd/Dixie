# Project Nika — Implementation Roadmap

> Time boxes are indicative and assume parallel effort across the TypeScript and .NET tracks.

## Milestone 0 — Foundations (Week 1–2)

**Objective:** Establish a reproducible workspace and baseline automation.

- [x] Lock package manager (npm workspaces) and Node runtime (>=22.21.0).
- [ ] Configure linting (`eslint`), formatting (`prettier`), and testing (`vitest`) for the plugin.
- [ ] Introduce commit tooling (editorconfig, husky/lint-staged) to guard code quality.
- [ ] Stand up GitHub Actions CI covering `npm run build`, `npm run lint`, `npm run test`, and `dotnet build`.
- [ ] Capture contributor guidelines (coding standards, branching model) in `CONTRIBUTING.md`.

## Milestone 1 — IPC Infrastructure (Week 2–4)

**Objective:** Ship a resilient communication layer between the Prettier plugin and Roslyn host.

- [ ] Define protocol schema (`initialize`, `format`, `shutdown`, `ping`, `version`) with `zod` in TS and record structs in C#.
- [ ] Implement framed messaging over stdio with timeouts, retries, and structured logging on both sides.
- [ ] Build `HostClient` lifecycle management (lazy spawn, health checks, shutdown hooks, concurrency queue).
- [ ] Extend host stub to echo structured responses and surface typed diagnostics.
- [ ] Add end-to-end integration tests that spin up the host and assert request/response semantics.

## Milestone 2 — Core Roslyn Formatting (Week 4–6)

**Objective:** Produce stable whole-file formatting via Roslyn that mirrors Prettier principles.

- [ ] Parse documents with `CSharpSyntaxTree.ParseText` and format via `Formatter.FormatAsync`.
- [ ] Map Prettier options (`printWidth`, `tabWidth`, `useTabs`, `endOfLine`) to Roslyn `Workspace` options.
- [ ] Preserve comments, directives, and trivia; verify against edge-case fixtures (XML docs, `#if`, `#nullable`).
- [ ] Return actionable diagnostics (e.g., parse errors) and ensure plugin displays friendly messages.
- [ ] Benchmark large files (>1k lines) to validate latency targets (<500 ms per format).

## Milestone 3 — Advanced Formatting & Partial Ranges (Week 6–8)

**Objective:** Handle modern C# syntax and editor-driven scenarios.

- [ ] Support C# 12 constructs (raw strings, primary constructors, collection expressions, `required`).
- [ ] Implement range/selection formatting inputs and map them to Roslyn `TextSpan`.
- [ ] Tune formatting of LINQ queries, pattern matching, attributes, interpolated strings, and directives.
- [ ] Build regression suites comparing output to canonical style guides and `dotnet format`.
- [ ] Profile host memory usage; add guards against runaway allocations.

## Milestone 4 — Tooling & Developer Experience (Week 7–9)

**Objective:** Make local usage, demos, and documentation intuitive.

- [ ] Create `npm run demo` script to format fixtures via Prettier CLI with the plugin.
- [ ] Assemble sample corpus (open-source snippets, Roslyn tests) with snapshot-based golden files.
- [ ] Produce developer docs: architecture, protocol reference, troubleshooting, FAQ.
- [ ] Add telemetry hooks (optional) or structured logs to aid issue triage while respecting privacy.
- [ ] Prepare VS Code launch configs/tasks for debugging the host and plugin concurrently.

## Milestone 5 — Packaging & Distribution (Week 8–10)

**Objective:** Deliver binaries and npm artifacts with reproducible builds.

- [ ] Publish host as self-contained ReadyToRun builds for macOS (x64/arm64), Windows (x64), Linux (x64/arm64).
- [ ] Automate release pipeline (GitHub Actions) to build, test, sign, and attach binaries to GitHub Releases.
- [ ] Implement plugin-side binary resolution, including checksum validation and helpful error surfaces.
- [ ] Add postinstall smoke test ensuring the bundled host launches and reports its version.
- [ ] Document manual installation path for air-gapped environments.

## Milestone 6 — Preview Release & Feedback Loop (Week 10–12)

**Objective:** Gather real-world usage data and iterate quickly.

- [ ] Tag `v0.1.0` preview on npm and publish release notes (supported syntax, limitations, known issues).
- [ ] Instrument opt-in usage metrics (format counts, average duration) with anonymized reporting.
- [ ] Set up feedback channels (GitHub discussions, template issues, Discord).
- [ ] Establish weekly triage cadence covering bug severity, feature requests, and protocol changes.
- [ ] Run compatibility validation across Node LTS, major OSes, and .NET runtime versions.

## Milestone 7 — General Availability Hardening (Week 12+)

**Objective:** Transition from preview to a reliable formatter for production teams.

- [ ] Close high-priority bugs from preview and backfill missing syntax coverage.
- [ ] Define upgrade policy (semantic versioning, Roslyn dependency cadence, C# language support timeline).
- [ ] Introduce migration guidance for teams switching from `dotnet-format` or Rider settings.
- [ ] Conduct security review (supply chain, dependency audit, binary provenance).
- [ ] Announce GA release with expanded documentation, blog post, and integration samples.

## Cross-Cutting Initiatives

- **Quality:** Maintain >90% unit/integration coverage for IPC and formatting critical paths; enforce snapshot diff reviews.
- **Performance:** Track p95 formatting latency, memory usage, and throughput; add perf regression jobs in CI.
- **Accessibility:** Ensure CLI output and documentation meet accessibility best practices; provide machine-readable logs.
- **Localization:** Evaluate future support for localized diagnostics or error messages.
- **Community:** Publish contribution guidelines, code of conduct, and roadmap updates each iteration.
