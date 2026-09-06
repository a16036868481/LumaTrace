# Tauri Packaging Foundation

Milestone 4A adds the desktop host foundation. Milestone 4B hardens packaging diagnostics, toolchain detection, sidecar artifact manifests, and log rotation in small batches. The existing React/Vite app remains the UI, and `apps/local-server` becomes a local sidecar supervised by Tauri.

## Scope

- Tauri v2 scaffold under `apps/desktop/src-tauri`.
- Local-server sidecar startup, shutdown, restart status, and diagnostics.
- Packaged local-server mode with `127.0.0.1` binding and Bearer token auth.
- AppLocalData paths for SQLite, reports, and diagnostics.
- AppLog paths for app and sidecar logs.
- Development mode remains `pnpm dev:server` plus `pnpm dev:desktop`.
- Rust/Tauri toolchain detection is available through `pnpm detect:tauri-toolchain`.
- Sidecar artifact manifest validation is available through `pnpm verify:sidecar-artifacts`.
- Unsigned portable release-directory verification is available through `pnpm verify:windows-bundle-draft`.
- Unsigned NSIS installer draft probing is available through `pnpm verify:windows-installer-draft`; it uses a temporary config override and remains QA-only.
- Temporary installer install/uninstall smoke is available through `pnpm smoke:windows-installer-draft`.
- A GitHub prerelease preview can be produced with `pnpm release:windows-preview -- --tag v0.1.0-preview.N --publish`; it is still unsigned and `productionReady=false`.
- Temporary installed app launch smoke is available through `pnpm smoke:windows-installed-app-launch`.
- Temporary installed sidecar health smoke is available through `pnpm smoke:windows-installed-sidecar-health`.
- Windows packaging smoke suite verification is available through `pnpm verify:windows-packaging-smoke-suite`; it includes the Tauri sidecar auth transport smoke manifest, portable bundle draft, installer draft, install/uninstall smoke, installed app launch smoke, and installed sidecar health smoke.
- Windows packaging QA evidence export is available through `pnpm verify:windows-packaging-qa-evidence`.
- Windows manual GUI QA template export is available through `pnpm verify:windows-manual-gui-qa-template`.
- Windows manual GUI QA result verification is available through `pnpm verify:windows-manual-gui-qa-result path/to/result.json`.
- Windows QA evidence manual result summary smoke is available through `pnpm smoke:windows-packaging-qa-evidence-manual-result`.
- Windows packaging release readiness gate is available through `pnpm verify:windows-packaging-release-readiness`.
- Windows license review template generation is available through `pnpm verify:windows-license-review-template`.
- Windows code signing readiness template generation is available through `pnpm verify:windows-code-signing-readiness-template`.
- Windows updater policy readiness template generation is available through `pnpm verify:windows-updater-policy-readiness-template`.
- Windows release approval readiness template generation is available through `pnpm verify:windows-release-approval-readiness-template`.
- Windows packaging RC gate is available through `pnpm verify:windows-packaging-rc-gate`.
- Windows RC reviewer bundle generation is available through `pnpm verify:windows-rc-reviewer-bundle`.
- Installed Windows manual GUI QA is documented in `docs/windows-packaging-manual-gui-checklist.md`.
- Sanitized packaging diagnostics JSON export is available through `/api/packaged/diagnostics/export?format=json`.
- Log rotation metadata is available through `/api/packaged/status`.
- Sidecar crash state, restart cooldown, restart limit, and packaged storage migration status are visible in Tools / Diagnostics and `/api/packaged/status`.

This batch does not implement updater, code signing, installer publication, new metrics, cloud upload, or production store packaging.

## Sidecar Artifact

`pnpm build:sidecar` builds the local-server package and writes a sidecar artifact plus `sidecar-manifest.json` into `apps/desktop/src-tauri/binaries`.

`pnpm build:sidecar` creates a development wrapper. `pnpm build:self-contained-sidecar` now creates a self-contained draft bundle for the current platform: a fixed sidecar wrapper, a bundled Node.js runtime, and a `pnpm deploy --prod` local-server dependency closure. This removes the requirement for an end user to install Node for this draft artifact.

The self-contained draft still keeps `productionReady: false`. Production readiness requires installer QA, code signing decisions, license notice review for bundled runtime/dependencies, update strategy review, and release smoke on the target platform.

`pnpm build:self-contained-sidecar` also writes packaging notice artifacts next to the sidecar:

- `packaging-notices.json`: machine-readable bundled runtime and dependency notice manifest.
- `THIRD-PARTY-NOTICES.md`: human-readable draft third-party notice file.

Both files are hashed in `sidecar-manifest.json`. They are generated for release review only; they do not make the sidecar production-ready.

Production sidecar TODO: convert this draft into a release-approved sidecar with license notices, license review approval, signing, installer inclusion, and target-platform QA before advertising production packaging.

Target naming follows platform triples, for example:

- Windows x64: `lumatrace-local-server-x86_64-pc-windows-msvc.exe`
- Windows arm64: `lumatrace-local-server-aarch64-pc-windows-msvc.exe`
- macOS x64: `lumatrace-local-server-x86_64-apple-darwin`
- macOS arm64: `lumatrace-local-server-aarch64-apple-darwin`
- Linux x64: `lumatrace-local-server-x86_64-unknown-linux-gnu`

Development wrappers may use `.cmd` on Windows and must remain marked as not production-ready.

## Runtime Flow

1. Tauri starts.
2. Rust generates a random local auth token and keeps it in memory.
3. Rust resolves AppLocalData, AppLog, reports, diagnostics, and temp paths.
4. Rust starts the configured local-server sidecar with `--packaged --host 127.0.0.1 --port 0` and passes the local auth token through `LUMATRACE_AUTH_TOKEN` rather than a command-line argument.
5. The sidecar prints its actual random port in a ready message.
6. Desktop fetches local-server info and token through Tauri commands.
7. REST calls use `Authorization: Bearer <token>`.
8. WebSocket calls use a local auth subprotocol.
9. App exit stops the sidecar.

Sidecar restart is bounded. The packaged supervisor uses a restart cooldown and restart limit, does not restart forever, and stores only sanitized crash excerpts. Graceful shutdown is recorded separately from crash states.

Tokens are not placed in `VITE_` variables, localStorage, URL query strings, sidecar launch arguments, reports, or logs.

## Hardening Commands

```bash
pnpm detect:tauri-toolchain
pnpm build:sidecar
pnpm build:self-contained-sidecar
pnpm verify:sidecar-artifacts
pnpm verify:packaging-notices
pnpm smoke:self-contained-sidecar
pnpm smoke:tauri-release-sidecar
pnpm verify:windows-bundle-draft
pnpm verify:windows-installer-draft
pnpm smoke:windows-installer-draft
pnpm smoke:windows-installed-app-launch
pnpm smoke:windows-installed-sidecar-health
pnpm verify:windows-packaging-smoke-suite
pnpm verify:windows-packaging-qa-evidence
pnpm verify:windows-manual-gui-qa-template
pnpm verify:windows-manual-gui-qa-result path/to/result.json
pnpm smoke:windows-packaging-qa-evidence-manual-result
pnpm verify:windows-packaging-release-readiness
pnpm verify:windows-packaging-rc-gate
pnpm smoke:tauri-foundation
pnpm smoke:packaging-diagnostics
pnpm verify:packaging-hardening
```

`pnpm check:tauri`, `pnpm dev:tauri`, and `pnpm build:tauri` require cargo and a Tauri CLI. If cargo is missing, do not claim Rust/Tauri build verification.

`pnpm smoke:tauri-release-sidecar` is the current Windows bundle draft QA step. It rebuilds the self-contained sidecar, runs `pnpm build:tauri`, then starts the release externalBin sidecar from `apps/desktop/src-tauri/target/release` with `PATH` cleared and verifies ready JSON, bearer auth, invalid auth rejection, and `productionReady: false`. It does not create or sign an installer.

`pnpm verify:windows-bundle-draft` wraps the release sidecar smoke and then writes `apps/desktop/src-tauri/target/release/lumatrace-bundle-draft-manifest.json`. That manifest records release exe and sidecar hashes, bundled resource hashes, `unsigned: true`, `installerBuilt: false`, `codeSigningConfigured: false`, `updaterConfigured: false`, and `productionReady: false`.

`pnpm verify:windows-installer-draft` is separate and opt-in. It rebuilds the self-contained sidecar draft, writes a temporary config override under `apps/desktop/src-tauri/target/installer-draft/`, runs Tauri with `--bundles nsis --no-sign --ci`, and verifies `lumatrace-installer-draft-manifest.json`. A successful draft can produce an unsigned NSIS setup executable for QA, but it remains `productionReady=false` and is not a release artifact.

`pnpm smoke:windows-installer-draft` runs the unsigned NSIS setup executable in silent mode with a temp install directory, verifies the installed app executable, sidecar executable, bundled runtime, notice files, and uninstaller, then runs the uninstaller and removes the temp directory. The resulting `lumatrace-installer-smoke-manifest.json` stores only relative installed file paths and sanitized excerpts.

`pnpm smoke:windows-installed-app-launch` also uses a temp install directory. It launches the installed app executable for a bounded startup window, records whether the app process stayed alive and whether a local-server sidecar process was observed, then closes the app, runs the uninstaller, and removes the temp directory. The resulting `lumatrace-installed-app-launch-smoke-manifest.json` stores sanitized metadata only. This is a startup smoke, not full manual GUI QA.

`pnpm smoke:windows-installed-sidecar-health` uses the same temp install boundary and adds an observable sidecar networking check. It launches the installed app, locates the installed sidecar process, checks its listening TCP sockets, and fails if a non-loopback listener is exposed. The resulting `lumatrace-installed-sidecar-health-smoke-manifest.json` stores sanitized listener counts and addresses only, with `productionReady=false`.

`pnpm verify:windows-packaging-smoke-suite` is a cheap aggregation check. It reads the generated Windows packaging smoke manifests, verifies each says `productionReady=false`, confirms expected success fields such as install cleanup and loopback-only sidecar health, and writes `lumatrace-windows-packaging-smoke-suite-manifest.json`. It does not rebuild artifacts, because individual smokes may rebuild unsigned installer drafts and therefore record different hashes.

`pnpm verify:windows-packaging-qa-evidence` writes `lumatrace-windows-packaging-qa-evidence.json` as a sanitized audit summary of the automated Windows packaging manifests. It deliberately records `manualGuiQa.status: "not_run"` so the evidence bundle cannot be mistaken for completed manual GUI QA.

`pnpm verify:windows-manual-gui-qa-template` writes `lumatrace-windows-manual-gui-qa-template.json` from the manual checklist. It creates stable step ids, leaves reviewer fields empty, and sets every step to `pending`. It is a handoff artifact for a human QA pass, not an automated pass signal.

`pnpm verify:windows-manual-gui-qa-result path/to/result.json` validates a human-filled result derived from that template. It requires reviewer metadata, final step statuses, notes for passed/failed/blocked steps, sanitized content, and `productionReady=false`. A passing result verifier means the evidence file is structurally clean; it is still not code signing, updater, store, or production release approval.

When a validated `lumatrace-windows-manual-gui-qa-result.json` is present in the release manifest directory, `pnpm verify:windows-packaging-qa-evidence` records only a sanitized manual result summary: status, file hash, file size, reviewer-field presence, and step counts. It does not copy reviewer notes or evidence notes into the aggregate QA evidence. `pnpm smoke:windows-packaging-qa-evidence-manual-result` exercises that summary path with a synthetic fixture and then restores the previous generated artifacts.

`pnpm verify:windows-packaging-release-readiness` writes `lumatrace-windows-packaging-release-readiness.json`. This is a blocker manifest, not a release certificate. It keeps `releaseStatus: "blocked"`, keeps `productionReady=false`, and records blockers for missing manual GUI QA, sidecar production readiness, code signing, updater policy, and production approval. The manifest records artifact hashes and status booleans only; it must not include tokens, local paths, raw logs, command lines, or stack traces.

`pnpm verify:windows-license-review-template` writes `lumatrace-windows-license-review-template.json` from the generated notice manifests. It records hashes, component metadata, missing-license counts, and empty reviewer fields only. It keeps `approved=false` and excludes raw license text, tokens, local paths, raw logs, and stack traces.

`pnpm verify:windows-code-signing-readiness-template` writes `lumatrace-windows-code-signing-readiness-template.json` from unsigned release artifacts. It records relative artifact names and hashes, keeps certificate/timestamp/verification fields false, and excludes certificate secrets, signing command lines, full paths, raw logs, and stack traces. It does not sign binaries.

`pnpm verify:windows-packaging-rc-gate` writes `lumatrace-windows-packaging-rc-gate.json`. It is the RC-level blocker manifest and is expected to keep `status: "blocked"`, `rcCandidateReady=false`, and `productionReady=false` during 4B. It separates automated smoke evidence from manual GUI QA, signing, updater, license review, sidecar production readiness, and release approval gates. When the license review template exists, the RC gate points the license-review blocker at that template while still requiring human approval before RC. When the code signing readiness template exists, the RC gate points the code-signing blocker at that template while still requiring real signing configuration before RC. When the updater policy readiness template exists, the RC gate points the updater-policy blocker at that template while still requiring a real updater strategy, update signing, rollback policy, and verification before RC. When the release approval readiness template exists, the RC gate points the release-approval blocker at that template while still requiring explicit production release approval before RC.

`pnpm verify:windows-rc-reviewer-bundle` writes `lumatrace-windows-rc-reviewer-bundle/` and `lumatrace-windows-rc-reviewer-bundle-manifest.json`. The bundle is a sanitized handoff packet for release reviewers and includes only JSON evidence manifests plus a generated README. It excludes raw logs, raw stdout/stderr, command lines, raw PresentMon CSV, raw license text, reviewer notes, evidence notes, logcat, bugreport data, Android full serials, tokens, and full local user paths. It remains `rcCandidateReady=false` and `productionReady=false`.

Tools / Diagnostics shows the release-readiness blocker summary when packaged status or diagnostics export can read the readiness manifest. It also shows a Manual GUI QA Template panel with the relevant template/result commands, pending status, and production-not-ready reminder. These panels are informational only and do not run shell commands from the frontend.

`docs/windows-packaging-manual-gui-checklist.md` is the manual follow-up after the automated smokes. It covers installed app startup, Dashboard, Tools / Diagnostics, sidecar restart/crash visibility, mock session, report/export, diagnostics export, installed storage, uninstall, and privacy checks. Passing that checklist still does not make the build production-ready.

Do not run Tauri check/build commands in parallel with `pnpm build:self-contained-sidecar` or `pnpm verify:packaging-notices`; the self-contained scripts rewrite `apps/desktop/src-tauri/binaries` while Cargo/Tauri may be enumerating resources.

For 4B-4 real-machine verification, run `pnpm detect:tauri-toolchain` first. If it reports missing Rust/Cargo or Tauri CLI, pause before `pnpm check:tauri`, `pnpm dev:tauri`, or `pnpm build:tauri`; update troubleshooting notes instead of treating the Rust build as verified. On Windows, also confirm MSVC Build Tools and WebView2 Runtime availability before debugging Tauri build failures.

## 4B-4 Windows Verification Result

On the Windows x64 validation machine, `pnpm detect:tauri-toolchain` reports Rust/Cargo/rustc/rustup and Tauri CLI available. `pnpm check:tauri` compiles the Rust layer. `pnpm dev:tauri` starts Vite, compiles the Tauri app, runs `target\debug\lumatrace-desktop.exe`, and the sidecar supervisor records local-server sidecar startup. `pnpm build:tauri` produces `apps/desktop/src-tauri/target/release/lumatrace-desktop.exe`.

Dev mode uses `apps/desktop/src-tauri/tauri.dev.conf.json` to clear bundle resources during `tauri dev`; the release build still includes the configured runtime resources. This avoids feeding the large self-contained sidecar runtime into the Windows debug resource compiler while keeping `externalBin` validation intact. The self-contained sidecar build also breaks workspace hardlinks in the deployed runtime so rebuilding TypeScript packages does not mutate files watched under `src-tauri/binaries`.

After the self-contained sidecar draft step, the manifest can report `artifactKind: "self-contained"` and `nodeRequired: false`. `productionReady` remains `false`. The build is unsigned, has no updater, and is not an installer or store-ready release.

## Log Rotation And Diagnostics Export

AppLog contains `app.log`, `local-server.log`, `sidecar-supervisor.log`, and `packaging-diagnostics.log`. Rotation is bounded to 10 MB per file and 5 retained files. Raw logs are not copied into reports or diagnostics exports.

Packaging diagnostics export returns sanitized JSON only. It includes toolchain status, sidecar manifest metadata, packaged status, sanitized paths, log metadata, short sanitized excerpts, storage status, and limitation flags. It omits auth tokens, full paths, raw logs, raw stdout/stderr, raw CSV, logcat, bugreport data, command lines, and stack traces.

## Packaged Storage Smoke

`pnpm smoke:packaged-storage` runs without the Tauri GUI. It starts packaged local-server with AppLocalData-like temp paths, creates and stops a mock session, generates report exports, restarts with the same database path, and verifies persisted session/report readability. This smoke does not require Android devices, PC targets, PresentMon, or network access.
