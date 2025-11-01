# Packaging Strategy (Milestone 5)

## Objectives

- Publish ReadyToRun host binaries for macOS (x64/arm64), Windows (x64), and Linux (x64/arm64) without inflating the npm tarball.
- Keep installation deterministic by recording checksums in `manifest.json` and verifying any manually provided host binary.
- Document clear fallbacks for air-gapped environments (`DIXIE_HOST_PATH`) and provide guidance for downloading binaries from GitHub releases.

## Package Layout

```
packages/prettier-plugin-csharp/
  bin/
    <rid>/dixie-host     # empty in the npm tarball; populated by release artifacts or developers
  manifest.json          # version + sha256 + download template / release page
  scripts/
    postinstall.mjs      # verifies checksum, runs smoke test when a host is present
```

The npm package ships the manifest and verification script but omits the binaries themselves. During `npm install`, `postinstall.mjs` checks for an existing host, validates its checksum, and warns when none is available. Consumers download the appropriate archive from the GitHub release and drop the executable under `bin/<rid>` or point `DIXIE_HOST_PATH` at it.

## Host Build Automation

`npm run build:host` wraps `dotnet publish` for each runtime identifier:

```
dotnet publish src/Dixie.Host \
  -c Release \
  -r osx-arm64 \
  --self-contained true \
  -p:PublishReadyToRun=true \
  -o artifacts/osx-arm64
```

Repeat for `osx-x64`, `win-x64`, `linux-x64`, and `linux-arm64`. CI zips each output (`dixie-host-<rid>.zip`) and uploads them as workflow artifacts ready for the release page.

## Manifest Format

```json
{
  "version": "0.2.4",
  "releasePage": "https://github.com/project-dixie/dixie/releases",
  "downloadTemplate": "https://github.com/project-dixie/dixie/releases/download/v{version}/dixie-host-{platform}.zip",
  "binaries": {
    "osx-arm64": {
      "path": "bin/osx-arm64/dixie-host",
      "sha256": "…",
      "size": 254341674
    }
  }
}
```

`downloadTemplate` provides a friendly hint for where the release artifacts live but `postinstall` will only validate binaries already present on disk. Developers can regenerate the manifest after running `npm run build:host` to keep hashes current.

## Release Pipeline

1. GitHub Actions workflow builds all RIDs in parallel and produces zipped artifacts.
2. The release workflow uploads these archives to the GitHub release associated with the tag (e.g. `v0.2.4`).
3. `manifest.json` is refreshed with the latest version/hash metadata and published as part of the npm package.
4. The npm publish step runs without host binaries; consumers download the matching archive post-install.

## Next Tasks

- [x] Script `dotnet publish` wrappers for each RID (`npm run build:host`).
- [x] Implement `postinstall.mjs` verification logic that tolerates missing binaries.
- [ ] Automate manifest regeneration in CI, including SHA-256 computation.
- [ ] Add a helper script (or docs) that downloads and unpacks release archives for local testing.
