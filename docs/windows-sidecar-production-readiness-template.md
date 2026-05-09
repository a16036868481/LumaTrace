# Windows Sidecar Production Readiness Template

`pnpm verify:windows-sidecar-production-readiness-template` generates and verifies:

- `apps/desktop/src-tauri/target/release/lumatrace-windows-sidecar-production-readiness-template.json`

The template is a release-review input for the local-server sidecar. It is not approval and it does not make the package production-ready.

## What It Records

- Sidecar artifact metadata from `sidecar-manifest.json`;
- self-contained draft status;
- bundled runtime metadata;
- sidecar auth transport smoke status;
- installed sidecar health smoke status;
- Windows packaging smoke suite status;
- relative evidence file names, hashes, and sizes;
- empty reviewer fields.

## What It Excludes

It must not include auth tokens, full local paths, raw logs, raw stdout/stderr, command lines, raw PresentMon CSV, logcat, bugreport, Android full serials, stack traces, secrets, or reviewer notes.

## Expected 4B Status

The expected 4B result is:

- `status: "draft_requires_review"`;
- `approved: false`;
- `productionReady: false`;
- `unsignedDraft: true`.

The RC gate can point the `sidecar_production_readiness` blocker to this template, but the blocker remains until a separate reviewed release evidence file approves the sidecar. This template does not configure code signing, updater behavior, license approval, or production release approval.

If a reviewer supplies a sanitized `lumatrace-windows-sidecar-production-readiness-result.json`, `pnpm verify:windows-sidecar-production-readiness-result path/to/result.json` can validate that sidecar readiness was approved. That result may advance only the RC gate's `sidecar_production_readiness` gate. It still does not approve licenses, configure code signing, decide updater policy, grant production release approval, or change `productionReady=false`.

## Related Commands

```bash
pnpm verify:windows-sidecar-production-readiness-template
pnpm verify:windows-sidecar-production-readiness-result path/to/result.json
pnpm smoke:windows-packaging-rc-gate-sidecar-readiness-result
```
