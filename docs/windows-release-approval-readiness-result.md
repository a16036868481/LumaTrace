# Windows Release Approval Readiness Result

`pnpm verify:windows-release-approval-readiness-result path/to/result.json` validates a sanitized release-approval result created after the external release reviewer has approved the Windows RC evidence.

This verifier does not sign binaries, configure updater behavior, publish artifacts, change sidecar production readiness, or make the package production-ready. A valid result can unblock only the RC gate's `release_approval` gate while keeping `rcCandidateReady=false` and `productionReady=false`.

## Required Shape

- `evidenceKind: "windows-release-approval-readiness-result"`;
- `status: "approved"`;
- `approvalGranted: true`;
- approver and role recorded as sanitized summaries;
- required evidence booleans set for manual GUI QA, license review, code signing, updater policy, sidecar production readiness, and smoke suite;
- evidence file names and hashes retained from the readiness template;
- reviewer fields filled without reviewer notes or evidence notes.

## Sanitization

The result must not contain auth tokens, full local paths, raw logs, raw stdout/stderr, command lines, raw PresentMon CSV, logcat, bugreport data, Android serials, stack traces, emails, reviewer notes, evidence notes, or secrets.

## RC Gate Smoke

`pnpm smoke:windows-release-approval-readiness-result` creates a synthetic approved fixture and verifies the schema. `pnpm smoke:windows-packaging-rc-gate-release-approval-result` proves the RC gate can pass only `release_approval` from a validated release approval result while keeping sidecar production readiness, license review, code signing, updater policy, `rcCandidateReady=false`, and `productionReady=false`.

## Commands

```bash
pnpm verify:windows-release-approval-readiness-template
pnpm verify:windows-release-approval-readiness-result path/to/result.json
pnpm smoke:windows-packaging-rc-gate-release-approval-result
```
