# Windows Updater Policy Readiness Template

`pnpm verify:windows-updater-policy-readiness-template` writes and verifies `lumatrace-windows-updater-policy-readiness-template.json` under the Tauri release directory.

This file is a sanitized checklist for updater readiness. It is not an updater implementation and it is not production approval.

## Current Status

The template intentionally records:

- `status: "not_configured"`;
- `configured: false`;
- `productionReady: false`;
- `unsignedDraft: true`;
- updater provider not configured;
- update signing not configured;
- rollback and staged rollout not configured;
- update manifest verification not configured.

## What It Records

- relative artifact file names;
- SHA-256 hashes and sizes for existing draft manifests;
- updater, update-signing, rollback, and verification booleans;
- pending reviewer fields;
- security assertions.

It must not contain auth tokens, full local paths, updater endpoint secrets, private keys, passwords, update signing command lines, raw logs, raw stdout/stderr, stack traces, or secrets.

## RC Gate Integration

`pnpm verify:windows-release-policy-template` links this template into the updater section when present. `pnpm verify:windows-packaging-rc-gate` then uses it as the `updater_policy` gate evidence while keeping the gate blocked until a real updater strategy, update signing, rollback policy, and verification evidence exist.

If a reviewer supplies a sanitized `lumatrace-windows-updater-policy-readiness-result.json`, `pnpm verify:windows-updater-policy-readiness-result path/to/result.json` can validate that the updater policy has been decided. The 4B-compatible result may document that automatic updates remain disabled for the initial release, but it must still provide sanitized strategy, update-signing policy, rollback, staged rollout, and verification summaries. It does not enable updater code or publish update metadata.

## Command

```bash
pnpm verify:windows-updater-policy-readiness-template
pnpm verify:windows-updater-policy-readiness-result path/to/result.json
pnpm verify:windows-release-policy-template
pnpm verify:windows-packaging-rc-gate
```

These commands do not configure Tauri updater, host update metadata, sign update artifacts, test rollback, approve a release, or alter `productionReady`.
