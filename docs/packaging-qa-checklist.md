# Packaging QA Checklist

Use this checklist before considering a packaged build for broader testing.

## Toolchain

- Run `pnpm detect:tauri-toolchain`.
- If cargo is missing, do not claim Rust/Tauri build verification.
- If Tauri CLI is missing, do not claim `pnpm dev:tauri` or `pnpm build:tauri` passed.

## Sidecar

- Run `pnpm build:sidecar`.
- Run `pnpm build:self-contained-sidecar`.
- Run `pnpm verify:sidecar-artifacts`.
- Run `pnpm verify:packaging-notices`.
- Run `pnpm smoke:self-contained-sidecar`.
- Run `pnpm smoke:tauri-release-sidecar` after `pnpm build:tauri`.
- Run `pnpm verify:windows-bundle-draft` for the unsigned portable release-directory draft.
- Run `pnpm verify:windows-installer-draft` only for the explicit unsigned NSIS installer draft probe.
- Run `pnpm smoke:windows-installer-draft` to install the unsigned NSIS draft into a temporary directory, verify installed resources, run the uninstaller, and remove the temporary directory.
- Run `pnpm smoke:windows-installed-app-launch` to install the unsigned NSIS draft into a temporary directory, launch the installed app executable for a bounded startup check, close it, uninstall it, and remove the temporary directory.
- Run `pnpm smoke:windows-installed-sidecar-health` to install the unsigned NSIS draft into a temporary directory, launch the installed app, confirm the sidecar exposes loopback-only TCP listeners, close it, uninstall it, and remove the temporary directory.
- Run `pnpm smoke:windows-release-gate-results-import` to verify the release result import workflow copies only verifier-passing result files, rejects invalid result files, refreshes release gate intake, and keeps `productionReady=false`.
- Run `pnpm smoke:windows-release-gate-results-suite` to verify `no_results`, `partial_results`, `invalid_results`, and `all_results_valid` release gate result intake states without changing `productionReady=false`.
- Run `pnpm verify:windows-packaging-smoke-suite` after the Windows packaging smokes to verify the sanitized smoke manifest set as one suite.
- Run `pnpm verify:windows-packaging-qa-evidence` after the smoke suite to generate a single sanitized QA evidence manifest. It must keep `manualGuiQa.status: "not_run"` until the manual GUI checklist is completed by a human.
- Run `pnpm verify:windows-manual-gui-qa-template` to generate the manual GUI QA evidence template. It must keep every checklist step `pending` until a human reviewer fills it out.
- Run `pnpm verify:windows-manual-gui-qa-handoff` to generate a sanitized handoff directory for the human reviewer. It must include the checklist, pending template, automated QA evidence, RC gate, release policy template, sidecar manifest, and notice drafts, but not a completed manual result or raw logs.
- After a human reviewer fills a result JSON from that template, run `pnpm verify:windows-manual-gui-qa-result path/to/result.json`. The verifier checks final step status, reviewer notes, sanitization, and keeps `productionReady=false`.
- Run `pnpm smoke:windows-packaging-qa-evidence-manual-result` to verify the automated QA evidence exporter can summarize a sanitized manual result without copying reviewer notes or changing `productionReady=false`.
- Run `pnpm smoke:windows-packaging-rc-gate-manual-result` to verify a validated manual result advances only the RC gate's `manual_gui_qa` gate while keeping `rcCandidateReady=false`, `productionReady=false`, and all other release blockers intact.
- Run `pnpm verify:windows-packaging-release-readiness` to generate the release-readiness gate manifest. It must remain `releaseStatus: "blocked"` and `productionReady: false` until signing, updater policy, production approval, and other release gates are complete.
- Run `pnpm verify:windows-license-review-template` to generate the sanitized license review template from `packaging-notices.json` and `THIRD-PARTY-NOTICES.md`. It must remain `status: "draft_requires_review"`, `approved: false`, and `productionReady: false`.
- After a human reviewer fills a license review result JSON from that template, run `pnpm verify:windows-license-review-result path/to/result.json`. The verifier checks notice hashes, reviewer approval, per-component decisions, sanitization, and keeps `productionReady=false`.
- Run `pnpm smoke:windows-license-review-result` to verify the license review result verifier with a synthetic fixture.
- Run `pnpm smoke:windows-packaging-rc-gate-license-review-result` to verify a validated license review result advances only the RC gate's `license_notice_review` gate while keeping `rcCandidateReady=false`, `productionReady=false`, and all other release blockers intact.
- Run `pnpm verify:windows-code-signing-readiness-template` to generate the sanitized code signing readiness template. It must remain `status: "not_configured"`, `configured: false`, and `productionReady: false`.
- After an external signing process produces a sanitized signing summary, run `pnpm verify:windows-code-signing-readiness-result path/to/result.json`. The verifier checks certificate/timestamp summaries, per-artifact signature verification, sanitization, and keeps `productionReady=false`.
- Run `pnpm smoke:windows-code-signing-readiness-result` to verify the code signing readiness result verifier with a synthetic fixture.
- Run `pnpm smoke:windows-packaging-rc-gate-code-signing-result` to verify a validated signing result advances only the RC gate's `code_signing` gate while keeping `rcCandidateReady=false`, `productionReady=false`, and all other release blockers intact.
- Run `pnpm verify:windows-updater-policy-readiness-template` to generate the sanitized updater policy readiness template. It must remain `status: "not_configured"`, `configured: false`, and `productionReady: false`.
- Run `pnpm verify:windows-release-approval-readiness-template` to generate the sanitized release approval readiness template. It must remain `status: "not_granted"`, `approvalGranted: false`, and `productionReady: false`.
- Run `pnpm verify:windows-sidecar-production-readiness-template` to generate the sanitized sidecar production readiness template. It must remain `status: "draft_requires_review"`, `approved: false`, and `productionReady: false`.
- Run `pnpm verify:windows-release-policy-template` to generate the sanitized draft policy input for code signing, updater policy, release approval, and license review. It must remain `status: "draft_blocked"`, `rcCandidateReady: false`, and `productionReady: false`.
- Run `pnpm verify:windows-packaging-rc-gate` to generate the RC gate manifest. It must remain `status: "blocked"`, `rcCandidateReady: false`, and `productionReady: false` until manual GUI QA, signing, updater policy, license review, sidecar production readiness, and production approval are complete.
- Run `pnpm verify:windows-rc-reviewer-bundle` to generate the sanitized RC reviewer bundle. It must include only sanitized evidence manifests plus README and must remain `rcCandidateReady: false` and `productionReady: false`.
- Confirm `artifactKind` and `productionReady` are honest.
- Confirm the sidecar hash matches the manifest.
- Confirm the release `externalBin` sidecar starts with the bundled runtime and `PATH` cleared.
- Confirm `packaging-notices.json` and `THIRD-PARTY-NOTICES.md` hashes match the manifest.
- Confirm license review status remains draft until release review is complete.
- Confirm `lumatrace-bundle-draft-manifest.json` says `unsigned: true`, `installerBuilt: false`, and `productionReady: false`.
- Confirm `lumatrace-installer-draft-manifest.json`, when generated, says `unsigned: true`, `installerBuilt: true`, `productionReady: false`, `codeSigningConfigured: false`, and `updaterConfigured: false`.
- Confirm `lumatrace-installer-smoke-manifest.json`, when generated, says `productionReady: false`, records only relative installed file paths, and contains no token or local user path.
- Confirm `lumatrace-installed-app-launch-smoke-manifest.json`, when generated, says `productionReady: false`, records only sanitized launch metadata, and contains no token, stack trace, or local user path.
- Confirm `lumatrace-installed-sidecar-health-smoke-manifest.json`, when generated, says `productionReady: false`, records `publicListenerCount: 0`, and contains no token, stack trace, or local user path.
- Confirm `lumatrace-windows-release-gate-results-suite-smoke-manifest.json`, when generated, says `status: success`, covers four release gate intake cases, restores previous result files, and keeps `rcCandidateReady: false` plus `productionReady: false`.
- Confirm `lumatrace-windows-packaging-smoke-suite-manifest.json`, when generated, says `status: success`, `productionReady: false`, and contains no token, stack trace, or local user path.
- Confirm `lumatrace-windows-packaging-qa-evidence.json`, when generated, says `status: automated_evidence_ready`, `productionReady: false`, and `manualGuiQa.status: "not_run"`.
- Confirm `lumatrace-windows-manual-gui-qa-template.json`, when generated, says `status: template_pending`, `productionReady: false`, and all steps are `pending`.
- Confirm `lumatrace-windows-manual-gui-qa-handoff-manifest.json`, when generated, says `status: handoff_ready`, `productionReady: false`, and excludes `lumatrace-windows-manual-gui-qa-result.json`, raw logs, raw stdout/stderr, command lines, stack traces, and tokens.
- Confirm any filled `lumatrace-windows-manual-gui-qa-result.json` is accepted by `pnpm verify:windows-manual-gui-qa-result path/to/result.json` before attaching it to a QA handoff. A passing result does not change release `productionReady`.
- Confirm `lumatrace-windows-packaging-qa-evidence.json` summarizes manual GUI QA result status only when a validated result file is present; it must not embed reviewer notes, evidence notes, raw logs, tokens, or local paths.
- Confirm `lumatrace-windows-packaging-rc-gate.json` allows `manual_gui_qa` to pass only when that validated manual result summary is present, while retaining sidecar production readiness, license review, code signing, updater policy, and release approval blockers.
- Confirm `lumatrace-windows-packaging-release-readiness.json` lists explicit production blockers for code signing, updater policy, production approval, and any missing manual/sidecar readiness.
- Confirm `lumatrace-windows-license-review-template.json` records notice hashes, component counts, missing-license counts, pending reviewer fields, and no raw license text.
- Confirm any filled `lumatrace-windows-license-review-result.json` is accepted by `pnpm verify:windows-license-review-result path/to/result.json` before using it as release evidence. An approved result can remove only `LICENSE_NOTICE_REVIEW`; it does not change release `productionReady`.
- Confirm `lumatrace-windows-packaging-rc-gate.json` allows `license_notice_review` to pass only when that validated license review result is present, while retaining sidecar production readiness, code signing, updater policy, and release approval blockers.
- Confirm `lumatrace-windows-code-signing-readiness-template.json` records unsigned artifact hashes, pending certificate/timestamp/verification fields, and no certificate secrets or signing command lines.
- Confirm any filled `lumatrace-windows-code-signing-readiness-result.json` is accepted by `pnpm verify:windows-code-signing-readiness-result path/to/result.json` before using it as release evidence. A configured result can remove only `CODE_SIGNING`; it does not change release `productionReady`.
- Confirm `lumatrace-windows-packaging-rc-gate.json` allows `code_signing` to pass only when that validated code signing result is present, while retaining sidecar production readiness, updater policy, and release approval blockers.
- Confirm `lumatrace-windows-updater-policy-readiness-template.json` records draft artifact hashes, pending updater/update-signing/rollback/verification fields, and no updater endpoint secrets or update signing command lines.
- Confirm `lumatrace-windows-release-approval-readiness-template.json` records evidence hashes, pending approval fields, required-evidence booleans, and no reviewer notes or evidence notes.
- Confirm any filled `lumatrace-windows-release-approval-readiness-result.json` is accepted by `pnpm verify:windows-release-approval-readiness-result path/to/result.json` before using it as release evidence. An approved result can remove only `RELEASE_APPROVAL`; it does not change release `productionReady`.
- Confirm `lumatrace-windows-sidecar-production-readiness-template.json` records sidecar manifest metadata, sidecar smoke evidence hashes, pending reviewer fields, and no raw logs, command lines, tokens, or full paths.
- Confirm `lumatrace-windows-release-policy-template.json` records blocked code signing, updater, license review, and release approval policy inputs without secrets, paths, raw logs, or reviewer notes.
- Confirm `lumatrace-windows-packaging-rc-gate.json` lists explicit RC blockers for manual GUI QA, sidecar production readiness, license review, code signing, updater policy, and production approval.
- Optionally run `pnpm smoke:windows-packaging-rc-gate-full-results` to verify all six release gates can pass together from sanitized synthetic results. The smoke must restore the draft files afterward and must still keep `rcCandidateReady: false` and `productionReady: false`.
- Confirm `lumatrace-windows-rc-reviewer-bundle-manifest.json` lists only sanitized JSON evidence files and excludes raw license text, reviewer notes, raw logs, tokens, and local paths.
- Use `docs/windows-packaging-manual-gui-checklist.md` for installed app manual GUI QA after automated smoke manifests pass.

## Local Security

- Packaged server binds to `127.0.0.1`.
- Packaged REST rejects missing/invalid bearer tokens.
- Packaged WebSocket rejects missing/invalid auth subprotocols.
- Token is absent from VITE variables, localStorage, URLs, logs, reports, and diagnostics.
- No arbitrary shell command permission is granted.

## Manual GUI QA

- Run the Windows packaging manual GUI checklist on a QA machine or temporary test VM.
- Confirm Dashboard loads without a manually started dev server.
- Confirm Tools / Diagnostics shows sidecar status, packaging diagnostics, log rotation, packaged storage status, production-not-ready notice, and sanitized paths.
- Confirm sidecar restart is visible and bounded.
- Confirm mock session create/start/stop/report works from the installed app.
- Confirm diagnostics export, reports, and UI do not show tokens, full local paths, raw logs, command lines, stack traces, logcat, bugreport, raw CSV, or Android full serials.

## Storage And Logs

- Run `pnpm smoke:packaging-diagnostics`.
- Run `pnpm smoke:packaged-storage`.
- Confirm DB, reports, diagnostics, and logs use app directories.
- Confirm packaged storage smoke restarts with the same DB path.
- Confirm sessions and reports remain readable after restart.
- Confirm log rotation policy is present.
- Confirm diagnostics export is sanitized JSON.
- Confirm diagnostics export uses sanitized excerpts and no raw logs.
- Confirm tokens, full paths, command lines, raw CSV, logcat, bugreport data, and stack traces are absent.

## Crash Recovery

- Run `pnpm smoke:sidecar-crash-recovery`.
- Confirm restart cooldown is enforced.
- Confirm restart limit is enforced.
- Confirm crash diagnostics export sanitized evidence only.
- Confirm normal graceful shutdown is not marked as a crash.

## Later Hardening Batches

- Installer verification is draft-only until signing and distribution are implemented. The default checked artifact is a portable release-directory draft; the explicit NSIS probe is unsigned QA-only and not a release artifact.

## Release Limits

- Code signing is not complete.
- Updater is not configured.
- Store distribution is not configured.
- No new metrics are added by packaging milestones.
