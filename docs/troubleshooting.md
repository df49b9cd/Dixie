# Troubleshooting

## Host fails to launch

- Ensure the host has been built: `dotnet build src/Nika.Host`.
- If the plugin cannot locate the binary, set `NIKA_HOST_PATH` to the exact executable.
- On macOS and Linux, confirm the host binary has execute permissions (`chmod +x`).

## Formatting falls back to original text

- The plugin logs a warning when it replays the original source.
- Run with `NIKA_STRICT_HOST=1` to convert fallbacks into hard failures during CI.
- Inspect the telemetry log (if `NIKA_TELEMETRY_FILE` is configured) for the failing request payload.

## Range formatting does nothing

- Prettier only attempts range formatting when `rangeStart`/`rangeEnd` differ and the editor reports the change.
- The host clamps invalid ranges; enable `NIKA_LOG_LEVEL=debug` to verify the span being processed.

## High memory usage warnings

- The Roslyn host emits a warning when private memory exceeds `NIKA_HOST_MEMORY_BUDGET_MB` (default 512 MB).
- Lower the concurrency by letting the worker restart between large requests, or reduce the budget via the environment variable to surface issues sooner.

## Tests hang when running from VS Code

- Use the `npm: test plugin` task or the `Run Vitest (plugin)` launch configuration to keep the Node debugger attached.
- Integration tests spawn the host—if the process cannot write to stdout because of shell restrictions, run `npm run test -- --runInBand` to prevent concurrency.
