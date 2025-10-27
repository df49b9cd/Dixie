# Milestone 6 – Preview Release & Feedback Loop

## Release Deliverables

- Version bump to `v0.1.0-preview` across package manifests.
- Publish npm package with bundled host binaries (manifest verified).
- GitHub Release including changelog, supported syntax matrix, known issues, binaries.

## Feedback Channels

- GitHub Discussions: create `feedback` category with templates for issues/ideas.
- GitHub Issue templates: `bug-report`, `feature-request`, `host-crash`.
- Optional Discord server invite link (if opened) documented in README.

## Telemetry Plan

- Opt-in environment variable: `NIKA_TELEMETRY_FILE` (local), future `NIKA_TELEMETRY_ENDPOINT` for anonymized metrics.
- Data points: format duration, diagnostics count, host restarts.
- Document privacy stance (no source code or identifiers sent).

## Compatibility Matrix

- Node.js LTS (22.x), .NET runtime versions (self-contained, thus independent), OS verification matrix (macOS 13+, Windows 10+, Ubuntu 20.04+).
- Add README table summarizing tested combinations.

## Preview Timeline

- Week 10: collect stabilization bugs, final test pass, tag preview.
- Week 11-12: weekly triage meetings, collate feedback, plan Milestone 7 work.
