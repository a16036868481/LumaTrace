# Windows Release Gate Handoff

`pnpm verify:windows-release-gate-handoff` writes and verifies a sanitized handoff packet for the remaining Windows RC blockers:

- `lumatrace-windows-release-gate-handoff/`;
- `lumatrace-windows-release-gate-handoff-manifest.json`.

This handoff is not release approval. It does not sign artifacts, configure an updater, run manual GUI QA, approve licenses, approve the sidecar for production, or change `productionReady=false`.

## What It Includes

The handoff includes sanitized manifests and templates only:

- Windows packaging RC gate;
- Windows packaging release readiness;
- Windows release policy template;
- Windows manual GUI QA template;
- Windows manual GUI QA handoff manifest;
- sidecar production readiness template;
- license review template;
- code signing readiness template;
- updater policy readiness template;
- release approval readiness template;
- sidecar manifest;
- packaging notice manifest;
- generated README with gate actions.

It intentionally excludes release gate result files, reviewer notes, evidence notes, raw logs, raw stdout/stderr, command lines, raw license text, raw PresentMon CSV, logcat, bugreport data, Android full serials, auth tokens, stack traces, and full local user paths.

## Gate Actions

Each blocker remains a separate gate:

- `MANUAL_GUI_QA`: fill `lumatrace-windows-manual-gui-qa-result.json`, then run `pnpm verify:windows-manual-gui-qa-result path/to/lumatrace-windows-manual-gui-qa-result.json`.
- `SIDECAR_PRODUCTION_READINESS`: fill `lumatrace-windows-sidecar-production-readiness-result.json`, then run `pnpm verify:windows-sidecar-production-readiness-result path/to/lumatrace-windows-sidecar-production-readiness-result.json`.
- `LICENSE_NOTICE_REVIEW`: fill `lumatrace-windows-license-review-result.json`, then run `pnpm verify:windows-license-review-result path/to/lumatrace-windows-license-review-result.json`.
- `CODE_SIGNING`: fill `lumatrace-windows-code-signing-readiness-result.json`, then run `pnpm verify:windows-code-signing-readiness-result path/to/lumatrace-windows-code-signing-readiness-result.json`.
- `UPDATER_POLICY`: fill `lumatrace-windows-updater-policy-readiness-result.json`, then run `pnpm verify:windows-updater-policy-readiness-result path/to/lumatrace-windows-updater-policy-readiness-result.json`.
- `RELEASE_APPROVAL`: fill `lumatrace-windows-release-approval-readiness-result.json`, then run `pnpm verify:windows-release-approval-readiness-result path/to/lumatrace-windows-release-approval-readiness-result.json`.

After any result verifies, refresh the RC gate with:

```bash
pnpm verify:windows-packaging-rc-gate
```

Passing one gate removes only that gate's blocker. It does not approve any other gate and it does not make the build production-ready.

## Command

```bash
pnpm verify:windows-release-gate-handoff
```

The command refreshes the current reviewer bundle and release templates before writing the handoff. It does not upload artifacts, run arbitrary shell commands from the desktop UI, enable updater behavior, sign binaries, or change release approval.

## Security

The handoff must remain sanitized:

- tokens are redacted;
- full local paths are excluded;
- raw logs are excluded;
- raw stdout/stderr are excluded;
- reviewer notes and evidence notes are excluded;
- raw license text is excluded;
- command lines are excluded;
- stack traces are excluded.

`productionReady` and `rcCandidateReady` remain false in this handoff.
