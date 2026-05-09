# Windows RC Reviewer Bundle

`pnpm verify:windows-rc-reviewer-bundle` writes and verifies a sanitized reviewer bundle under the Tauri release directory:

- `lumatrace-windows-rc-reviewer-bundle/`;
- `lumatrace-windows-rc-reviewer-bundle-manifest.json`.

This bundle is a release-review handoff packet. It is not release approval and it does not make the build production-ready.

## What It Includes

The bundle copies sanitized JSON evidence manifests and a generated README:

- Windows packaging QA evidence;
- Windows release readiness;
- Windows RC gate;
- Windows release policy template;
- sidecar production readiness template;
- license review template;
- code signing readiness template;
- updater policy readiness template;
- release approval readiness template;
- manual GUI QA template;
- manual GUI QA handoff manifest;
- sidecar manifest;
- packaging notice manifest.

It intentionally does not copy raw logs, raw stdout/stderr, command lines, raw PresentMon CSV, raw license text, reviewer notes, evidence notes, logcat, bugreport, Android full serials, auth tokens, or full local user paths.

## Expected Status

The bundle keeps:

- `status: "review_bundle_ready"`;
- `rcCandidateReady: false`;
- `productionReady: false`;
- `unsignedDraft: true`.

The RC blockers remain visible and blocked until the real release process supplies approved evidence.

If a validated passed manual GUI QA result has already been summarized into the Windows QA evidence, the bundle may show `manual_gui_qa` as passed and omit the `MANUAL_GUI_QA` blocker. That only records manual QA progress. It still keeps `rcCandidateReady: false` and `productionReady: false` until sidecar production readiness, license review, code signing, updater policy, and release approval are complete.

If a validated approved license review result has already been used by the RC gate, the bundle may show `license_notice_review` as passed and omit the `LICENSE_NOTICE_REVIEW` blocker. The bundle still excludes reviewer notes and raw license text, and it still keeps `rcCandidateReady: false` plus `productionReady: false` until the remaining release gates are complete.

If a validated code signing readiness result has already been used by the RC gate, the bundle may show `code_signing` as passed and omit the `CODE_SIGNING` blocker. The bundle still excludes certificate secrets, private key paths, signing command lines, raw verification logs, and full local paths, and it still keeps `rcCandidateReady: false` plus `productionReady: false` until the remaining release gates are complete.

If a validated updater policy readiness result has already been used by the RC gate, the bundle may show `updater_policy` as passed and omit the `UPDATER_POLICY` blocker. The bundle still excludes updater endpoint secrets, update signing commands, raw logs, keys, and full local paths. It does not enable automatic updates and it still keeps `rcCandidateReady: false` plus `productionReady: false` until the remaining release gates are complete.

If a validated sidecar production readiness result has already been used by the RC gate, the bundle may show `sidecar_production_readiness` as passed and omit the `SIDECAR_PRODUCTION_READINESS` blocker. The bundle still excludes auth tokens, full local paths, raw logs, stdout/stderr, command lines, and stack traces. It does not approve licenses, signing, updater policy, or release approval, and it still keeps `rcCandidateReady: false` plus `productionReady: false`.

If a validated release approval readiness result has already been used by the RC gate, the bundle may show `release_approval` as passed and omit the `RELEASE_APPROVAL` blocker. The bundle still excludes reviewer notes, evidence notes, tokens, full local paths, raw logs, command lines, and stack traces. It does not configure signing, decide updater policy, approve licenses, grant sidecar production readiness, or change `productionReady: false`.

## Command

```bash
pnpm verify:windows-rc-reviewer-bundle
```

This command does not approve a release, sign artifacts, configure an updater, run manual GUI QA, upload data, or alter `productionReady`.
