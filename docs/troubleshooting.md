# Troubleshooting

## Host fails to launch

- Ensure the host has been built: `dotnet build src/Dixie.Host`.
- If the plugin cannot locate the binary, set `DIXIE_HOST_PATH` to the exact executable.
- On macOS and Linux, confirm the host binary has execute permissions (`chmod +x`).
- If `npm install` warns that no host is available, download the host archive for your platform from the GitHub release and place the executable at `bin/<rid>/dixie-host`, or set `DIXIE_HOST_PATH`.
- If postinstall reports a checksum mismatch, rebuild the host via `npm run build:host` and refresh `manifest.json` before publishing the release artifacts.

## Formatting falls back to original text

- The plugin logs a warning when it replays the original source.
- Run with `DIXIE_STRICT_HOST=1` to convert fallbacks into hard failures during CI.
- Inspect the telemetry log (if `DIXIE_TELEMETRY_FILE` is configured) for the failing request payload.

## Range formatting does nothing

- Prettier only attempts range formatting when `rangeStart`/`rangeEnd` differ and the editor reports the change.
- The host clamps invalid ranges; enable `DIXIE_LOG_LEVEL=debug` to verify the span being processed.

## High memory usage warnings

- The Roslyn host emits a warning when private memory exceeds `DIXIE_HOST_MEMORY_BUDGET_MB` (default 512 MB).
- Lower the concurrency by letting the worker restart between large requests, or reduce the budget via the environment variable to surface issues sooner.

## Tests hang when running from VS Code

- Use the `npm: test plugin` task or the `Run Vitest (plugin)` launch configuration to keep the Node debugger attached.
- Integration tests spawn the host—if the process cannot write to stdout because of shell restrictions, run `npm run test -- --runInBand` to prevent concurrency.
