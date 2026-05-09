# Windows Code Signing Readiness Template

`pnpm verify:windows-code-signing-readiness-template` writes and verifies `lumatrace-windows-code-signing-readiness-template.json` under the Tauri release directory.

This file is a sanitized checklist for release signing readiness. It is not a signing action and it is not production approval.

## Current Status

The template intentionally records:

- `status: "not_configured"`;
- `configured: false`;
- `productionReady: false`;
- `unsignedDraft: true`;
- certificate configured false;
- timestamping configured false;
- signature verification configured false;
- signed artifact count zero.

## What It Records

- relative artifact file names;
- SHA-256 hashes and sizes for existing unsigned artifacts;
- certificate/timestamp/verification booleans;
- pending reviewer fields;
- security assertions.

It must not contain auth tokens, full local paths, certificate files, private keys, passwords, signing command lines, raw logs, raw stdout/stderr, stack traces, or secrets.

## RC Gate Integration

`pnpm verify:windows-release-policy-template` links this template into the code signing section when present. `pnpm verify:windows-packaging-rc-gate` then uses it as the `code_signing` gate evidence while keeping the gate blocked until real signing configuration and verification exist.

## Command

```bash
pnpm verify:windows-code-signing-readiness-template
pnpm verify:windows-release-policy-template
pnpm verify:windows-packaging-rc-gate
```

These commands do not sign binaries, configure a certificate, timestamp artifacts, upload artifacts, approve a release, or alter `productionReady`.
