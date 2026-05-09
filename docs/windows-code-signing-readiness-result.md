# Windows Code Signing Readiness Result

`pnpm verify:windows-code-signing-readiness-result path/to/result.json` validates a sanitized signing-readiness result created after an external Windows signing process has completed.

This verifier does not invoke `signtool`, does not store certificate files, does not store private keys, and does not copy signing command lines. It validates only a release-review summary. Passing this result can unblock the RC gate's `code_signing` gate, but it does not approve production release, configure updater behavior, grant sidecar production readiness, or change `productionReady=false`.

## Required Shape

The verifier requires:

- `evidenceKind: "windows-code-signing-readiness-result"`;
- `status: "configured_verified"`;
- `configured: true`;
- `productionReady: false`;
- `unsignedDraft: true`;
- certificate subject and thumbprint recorded only as sanitized summaries;
- private key availability recorded as `false`;
- timestamping configured with a sanitized server summary and digest algorithm;
- signature verification configured and passed;
- the same artifact list as the readiness template;
- every existing RC-required artifact marked `signatureVerified: true`;
- reviewer name, completion time, and `decision: "configured_verified"`.

## Security

The result must stay sanitized. It must not include auth tokens, full local paths, certificate paths, private key paths, passwords, command lines, raw logs, raw stdout/stderr, raw PresentMon CSV, stack traces, emails, or secrets.

`pnpm smoke:windows-code-signing-readiness-result` creates a synthetic configured fixture and verifies the schema. `pnpm smoke:windows-packaging-rc-gate-code-signing-result` proves the RC gate can pass only `code_signing` from a validated signing result while keeping sidecar production readiness, updater policy, release approval, `rcCandidateReady=false`, and `productionReady=false`.
