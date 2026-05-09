# Windows Packaging Manual GUI Checklist

Use this checklist after the automated Windows packaging smokes pass and before broader QA. This is a manual GUI checklist for the unsigned packaging draft only. It is not production release approval.

## Scope

- Validate the installed Windows app can be used through the visible UI.
- Confirm the packaged local-server sidecar status is visible and recoverable.
- Confirm the app still behaves as local-only and token-protected.
- Confirm basic mock session and report flows work from the installed app.
- Confirm diagnostics and reports do not expose auth tokens, raw logs, stack traces, full user paths, or command lines.

This checklist does not cover production code signing, updater behavior, notarization, store distribution, iOS, Android device hardware QA, PC/PresentMon hardware QA, or new metrics.

## Preparation

- Run `pnpm detect:tauri-toolchain` and confirm Rust/Cargo/Tauri CLI status is understood.
- Run `pnpm build:self-contained-sidecar`.
- Run `pnpm verify:sidecar-artifacts`.
- Run `pnpm verify:packaging-notices`.
- Run `pnpm verify:windows-installer-draft`.
- Run `pnpm smoke:windows-installer-draft`.
- Run `pnpm smoke:windows-installed-app-launch`.
- Run `pnpm smoke:windows-installed-sidecar-health`.
- Run `pnpm verify:windows-packaging-smoke-suite`.
- Run `pnpm verify:windows-packaging-qa-evidence`.
- Run `pnpm verify:windows-manual-gui-qa-template`.
- Confirm every generated packaging manifest keeps `productionReady: false`.
- Confirm `lumatrace-windows-packaging-qa-evidence.json` records `manualGuiQa.status: "not_run"` before this checklist is run.
- Confirm `lumatrace-windows-manual-gui-qa-template.json` records every checklist step as `pending` before this checklist is run.
- After completing this checklist, fill a separate result JSON from the generated template and run `pnpm verify:windows-manual-gui-qa-result path/to/result.json`.

## Install And Start

- Install the unsigned NSIS draft only on a QA machine or temporary test VM.
- Expect Windows SmartScreen or unsigned-app warnings because code signing is not complete.
- Start LumaTrace from the installed shortcut or installed executable.
- Confirm the main window appears without a blank screen.
- Confirm the app does not request administrator privileges for base startup.
- Confirm no public network listener appears for LumaTrace or the sidecar.
- Confirm uninstall remains available from the installation directory or Windows Apps settings.

## Dashboard

- Dashboard loads without requiring a manually started dev server.
- Sidecar status badge is visible.
- Sidecar status becomes running.
- Mock device remains visible even without Android devices or PC tool dependencies.
- Local PC device appears where supported.
- The UI does not display the local auth token.
- The UI does not display full AppLocalData/AppLog paths.
- The UI does not display stack traces.

## Tools Diagnostics

- Open Tools / Diagnostics.
- Packaging section is visible.
- Toolchain panel is visible.
- Sidecar manifest panel is visible.
- Artifact kind is visible and honest.
- `productionReady=false` or equivalent production-not-ready notice is visible.
- Code signing not configured notice is visible.
- Updater not configured notice is visible.
- Sidecar status is visible.
- Restart sidecar action is visible.
- Crash recovery state is visible.
- Restart cooldown and restart limit are visible or documented in the panel.
- Log rotation policy is visible.
- Packaged storage status is visible.
- Packaging diagnostics export is available.
- Diagnostics preview uses sanitized paths and sanitized excerpts only.

## Sidecar Actions

- Restart sidecar from Tools / Diagnostics.
- Confirm the UI shows a transitional state and returns to running.
- Confirm dashboard and API-backed views recover after restart.
- Confirm restart does not expose the auth token.
- Confirm repeated restart attempts are bounded by cooldown and restart limit.
- If sidecar is deliberately terminated outside the app, confirm the UI shows a crash or unavailable state instead of a blank screen.

## Mock Session

- Create a mock session from the installed app.
- Start the session.
- Confirm live metrics arrive over WebSocket.
- Confirm realtime charts update.
- Add a marker.
- Stop the session.
- Confirm the session stops cleanly.
- Confirm sidecar shutdown is not triggered by session stop.
- Confirm no metric card fills unavailable values with fake zeros.

## Report And Export

- Generate a report for the mock session.
- Confirm summary cards render.
- Confirm unavailable metrics show `N/A` rather than `0`.
- Export JSON.
- Export HTML.
- Export CSV.
- Confirm report/export files are created under the configured reports location.
- Confirm reports do not include auth tokens.
- Confirm reports do not include full local user paths.
- Confirm reports do not include raw logs.
- Confirm reports do not include stack traces.

## Packaging Diagnostics Export

- Export packaging diagnostics JSON.
- Confirm it includes app version, platform, sidecar manifest metadata, packaged status, log metadata, storage status, and limitations.
- Confirm it does not include the auth token.
- Confirm it does not include full local user paths.
- Confirm it does not include raw stdout/stderr.
- Confirm it does not include raw logs.
- Confirm it does not include command lines.
- Confirm it does not include raw PresentMon CSV, logcat, bugreport, Android full serials, or stack traces.

## Installed Storage

- Close the app.
- Start it again.
- Confirm previous sessions or reports that should persist remain visible.
- Confirm the app does not write default data to the repository root.
- Confirm the app does not write default data to the user desktop.
- Confirm AppLocalData/AppLog paths are shown only in sanitized form.

## Uninstall

- Close LumaTrace.
- Run the uninstaller.
- Confirm installed app files are removed.
- Confirm uninstall may leave AppLocalData by design.
- Confirm any retained data is documented and can be removed manually by the user.

## Pass Criteria

- Installed app starts and renders the UI.
- Sidecar runs locally and is visible in UI.
- REST/WebSocket-backed mock session flow works.
- Report/export flow works.
- Packaging diagnostics export is sanitized.
- Sidecar restart/crash UX is visible.
- No public sidecar listener is observed.
- No auth token, full local user path, raw log, command line, stack trace, logcat, bugreport, raw CSV, or Android full serial is shown in UI/report/diagnostics.
- `productionReady` remains false.
- The build is still described as unsigned QA-only until code signing, updater policy, installer QA, and release approval are complete.
- The filled manual GUI QA result passes `pnpm verify:windows-manual-gui-qa-result path/to/result.json` without exposing tokens, full local paths, raw logs, command lines, stack traces, or production-ready claims.
