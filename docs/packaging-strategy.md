# Packaging Strategy (Milestone 5)

## Objectives

- Ship self-contained, ReadyToRun host binaries for macOS (x64/arm64), Windows (x64), and Linux (x64/arm64).
- Cache binaries in npm so install-time bootstrapping is deterministic and works offline.
- Provide integrity guarantees (SHA-256 manifest) and fallbacks when platform binaries are unavailable.

## Proposed Layout

```
packages/prettier-plugin-nika/
  bin/
    <platform>/nika-host
    manifest.json         # sha256 + size + version metadata
  scripts/
    postinstall.mjs       # downloads missing binaries, verifies checksum
```

The npm tarball ships with the `bin/` directory populated for common platforms. During `postinstall`, we validate the requested binary against the manifest and download it only when missing, storing cached copies in `~/.cache/nika/<version>/<platform>/`.

## Host Build Automation

Add a `dotnet publish` script that targets each RID:

```
dotnet publish src/Nika.Host \
  -c Release \
  -r osx-arm64 --self-contained true --property:PublishReadyToRun=true --output artifacts/osx-arm64
```

Repeat for `osx-x64`, `win-x64`, `linux-x64`, `linux-arm64`.

These commands run in CI and drop zipped outputs (`nika-host-<platform>.zip`).

## Manifest Format

```json
{
  "version": "0.1.0",
  "binaries": {
    "darwin-arm64": {
      "path": "bin/darwin-arm64/nika-host",
      "sha256": "…",
      "size": 12345678
    },
    "linux-x64": { "path": "…" }
  }
}
```

The postinstall script loads the manifest and verifies the on-disk binary matches the recorded hash.

## Release Pipeline Sketch

1. GitHub Actions workflow builds all RIDs in parallel.
2. Upload zipped binaries as artifacts.
3. `npm-publish` job downloads artifacts, populates `bin/`, regenerates `manifest.json`, bumps version, and publishes with `npm publish`.

## Next Tasks

- [x] Script `dotnet publish` wrappers for each RID (`npm run build:host`).
- [x] Implement `postinstall` script that verifies/downloads binaries (`scripts/postinstall.mjs`).
- [ ] Generate `manifest.json` in CI with checksums.
- [ ] Extend README with installation instructions and binary override env vars.
