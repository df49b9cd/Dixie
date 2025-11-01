# Release Process

## Prerequisites

- Ensure `npm run lint`, `npm run test --workspace @df49b9cd/prettier-plugin-csharp`, and `dotnet build src/Dixie.Host` all pass.
- Confirm `npm run build:host` produces fresh artifacts in `artifacts/<rid>` for every supported RID.

## Steps

1. Run `npm run build:host` to produce self-contained binaries for every RID (outputs land in `artifacts/<rid>`).
2. Refresh `packages/prettier-plugin-csharp/manifest.json` with the new version, sizes, and SHA-256 hashes.
3. Bump version numbers in `package.json` and `packages/prettier-plugin-csharp/package.json` (use `npm version`).
4. Commit and tag: `git commit -am "chore(release): vX.Y.Z" && git tag vX.Y.Z`.
5. Create a GitHub release for `vX.Y.Z` and upload the zipped host artifacts from step 1.
6. Publish the npm package from a clean tree: `npm publish`.

## CI Integration (future work)

- GitHub Actions workflow runs matrix `dotnet publish` for each RID and uploads artifacts.
- Publish job downloads artifacts, verifies checksums, writes manifest, and runs `npm publish`.
- Release notes assembled from `docs/faq.md` + changelog (to be added).
