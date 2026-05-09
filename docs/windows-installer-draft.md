# Windows Installer Draft

Milestone 4B is not a signed Windows release. This document records the installer direction and QA expectations.

Current draft verification has two layers:

- `pnpm verify:windows-bundle-draft` checks the unsigned portable release directory and does not build an installer.
- `pnpm verify:windows-installer-draft` is an explicit opt-in NSIS installer draft probe. It enables bundling only through a temporary Tauri config override, records the real result in `lumatrace-installer-draft-manifest.json`, and keeps `productionReady=false`.

## Draft Build Types

Tauri can produce Windows bundles such as MSI or NSIS installers depending on bundle configuration. LumaTrace has not completed production installer publishing in 4B.

The default repository config keeps `bundle.active=false` and verifies the unsigned portable release directory with `pnpm verify:windows-bundle-draft`. That script runs the release sidecar smoke and writes `lumatrace-bundle-draft-manifest.json` under the Tauri release directory.

The installer draft path does not change the default config. `pnpm build:tauri-installer-draft` writes a temporary config under `src-tauri/target/installer-draft/`, runs Tauri with `--bundles nsis --no-sign --ci`, and writes a sanitized manifest under `src-tauri/target/release/lumatrace-installer-draft-manifest.json`.

On a clean machine, Tauri may download NSIS packaging utilities and validate their hashes before producing the draft setup executable. This is part of the draft build toolchain and still requires release/license review before any distribution.

## Code Signing

Production Windows distribution requires a code signing certificate. Unsigned builds may trigger Microsoft SmartScreen. Code signing is not complete in 4B.

## Sidecar

The local-server sidecar is included through Tauri `externalBin`. The manifest records artifact kind, target triple, SHA-256 hash, size, whether Node is required, and `productionReady`.

If the artifact is a dev wrapper, it is not suitable for final end-user distribution.

## Runtime Requirements

- Windows 10/11.
- WebView2 Runtime if not already installed.
- Android adb is optional.
- PresentMon is optional.
- Base app usage should not require administrator privileges.
- Some PresentMon capture scenarios may need Windows log access group membership or an administrator hint, but LumaTrace does not bypass permissions.

## Optional Tool Bootstrap

The installer draft can call the Windows tool bootstrap instead of asking users to manually set up optional tools:

- `pnpm detect:windows-tools` detects ADB and PresentMon.
- `pnpm bootstrap:windows-tools` installs missing tools through fixed winget package IDs and configures user environment variables.
- ADB uses `Google.PlatformTools`.
- PresentMon uses `Intel.PresentMon.Console`.

This path is intended for installer or first-run setup. It does not grant arbitrary shell command permission to the frontend, does not bypass Android USB authorization, and does not bundle unclear-license binaries. Directly bundling ADB or PresentMon remains blocked until license review, third-party notices, signing, and release approval are complete.

## Paths

- SQLite, reports, and diagnostics: AppLocalData.
- App and sidecar logs: AppLog.
- Uninstall may not delete AppLocalData.

## Installer Smoke Checklist

- App starts without opening a public network port.
- local-server listens on `127.0.0.1`.
- Packaged REST and WebSocket require the local bearer token.
- Sidecar status is visible.
- Run `pnpm smoke:tauri-release-sidecar` after `pnpm build:tauri` to confirm the release `externalBin` sidecar and bundled runtime can start with `PATH` cleared.
- Run `pnpm verify:windows-bundle-draft` to confirm the unsigned portable release-directory layout and draft manifest.
- Run `pnpm verify:windows-installer-draft` only when intentionally probing the unsigned NSIS installer draft.
- Confirm `lumatrace-installer-draft-manifest.json` says `unsigned: true`, `productionReady: false`, `codeSigningConfigured: false`, and `updaterConfigured: false`.
- Run `pnpm smoke:windows-installer-draft` to silently install the unsigned draft into a temporary directory, verify the app executable, sidecar executable, bundled runtime, notice files, and uninstaller, then run the uninstaller and remove the temporary directory.
- Confirm `lumatrace-installer-smoke-manifest.json` contains only sanitized temp path labels and relative installed file paths.
- Run `pnpm smoke:windows-installed-app-launch` to silently install the unsigned draft into a temporary directory, launch the installed app executable for a bounded startup window, optionally observe the local-server sidecar process, then close the app, uninstall, and remove the temporary directory.
- Confirm `lumatrace-installed-app-launch-smoke-manifest.json` contains no token, full local user path, stack trace, or `productionReady: true`.
- Run `pnpm smoke:windows-installed-sidecar-health` to silently install the unsigned draft, launch the installed app, confirm the installed sidecar process exposes only loopback TCP listeners, then close, uninstall, and remove the temporary directory.
- Confirm `lumatrace-installed-sidecar-health-smoke-manifest.json` records loopback listener counts, `publicListenerCount: 0`, and no token, full local user path, stack trace, or `productionReady: true`.
- Run `pnpm verify:windows-packaging-smoke-suite` after the Windows packaging smokes to aggregate and verify the sanitized manifest set without rebuilding artifacts.
- Confirm `lumatrace-windows-packaging-smoke-suite-manifest.json` says `status: success` and `productionReady: false`.
- Run the manual GUI checklist in `docs/windows-packaging-manual-gui-checklist.md` before broader QA.
- Run `pnpm verify:packaging-notices` to confirm bundled runtime/dependency notice files exist and are hashed in the manifest.
- Packaged storage restart smoke passes.
- Reports and diagnostics do not expose token, raw logs, command lines, or full local paths.

No updater is configured in 4B.

This draft still does not create a signed MSI or NSIS installer. The release sidecar smoke and bundle draft verification check the portable Tauri release directory layout only: `lumatrace-desktop.exe`, the externalBin sidecar executable, `sidecar-manifest.json`, notice files, and the bundled sidecar runtime resources. The installer draft probe can produce an unsigned NSIS setup executable for QA. The installer smoke can exercise a temporary silent install/uninstall cycle, the installed app launch smoke can start the installed app for a bounded startup check, and the installed sidecar health smoke can verify observable loopback-only sidecar binding. The smoke suite verifier aggregates those manifests for review. None of these artifacts is production-ready or suitable for distribution as a release.

Notice generation is also draft-only. `packaging-notices.json` and `THIRD-PARTY-NOTICES.md` are generated for release review and do not imply code signing, updater support, installer publication, or production readiness.
