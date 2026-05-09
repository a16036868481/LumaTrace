# Windows Release Policy Template

`pnpm verify:windows-release-policy-template` writes and verifies `lumatrace-windows-release-policy-template.json` under the Tauri release directory.

This file is a sanitized policy input for the Windows packaging RC gate. It is not production approval.

## Current Status

The template intentionally records:

- `status: "draft_blocked"`;
- `rcCandidateReady: false`;
- `productionReady: false`;
- `unsignedDraft: true`;
- code signing `not_configured`;
- updater `not_configured`;
- release approval `not_granted`;
- license review `draft_requires_review`.

The template keeps all release policy gates blocked until the real release process supplies approved evidence.

`pnpm verify:windows-license-review-template` generates the separate `lumatrace-windows-license-review-template.json` input from `packaging-notices.json` and `THIRD-PARTY-NOTICES.md`. It records component metadata, hashes, missing-license counts, pending reviewer fields, and `approved: false`; it does not copy raw license text and does not approve the release.

If a validated `lumatrace-windows-license-review-result.json` is present, `pnpm verify:windows-license-review-result path/to/result.json` can mark only the license review policy as approved. The release policy still keeps `status: "draft_blocked"`, `rcCandidateReady: false`, and `productionReady: false` until signing, updater policy, sidecar production readiness, and release approval are complete.

`pnpm verify:windows-code-signing-readiness-template` generates the separate `lumatrace-windows-code-signing-readiness-template.json` input from unsigned release artifacts. It records relative artifact names, SHA-256 hashes, and pending certificate/timestamp/verification fields. It does not invoke signtool, store certificate paths, store private keys, copy signing command lines, or approve the release.

If a validated `lumatrace-windows-code-signing-readiness-result.json` is present, `pnpm verify:windows-code-signing-readiness-result path/to/result.json` can mark only the code signing policy as `configured_verified`. The release policy still keeps `status: "draft_blocked"`, `rcCandidateReady: false`, and `productionReady: false` until updater policy, sidecar production readiness, and release approval are complete.

`pnpm verify:windows-updater-policy-readiness-template` generates the separate `lumatrace-windows-updater-policy-readiness-template.json` input from draft packaging artifacts. It records relative artifact names, SHA-256 hashes, and pending updater/update-signing/rollback/verification fields. It does not configure Tauri updater, publish update metadata, store endpoint secrets, store private keys, copy update signing command lines, or approve the release.

If a validated `lumatrace-windows-updater-policy-readiness-result.json` is present, `pnpm verify:windows-updater-policy-readiness-result path/to/result.json` can mark only the updater policy as `policy_decided`. The release policy still keeps `status: "draft_blocked"`, `rcCandidateReady: false`, and `productionReady: false` until sidecar production readiness and release approval are complete. The result does not enable automatic updates; the 4B-compatible policy keeps `autoUpdateEnabled=false`.

`pnpm verify:windows-release-approval-readiness-template` generates the separate `lumatrace-windows-release-approval-readiness-template.json` input from RC evidence. It records relative evidence file names, SHA-256 hashes, required-evidence booleans, and pending approval fields. It does not approve a release and does not copy reviewer notes or evidence notes.

If a validated `lumatrace-windows-release-approval-readiness-result.json` is present, `pnpm verify:windows-release-approval-readiness-result path/to/result.json` can mark only the release approval policy as `approved`. The release policy still keeps `status: "draft_blocked"`, `rcCandidateReady: false`, and `productionReady: false` until every other release gate is complete.

## What It Records

- code signing policy booleans, the code signing readiness template status, and a sanitized code signing result status when present;
- updater policy booleans, the updater policy readiness template status, and a sanitized updater policy result status when present;
- release approval booleans, the release approval readiness template status, and a sanitized release approval result status when present;
- license review status, notice file names, the license review template status, and a sanitized license review result status when present;
- blocker codes required for RC;
- local security boundaries such as localhost-only sidecar and token storage rules.

It must not contain auth tokens, full local paths, raw logs, command lines, raw CSV, stack traces, emails, secrets, or reviewer notes.

## RC Gate Integration

`pnpm verify:windows-packaging-rc-gate` runs the license review template verifier, code signing readiness template verifier, updater policy readiness template verifier, release approval readiness template verifier, and release policy template verifier before exporting the RC gate. The RC gate then uses `lumatrace-windows-license-review-template.json` as the license review evidence when present, `lumatrace-windows-code-signing-readiness-template.json` as the code signing evidence when present, `lumatrace-windows-updater-policy-readiness-template.json` as the updater policy evidence when present, `lumatrace-windows-release-approval-readiness-template.json` as the release approval evidence when present, and `lumatrace-windows-release-policy-template.json` as evidence for:

- fallback license review policy.

Because the release policy has other required blockers, the RC gate remains blocked even if a validated license review result advances `license_notice_review`, a validated signing result advances `code_signing`, a validated updater policy result advances `updater_policy`, or a validated release approval result advances `release_approval`.

## Command

```bash
pnpm verify:windows-license-review-template
pnpm verify:windows-license-review-result path/to/result.json
pnpm verify:windows-code-signing-readiness-template
pnpm verify:windows-code-signing-readiness-result path/to/result.json
pnpm verify:windows-updater-policy-readiness-template
pnpm verify:windows-updater-policy-readiness-result path/to/result.json
pnpm verify:windows-release-approval-readiness-template
pnpm verify:windows-release-approval-readiness-result path/to/result.json
pnpm verify:windows-release-policy-template
pnpm verify:windows-packaging-rc-gate
```

These commands do not sign binaries, configure an updater, upload artifacts, approve a release, or alter `productionReady`.
