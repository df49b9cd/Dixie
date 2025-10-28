# Project Dixie Architecture

## Vision

- Deliver a Prettier plugin that formats C# using Roslyn-level fidelity while preserving Prettier ergonomics.
- Keep the user experience zero-config: minimal options, deterministic output, quick feedback, multiplatform support.
- Build a foundation that can evolve toward partial formatting, semantic aware rules, and integration with editor tooling.

## System Context

- Primary consumer: Prettier CLI or editor integrations invoking Prettier.
- Supporting services: Node.js runtime for the plugin, .NET runtime for the host binary, local filesystem for binaries and logs.
- External dependencies: Prettier 3.x API surface, Roslyn `Microsoft.CodeAnalysis` packages, OS process management.

## Core Components

- Prettier plugin (`packages/prettier-plugin-dixie`).
  - TypeScript implementation compiled to CommonJS.
  - Exposes `languages`, `parsers`, `printers`, and minimal configuration surface.
  - Manages host process lifecycle, transports messages, and returns formatted code to Prettier.
- Roslyn host (`src/Dixie.Host`).
  - .NET console application targeting net9/net10 (TBD) with self-contained distribution.
  - Uses Roslyn syntax and workspace APIs to parse, format, and emit diagnostics.
  - Runs as a persistent process per Prettier invocation or editor session.
- IPC layer.
  - StdIO transport with length-prefixed JSON frames.
  - Protocol inspired by LSP but tailored to formatting-only commands.
  - Handles retries, cancellation, and health checks.
- Tooling surfaces.
  - CLI entry points (npm scripts) for demos, regression tests, and release automation.
  - CI pipelines for cross-language builds and tests.

## IPC Protocol Overview

- Transport: UTF-8 text frames delimited by `Content-Length` header and blank line, matching LSP framing for tooling familiarity.
- Message schema (initial draft):
  - `initialize`: handshake with plugin version, host version, supported language features, preferred Roslyn language version.
  - `format`: carries document text, file path, optional range, Prettier options, session identifiers.
  - `shutdown`: graceful termination request from plugin.
  - `ping`: lightweight health check.
  - `error`: host-initiated failure notification (fatal or recoverable).
  - `log`: optional structured debug events (guarded by verbosity settings).
- Concurrency model: plugin serializes requests per host instance to keep Roslyn operations safe; future extensions may enable parallel hosts.
- Timeouts: plugin enforces configurable timeout per command; host returns progress events if needed.

## Formatting Pipeline

1. Prettier calls parser hook. Plugin builds lightweight placeholder AST referencing raw text and metadata.
2. Printer hook serializes request to host using host client abstraction.
3. Host receives `format`, parses text via `CSharpSyntaxTree.ParseText`, optionally creates or reuses `AdhocWorkspace`.
4. Host applies formatting with configured `Formatter.FormatAsync` or custom rules.
5. Host serializes response: formatted text, diagnostics, statistics (elapsed ms, node counts).
6. Plugin validates response, surfaces diagnostics (as comments or warnings), and returns formatted text to Prettier.
7. Host remains running for subsequent requests; plugin handles idle timeout to reclaim resources.

## Roslyn Host Architecture

- Entry layer reads frames, deserializes into command records, and dispatches to handlers.
- State management:
  - Workspace cache keyed by formatting options to avoid recreating `AdhocWorkspace`.
  - Syntax tree cache optional for experiments with incremental formatting.
  - Configuration object capturing mapping from Prettier options to Roslyn options.
- Formatting pipeline stages:
  - Preprocessing: handle line endings, BOM detection, encoding hints.
  - Parsing: `CSharpParseOptions` tuned to requested language version with preprocessor symbols support.
  - Formatting: `Formatter.FormatAsync` with `SyntaxFormattingOptions` override; fallback strategy when Roslyn cannot format (e.g., feature gap) to avoid data loss.
  - Postprocessing: ensure newline at EOF, ensure trailing whitespace trimmed, align with Prettier expectations.
- Diagnostics handling:
  - Collect parse diagnostics, convert to plugin-friendly structure (severity, span, message).
  - Provide quick hints for frequent issues (e.g., unsupported language version).
- Logging and telemetry:
  - Structured logs with correlation IDs to assist debugging.
  - Optional performance metrics (elapsed time, GC counts) gated behind verbosity flag.

## Prettier Plugin Architecture

- Parser stub returns minimal AST to satisfy Prettier contract; no heavy parsing occurs client-side.
- Host client responsibilities:
  - Discover host binary per platform (embedded path, user override).
  - Spawn process with configured environment, set up stdio streams, watch exit signals.
  - Serialize requests, await responses, handle JSON parse errors gracefully.
  - Implement exponential back-off and restart logic on host crash.
- Printer strategy:
  - Single top-level doc builder that proxies entire file output from host.
  - For partial formatting, printer may merge host output with original text based on ranges.
- Error surfacing:
  - On recoverable host errors, plugin returns original text and attaches warnings.
  - On fatal errors, plugin throws with actionable message instructing the user on remediation.
- Configuration exposure:
  - Respect core Prettier options automatically.
  - Consider minimal Dixie-specific options (language version override, host binary path).

## Packaging and Distribution

- Host binaries produced via `dotnet publish` with `PublishReadyToRun=true` for macOS, Windows, Linux, both x64 and arm64.
- Artifacts stored in GitHub Releases and referenced by npm package using deterministic filenames and SHA256 checksums.
- Plugin includes installer script that downloads binaries on demand or ships them under `vendor/<platform>`.
- Versioning contract: same major version across plugin and host; plugin verifies host version during handshake.
- Signing: evaluate code signing for Windows/macOS binaries to reduce SmartScreen friction.

## Operational Considerations

- Logging: plugin emits debug logs behind `DIXIE_LOG_LEVEL` env variable; host logs to stderr with correlation IDs.
- Metrics: optional JSON log entries for timing allow downstream tooling to collect metrics.
- Crash recovery: plugin auto-restarts host up to N attempts; beyond that, bubble failure to Prettier.
- Update strategy: plugin checks host version mismatch and prompts for reinstall when incompatible.

## Security and Trust

- Binaries shipped from official release channel with checksums; plugin verifies integrity before execution.
- Host executes arbitrary user code only via formatting; ensure no command execution paths exist.
- Enforce sandbox: restrict environment variables passed to host unless explicitly allowed.
- Provide documentation on how to audit or build host from source for self-hosted environments.

## Performance Targets

- Cold start (spawn host + first format) under 1.5 seconds on mid-range hardware.
- Warm format (<1k lines) under 400 ms p95; large files (<5k lines) under 2 seconds.
- Memory footprint per host under 300 MB RSS; release caches on idle.
- Include performance regression tests in CI comparing baseline versions.

## Compatibility Matrix

- Node: latest LTS (>=22.21.0) officially supported; test matrix includes Node 20 for early adopters if feasible.
- .NET runtime: host published self-contained, thus does not require user-installed .NET.
- OS: macOS 13+, Windows 10+, Ubuntu 20.04+ verified; ensure fallback for unsupported architectures.
- Prettier: target 3.x line; evaluate compatibility breaks when Prettier 4 releases.

## Future Enhancements

- Incremental formatting using Roslyn `Formatter.FormatAsync` span support plus Prettier range API.
- Semantic-aware rules (organize usings, attribute alignment) toggled via plugin options.
- Language Server Protocol bridge for editors wanting deeper integration.
- WASM experiments with Roslyn once feasible to reduce binary distribution burden.
- Telemetry dashboard for anonymous opt-in usage stats guiding prioritization.

## Implementation Checklist Snapshots

- Aligns with roadmap milestones: foundations, IPC, Roslyn integration, distribution, preview, GA.
- Maintain living diagram (PlantUML or Mermaid) to illustrate data flow; add once tooling decision made.
- Document protocol schema (`docs/protocol.md`) with examples and version negotiation rules.
- Establish interoperability tests with other formatters to validate deterministic output.
