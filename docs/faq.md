# Frequently Asked Questions

## Which C# versions are supported?

The host pulls Roslyn preview packages, so language features up to C# 14 (partial properties, `params ReadOnlySpan<T>`, enhanced switch patterns, etc.) format correctly out of the box. The plugin will track future previews; pin Roslyn packages if you need to freeze behaviour.

## How do I collect performance data?

- Every format response returns a `metrics` object (`elapsedMs`, `parseDiagnostics`).
- Enable telemetry by setting `NIKA_TELEMETRY_FILE`. Each format request appends a JSON line with timings, diagnostics, and range information—perfect for offline analysis.

## Can I debug the host and plugin together?

Yes. Use the VS Code launch configurations under `.vscode/launch.json` to run Vitest under the Node debugger or attach to the .NET host. The `npm run demo` script provides a quick manual smoke test over the sample fixtures.

## Where are sample files stored?

- See `packages/prettier-plugin-nika/fixtures` for canonical formatting examples.
- Snapshot tests keep the formatted output guarded in CI (`fixtures.test.ts`).

## How do I report log output from the host?
- Set `NIKA_LOG_LEVEL=debug`. The host emits structured notifications (`log` command) that include context objects—these appear in the plugin when running Vitest or Prettier CLI.
- Host binaries are verified during installation. Set `NIKA_HOST_CACHE` to control where downloaded binaries live, or `NIKA_HOST_PATH` to override the binary completely (useful for custom builds).

Set `NIKA_LOG_LEVEL=debug`. The host emits structured notifications (`log` command) that include context objects—these appear in the plugin when running Vitest or Prettier CLI.
