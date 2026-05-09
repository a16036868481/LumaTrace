# Windows Updater Policy Readiness Result

`pnpm verify:windows-updater-policy-readiness-result path/to/result.json` validates a sanitized updater-policy decision created by the release reviewer.

This verifier does not enable the Tauri updater, does not publish update manifests, does not sign update artifacts, does not configure hosting, and does not store endpoint secrets or private keys. Passing this result can unblock only the RC gate's `updater_policy` gate. It does not approve production release, grant sidecar production readiness, enable code signing, or change `productionReady=false`.

## Required Shape

The verifier requires:

- `evidenceKind: "windows-updater-policy-readiness-result"`;
- `status: "policy_decided"`;
- `configured: true`;
- `productionReady: false`;
- `unsignedDraft: true`;
- an updater strategy summary with `autoUpdateEnabled: false` for the current 4B release;
- update-signing, rollback, rollout, and verification policy summaries;
- the same artifact list as the readiness template;
- reviewer name, completion time, and `decision: "policy_decided"`.

## Security

The result must stay sanitized. It must not include auth tokens, full local paths, update endpoints with secrets, private keys, public-key files, passwords, update signing command lines, raw logs, raw stdout/stderr, raw PresentMon CSV, stack traces, emails, or secrets.

`pnpm smoke:windows-updater-policy-readiness-result` creates a synthetic policy-decided fixture and verifies the schema. `pnpm smoke:windows-packaging-rc-gate-updater-policy-result` proves the RC gate can pass only `updater_policy` from a validated updater-policy result while keeping sidecar production readiness, release approval, `rcCandidateReady=false`, and `productionReady=false`.
