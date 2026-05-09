# Windows Manual GUI QA Handoff

This handoff is for the unsigned Windows packaging draft. It is not production release approval.

Generate it with:

```bash
pnpm verify:windows-manual-gui-qa-handoff
```

The command first refreshes automated Windows packaging QA evidence, the pending manual GUI QA template, and the RC gate, then writes:

- `apps/desktop/src-tauri/target/release/lumatrace-windows-manual-gui-qa-handoff-manifest.json`
- `apps/desktop/src-tauri/target/release/lumatrace-windows-manual-gui-qa-handoff/`

The handoff directory contains:

- the manual GUI checklist;
- the pending manual GUI QA template;
- automated packaging QA evidence;
- the Windows packaging RC gate;
- the Windows release policy template;
- the sidecar manifest;
- packaging and third-party notice drafts;
- a short README for the human reviewer.

It intentionally excludes:

- `lumatrace-windows-manual-gui-qa-result.json`;
- auth tokens;
- raw logs;
- raw stdout/stderr;
- command lines;
- stack traces;
- logcat;
- bugreport;
- raw PresentMon CSV;
- full local user paths.

Packaged status and packaged diagnostics export surface a sanitized handoff summary when the manifest is present: handoff status, `manualGuiQaStatus`, `productionReady`, file count, excluded-file names, and security assertion booleans.

If a completed `lumatrace-windows-manual-gui-qa-result.json` is present beside the release artifacts, packaged status and packaged diagnostics export also surface a sanitized manual GUI QA result summary: validation status, overall result status, source checklist metadata, reviewer-field presence booleans, step counts, and security assertion booleans. They do not include reviewer names, reviewer notes, evidence notes, raw logs, raw stdout/stderr, command lines, stack traces, tokens, or full local paths.

A human reviewer must fill a separate result JSON from the pending template and run:

```bash
pnpm verify:windows-manual-gui-qa-result path/to/lumatrace-windows-manual-gui-qa-result.json
```

The handoff keeps `productionReady=false`. Even a future passed manual GUI QA result does not configure code signing, updater policy, license approval, or release approval.
