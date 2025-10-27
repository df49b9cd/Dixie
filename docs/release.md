# Release Process

## Prerequisites

- Ensure `npm run lint`, `npm run test --workspace prettier-plugin-nika`, and `dotnet build src/Nika.Host` all pass.
- Confirm `npm run build:host` produces fresh artifacts in `artifacts/<rid>` for every supported RID.

## Steps

1. Run `npm run build:host` to produce self-contained binaries.
2. Update `manifest.json` (coming milestone) with new SHA-256 values.
3. Bump version numbers in `package.json` and `packages/prettier-plugin-nika/package.json` (use `npm version`).
4. Commit and tag: `git commit -am "chore(release): vX.Y.Z" && git tag vX.Y.Z`.
5. Publish npm package from a clean tree: `npm publish`.
6. Create a GitHub release attaching host artifacts generated in step 1.

## CI Integration (future work)

- GitHub Actions workflow runs matrix `dotnet publish` for each RID and uploads artifacts.
- Publish job downloads artifacts, verifies checksums, writes manifest, and runs `npm publish`.
- Release notes assembled from `docs/faq.md` + changelog (to be added).
