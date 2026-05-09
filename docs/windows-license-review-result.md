# Windows License Review Result

`pnpm verify:windows-license-review-result path/to/result.json` validates a human-filled license review result created from `lumatrace-windows-license-review-template.json`.

The result file is release-review evidence only. It can unblock the RC gate's `license_notice_review` gate, but it does not approve production release, configure signing, configure updater behavior, or change `productionReady=false`.

## Required Shape

The verifier requires:

- `evidenceKind: "windows-license-review-result"`;
- `status: "approved"`;
- `approved: true`;
- `productionReady: false`;
- `unsignedDraft: true`;
- matching notice file names and SHA-256 hashes from the license review template;
- reviewer name, completion time, and `decision: "approved"`;
- the same component list as the template;
- `reviewDecision: "approved"` on every component;
- reviewer notes for items that required human review;
- explicit resolution text for `UNKNOWN` license entries.

## Security

The result must stay sanitized. It must not include auth tokens, full local paths, command lines, raw logs, raw stdout/stderr, raw PresentMon CSV, raw license text, stack traces, emails, or secrets.

`pnpm smoke:windows-license-review-result` creates a synthetic approved fixture and verifies the schema. `pnpm smoke:windows-packaging-rc-gate-license-review-result` proves the RC gate can pass only `license_notice_review` from a validated license review result while keeping sidecar production readiness, code signing, updater policy, release approval, `rcCandidateReady=false`, and `productionReady=false`.
