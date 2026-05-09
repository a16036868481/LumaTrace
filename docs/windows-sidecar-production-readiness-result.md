# Windows Sidecar Production Readiness Result

`pnpm verify:windows-sidecar-production-readiness-result path/to/result.json` validates a sanitized reviewer decision for the Windows local-server sidecar artifact.

This verifier does not sign binaries, approve licenses, configure updater behavior, grant release approval, or change the sidecar manifest's `productionReady=false`. Passing this result can unblock only the RC gate's `sidecar_production_readiness` gate.

## Required Shape

The verifier requires:

- `evidenceKind: "windows-sidecar-production-readiness-result"`;
- `status: "approved"`;
- `approved: true`;
- `productionReady: false`;
- `unsignedDraft: true`;
- sidecar artifact metadata from `sidecar-manifest.json`;
- self-contained draft, bundled runtime, `nodeRequired=false`, release sidecar smoke, auth transport smoke, installed sidecar health smoke, and public-listener checks;
- the same evidence list as the readiness template;
- reviewer name, completion time, and `decision: "approved"`.

## Security

The result must stay sanitized. It must not include auth tokens, full local paths, raw logs, raw stdout/stderr, command lines, raw PresentMon CSV, Android serials, stack traces, emails, or secrets.

`pnpm smoke:windows-sidecar-production-readiness-result` creates a synthetic approved fixture and verifies the schema. `pnpm smoke:windows-packaging-rc-gate-sidecar-readiness-result` proves the RC gate can pass only `sidecar_production_readiness` from a validated sidecar readiness result while keeping license review, code signing, updater policy, release approval, `rcCandidateReady=false`, and `productionReady=false`.
