# Windows Packaging RC Gate

This document describes the Windows packaging RC gate. It is a structured blocker manifest for QA drafts, not a production release approval.

## Purpose

`pnpm verify:windows-packaging-rc-gate` writes and verifies `lumatrace-windows-packaging-rc-gate.json` under the Tauri release directory. The manifest summarizes the release gates that must be closed before a Windows build can be considered a release candidate.

The gate intentionally keeps:

- `status: "blocked"`
- `rcCandidateReady: false`
- `productionReady: false`
- `unsignedDraft: true`

until the required production work is genuinely complete.

## Inputs

The RC gate reads sanitized summaries from:

- `sidecar-manifest.json`
- `packaging-notices.json`
- `lumatrace-windows-packaging-smoke-suite-manifest.json`
- `lumatrace-windows-packaging-qa-evidence.json`
- `lumatrace-installer-draft-manifest.json`
- `lumatrace-windows-packaging-release-readiness.json`
- `lumatrace-windows-release-policy-template.json`

Only file names, hashes, sizes, statuses, and blocker codes are recorded. Reviewer notes, raw logs, command lines, local paths, tokens, and stack traces are not copied into the RC gate manifest.

## Gates

The RC gate tracks:

- automated Windows packaging smoke suite;
- sanitized Windows packaging QA evidence;
- manual installed-app GUI QA;
- unsigned Windows installer draft;
- self-contained sidecar draft;
- sidecar production readiness;
- bundled runtime and dependency license notice review;
- Windows code signing;
- updater policy;
- production release approval.

Automated smoke success is not enough to pass the RC gate. Manual GUI QA, signing, updater policy, license review, production sidecar readiness, and release approval remain separate blockers.

The code signing, updater, release approval, and license review gates use [windows-release-policy-template.md](windows-release-policy-template.md) as sanitized draft policy evidence. That template is expected to remain `draft_blocked` until real production policy inputs are reviewed and approved.

`pnpm smoke:windows-packaging-rc-gate-full-results` is available as a bounded verifier for the gate machinery. It creates sanitized synthetic result files for manual GUI QA, license review, code signing, updater policy, sidecar production readiness, and release approval, checks that all six gates can pass together, and restores the previous files afterward. It is not release approval and still requires `rcCandidateReady: false` plus `productionReady: false`.

`pnpm verify:windows-rc-status` is a CLI-only summary on top of the existing RC evidence. It writes `lumatrace-windows-rc-status.json` with the same sanitized blocker codes, gate counts, and next actions surfaced in packaged diagnostics. It does not create or import result files, does not remove blockers, and keeps `productionReady: false`.

## Command

```bash
pnpm verify:windows-packaging-rc-gate
pnpm verify:windows-rc-status
pnpm smoke:windows-packaging-rc-gate-full-results
```

Run it after:

```bash
pnpm verify:windows-packaging-release-readiness
pnpm verify:windows-release-policy-template
```

The command does not build installers, sign binaries, configure an updater, upload artifacts, or run arbitrary shell commands from the desktop UI.

## Security

The RC gate manifest must not include:

- auth tokens;
- `lumatrace-auth.*` WebSocket tokens;
- full local user paths;
- raw logs;
- raw stdout/stderr;
- command lines;
- raw PresentMon CSV;
- logcat or bugreport data;
- Android full serials;
- stack traces.

## Current Status

For Milestone 4B packaging hardening, the expected result is still blocked. The current Windows sidecar draft can be self-contained and can avoid requiring a system Node runtime, but `productionReady` remains false until production signing, updater policy, license review, manual GUI QA, and release approval are complete.
