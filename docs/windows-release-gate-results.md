# Windows Release Gate Results Intake

`pnpm verify:windows-release-gate-results` scans the Tauri release directory for real Windows release gate result files and writes:

- `lumatrace-windows-release-gate-results-intake.json`.

It is an intake summary only. It does not create result files, approve a release, sign binaries, configure an updater, or change `productionReady=false`.

## Checked Result Files

The intake checks these files when they are present beside the release artifacts:

- `lumatrace-windows-manual-gui-qa-result.json`;
- `lumatrace-windows-sidecar-production-readiness-result.json`;
- `lumatrace-windows-license-review-result.json`;
- `lumatrace-windows-code-signing-readiness-result.json`;
- `lumatrace-windows-updater-policy-readiness-result.json`;
- `lumatrace-windows-release-approval-readiness-result.json`.

Each present result is passed to its dedicated verifier. Missing results are reported as `missing_result`. A valid result is reported as `valid_result` and `canRemoveBlocker: true`; an invalid result is reported as `invalid_result` and cannot remove a blocker.

Verifier stdout and stderr are not copied into the intake manifest.

## Workflow

1. Generate the handoff:

   ```bash
   pnpm verify:windows-release-gate-handoff
   ```

2. Place real result files in the release directory or verify them with their explicit path.

3. Run:

   ```bash
   pnpm verify:windows-release-gate-results
   ```

4. Refresh the RC gate:

   ```bash
   pnpm verify:windows-packaging-rc-gate
   ```

Passing one result can remove only that result's matching blocker after the RC gate is refreshed.

## Partial Result Smoke

`pnpm smoke:windows-release-gate-results-partial` verifies the first real-intake transition without
claiming a release. It temporarily creates a synthetic passed `lumatrace-windows-manual-gui-qa-result.json`,
removes the other result files for the duration of the smoke, runs the dedicated manual GUI QA verifier,
refreshes `lumatrace-windows-release-gate-results-intake.json`, and checks:

- `status: "partial_results"`;
- exactly one `valid_result`;
- `MANUAL_GUI_QA` is the only entry with `canRemoveBlocker: true`;
- the remaining five gates stay `missing_result`;
- `rcCandidateReady` and `productionReady` remain false;
- verifier stdout/stderr, reviewer notes, evidence notes, raw logs, tokens, full paths, and stack traces are not copied into the intake.

The smoke restores any pre-existing result files and the previous intake manifest before it exits.

## Invalid Result Smoke

`pnpm smoke:windows-release-gate-results-invalid` verifies the failure path. It temporarily creates a
synthetic invalid `lumatrace-windows-manual-gui-qa-result.json` that contains deliberately unsafe-looking
fixture content such as token-shaped strings, local paths, and stack-like text. The dedicated manual GUI QA
verifier must reject that result. The release gate results intake is then refreshed and checked for:

- `status: "invalid_results"`;
- exactly one `invalid_result`;
- zero `valid_result` entries;
- `MANUAL_GUI_QA` has `canRemoveBlocker: false`;
- the remaining five gates stay `missing_result`;
- the invalid entry records only stable file name, hash, size, verifier exit code, and a stable reason;
- `rcCandidateReady` and `productionReady` remain false;
- verifier stdout/stderr, reviewer notes, evidence notes, raw logs, token-shaped strings, full paths, and stack traces are not copied into the intake.

The smoke restores any pre-existing result files and the previous intake manifest before it exits.

## Suite Smoke

`pnpm smoke:windows-release-gate-results-suite` runs the release gate results intake paths as one
bounded check:

- `no_results` with no result files present;
- `partial_results` through `pnpm smoke:windows-release-gate-results-partial`;
- `invalid_results` through `pnpm smoke:windows-release-gate-results-invalid`;
- `all_results_valid` through the full synthetic RC gate result smoke.

The suite verifies each transition remains sanitized and keeps `rcCandidateReady=false` plus
`productionReady=false`. It restores any pre-existing result files and the previous intake manifest
before it exits.

The suite writes `lumatrace-windows-release-gate-results-suite-smoke-manifest.json`, which is
surfaced in packaged status, packaged diagnostics export, and the Tools / Diagnostics Packaging
section as a sanitized summary. It includes only case outcomes, restore confirmation, safety
assertions, and limitations; it does not include verifier stdout/stderr, reviewer notes, raw logs,
tokens, full paths, or release approval.

## Import Workflow

`pnpm import:windows-release-gate-results -- --results-dir <directory>` imports real reviewer
result files from a bounded drop directory. The importer only considers exact known result file
names, runs the matching dedicated verifier for each present file, copies only valid results into
the release directory, rejects invalid results, refreshes the release gate results intake, and
writes `lumatrace-windows-release-gate-results-import-manifest.json`.

Run `pnpm verify:windows-release-gate-results-import` after import. The import manifest records
which files were copied or rejected, stable file names, hashes, sizes, verifier exit codes, and a
refreshed intake summary. It excludes source directory paths, verifier stdout/stderr, reviewer
notes, evidence notes, raw logs, tokens, full local paths, command lines, stack traces, raw CSV,
logcat, bugreport data, and Android full serials.

`pnpm smoke:windows-release-gate-results-import` uses synthetic input with one valid manual GUI QA
result and one invalid license review result. It verifies the valid result is copied, the invalid
result is rejected, the refreshed intake becomes `partial_results`, and `productionReady` remains
false.

## Security

The intake manifest includes file names, result status, hashes, sizes, verifier exit codes, and safe next commands. It excludes raw verifier output, reviewer notes, evidence notes, raw logs, raw stdout/stderr, command lines, raw license text, raw CSV, logcat, bugreport data, Android full serials, auth tokens, full local paths, and stack traces.

`rcCandidateReady` and `productionReady` remain false.
