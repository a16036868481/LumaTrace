# Windows Release Result Workspace

`pnpm verify:windows-release-result-workspace` writes and verifies a sanitized reviewer workspace for preparing Windows release gate result files:

- `lumatrace-windows-release-result-workspace/`;
- `lumatrace-windows-release-result-workspace-manifest.json`.

This workspace is not release approval. It does not sign artifacts, configure an updater, approve licenses, approve sidecar production readiness, run manual GUI QA, approve a production release, or change `productionReady=false`.

## What It Contains

The workspace contains:

- `README.md` with gate routing instructions;
- `gate-result-map.json` with blocker-to-template/result mapping;
- `templates/` with the current sanitized release gate templates;
- `drafts/` with `.draft.json` files for each release gate.

Draft files use `evidenceKind: "windows-release-result-draft"` and `status: "draft_pending"`. They are intentionally not valid release result files and cannot remove blockers.

## Workflow

1. Review the matching template in `templates/`.
2. Use the matching `.draft.json` file only as a local starting point.
3. Produce the real result file with the expected result schema and file name.
4. Run the dedicated verifier, for example `pnpm verify:windows-code-signing-readiness-result path/to/lumatrace-windows-code-signing-readiness-result.json`.
5. Place final result files in `lumatrace-windows-release-result-workspace/results/`.
6. Run `pnpm import:windows-release-gate-results -- --results-dir apps/desktop/src-tauri/target/release/lumatrace-windows-release-result-workspace/results`.
7. Run `pnpm verify:windows-release-gate-results-import`.
8. Refresh the RC gate with `pnpm verify:windows-packaging-rc-gate`.

Passing one gate removes only that gate's blocker. It does not approve any other gate and it does not make the build production-ready.

## Security

The workspace and manifest exclude:

- auth tokens;
- full local paths;
- raw logs;
- raw stdout/stderr;
- command lines;
- raw license text;
- raw PresentMon CSV;
- logcat;
- bugreport data;
- Android full serials;
- stack traces;
- reviewer notes;
- evidence notes.

Aggregate evidence should keep reviewer notes and detailed evidence notes out of packaged diagnostics and release manifests. The final result verifier for each gate enforces the gate-specific sanitized schema.

## Command

```bash
pnpm verify:windows-release-result-workspace
```

The command refreshes the release gate handoff and release gate results intake before writing the workspace. It does not upload artifacts, run arbitrary desktop shell commands, enable updater behavior, sign binaries, or change release approval.

## Result Import

`pnpm import:windows-release-gate-results` is the bounded import helper for reviewer result files.
It considers only exact known result file names, runs each dedicated verifier, copies only valid
results into the release directory, rejects invalid results, refreshes
`lumatrace-windows-release-gate-results-intake.json`, and writes
`lumatrace-windows-release-gate-results-import-manifest.json`.

The import manifest excludes source directory paths, verifier stdout/stderr, reviewer notes,
evidence notes, raw logs, tokens, full local paths, command lines, stack traces, raw CSV, logcat,
bugreport data, and Android full serials. Importing valid results does not approve release and
keeps `productionReady=false`.
