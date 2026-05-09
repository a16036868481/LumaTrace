# Windows Release Approval Readiness Template

`pnpm verify:windows-release-approval-readiness-template` writes and verifies `lumatrace-windows-release-approval-readiness-template.json` under the Tauri release directory.

This file is a sanitized checklist for release approval readiness. It is not release approval and it does not make the build production-ready.

## Current Status

The template intentionally records:

- `status: "not_granted"`;
- `approvalGranted: false`;
- `rcCandidateReady: false`;
- `productionReady: false`;
- `unsignedDraft: true`;
- approver metadata not recorded;
- release notes not approved;
- manual GUI QA, license review, code signing, updater policy, and sidecar production readiness still required.

## What It Records

- relative evidence file names;
- SHA-256 hashes and sizes for existing evidence files;
- approval and required-evidence booleans;
- pending reviewer fields;
- security assertions.

It must not contain auth tokens, full local paths, reviewer notes, evidence notes, raw logs, raw stdout/stderr, stack traces, emails, command lines, raw CSV, or secrets.

## RC Gate Integration

`pnpm verify:windows-release-policy-template` links this template into the release approval section when present. `pnpm verify:windows-packaging-rc-gate` then uses it as the `release_approval` gate evidence while keeping the gate blocked until a real production release approval is granted.

If a reviewer supplies a sanitized `lumatrace-windows-release-approval-readiness-result.json`, `pnpm verify:windows-release-approval-readiness-result path/to/result.json` can validate that approval summary. That result may advance only the RC gate's `release_approval` gate. It still does not approve licenses, configure code signing, decide updater policy, grant sidecar production readiness, or change `productionReady=false`.

## Command

```bash
pnpm verify:windows-release-approval-readiness-template
pnpm verify:windows-release-approval-readiness-result path/to/result.json
pnpm smoke:windows-packaging-rc-gate-release-approval-result
pnpm verify:windows-release-policy-template
pnpm verify:windows-packaging-rc-gate
```

These commands do not approve a release, sign artifacts, configure an updater, publish artifacts, upload data, or alter `productionReady`.
