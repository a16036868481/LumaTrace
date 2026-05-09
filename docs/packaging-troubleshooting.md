# Packaging Troubleshooting

## Sidecar Does Not Start

- Run `pnpm build:sidecar`.
- Run `pnpm detect:tauri-toolchain` if you are trying to run Tauri dev/build.
- Check `apps/desktop/src-tauri/binaries/sidecar-manifest.json`.
- In development, confirm Node.js is available if the manifest says `artifactKind: "dev-wrapper"` and `nodeRequired: true`.
- For the self-contained draft, confirm `lumatrace-local-server-runtime` exists beside the sidecar wrapper and contains the bundled `node.exe` plus `app/dist/src/index.js`.
- Run `pnpm verify:packaging-notices` if `packaging-notices.json` or `THIRD-PARTY-NOTICES.md` is missing or the manifest notice hash does not match.
- Check AppLog for `sidecar-supervisor.log` and `local-server.log`.

## Server Unavailable In Packaged Mode

- Open Tools / Diagnostics.
- Check sidecar status: `starting`, `running`, `stopping`, `stopped`, `crashed`, `restart_limited`, `auth_failed`, `port_conflict`, `db_migration_failed`, or `shutdown_requested`.
- Use Restart sidecar. Restart is bounded by a restart cooldown and restart limit.
- If the status is `restart_limited`, export packaging diagnostics before trying manual recovery.
- If the status is `port_conflict`, check for another local process using the selected port.
- If the status is `db_migration_failed`, inspect sanitized packaged status and diagnostics export, then run `pnpm smoke:packaged-storage`.
- Confirm no other process is blocking localhost.

## Auth Errors

- Packaged mode requires a Bearer token for REST and a token subprotocol for WebSocket.
- The token is memory-only. It is not in `VITE_`, localStorage, URL query strings, logs, reports, or diagnostics.
- Dev mode remains `pnpm dev:server` / `pnpm dev:desktop`.

## Paths

Packaged mode uses app directories:

- SQLite: AppLocalData/lumatrace.db
- Reports: AppLocalData/reports/
- Diagnostics: AppLocalData/diagnostics/
- Logs: AppLog/
- Temp: Temp/LumaTrace/

Full local paths are sanitized before UI/report display.

## Logs

4B-2 adds log rotation metadata and sanitized packaging diagnostics export. The default policy is 10 MB per file and 5 retained files. Raw logs are not embedded in reports or diagnostics exports; only short sanitized excerpts may appear.

## Packaged Storage

`/api/packaged/status` reports DB existence, migration status, migration versions, session count, report count, and sanitized DB/report/diagnostics paths. `pnpm smoke:packaged-storage` verifies that a mock session and report remain readable after restarting packaged local-server with the same `dbPath`.

## Toolchain

`pnpm detect:tauri-toolchain` reports missing cargo, rustc, rustup, or Tauri CLI without installing anything. `pnpm check:tauri`, `pnpm dev:tauri`, and `pnpm build:tauri` require the missing tools to be installed first.

## Optional Windows Tools

Use `pnpm detect:windows-tools` to check whether ADB and PresentMon are already available. Use `pnpm bootstrap:windows-tools` for the installer/first-run flow that installs missing optional tools with winget and configures user environment variables for newly launched app processes.

The fixed winget package IDs are `Google.PlatformTools` for Android SDK Platform-Tools and `Intel.PresentMon.Console` for PresentMon Console. If winget is unavailable, the bootstrap reports the missing package manager instead of failing the whole app.

ADB installation still cannot authorize a phone automatically. The user must enable Android Developer Options, enable USB debugging, connect USB, and approve the RSA prompt on the phone. PresentMon permission hints remain informational only; LumaTrace does not bypass Windows permissions.

### Windows Rust/Tauri Setup

Run this checklist before claiming Rust/Tauri validation:

1. Install Rust with rustup from `https://rustup.rs/`.
2. Reopen the terminal so `cargo`, `rustc`, and `rustup` are on `PATH`.
3. Install Microsoft C++ Build Tools if Rust reports a missing MSVC linker. The Desktop development workload or the standalone Build Tools package is enough for the Rust linker path.
4. Confirm WebView2 Runtime is installed. Windows 11 usually includes it; Windows 10 test machines may need the Evergreen WebView2 Runtime.
5. Enable the Tauri CLI available to the workspace. The package script checks `pnpm tauri --version`, `cargo tauri --version`, or the local `@tauri-apps/cli` package if present.
6. Run `pnpm detect:tauri-toolchain` again. It must report `rustAvailable: true` and `tauriCliAvailable: true` before `pnpm check:tauri`, `pnpm dev:tauri`, or `pnpm build:tauri` are treated as actionable build validation.

Do not auto-install Rust from project scripts, do not bypass toolchain checks, and do not report `pnpm check:tauri`, `pnpm dev:tauri`, or `pnpm build:tauri` as passed when the detector reports missing tools.

Current 4B-4 missing-tool behavior:

- If `rustAvailable` is `false`, stop before Rust compilation and document the missing `cargo/rustc/rustup` path.
- If `tauriCliAvailable` is `false`, stop before Tauri dev/build and document the missing CLI path.
- `pnpm detect:tauri-toolchain` may pass with warnings; `pnpm check:tauri`, `pnpm dev:tauri`, and `pnpm build:tauri` are expected to fail clearly until the tools are installed.

If `pnpm check:tauri` reports `link.exe not found`, install or repair Visual Studio Build Tools with the C++ workload. The repository scripts load `VsDevCmd.bat` when available so Cargo and Tauri child processes inherit the MSVC linker environment.

If `pnpm dev:tauri` fails only after an automated smoke stops the process, check whether stderr contains `Running target\debug\lumatrace-desktop.exe` and whether AppLog `sidecar-supervisor.log` recorded `local-server sidecar started`. That indicates startup succeeded and the remaining non-zero exit came from stopping the long-running dev command.

If `pnpm dev:tauri` rebuilds repeatedly after `pnpm build:self-contained-sidecar`, confirm the command is using `apps/desktop/src-tauri/tauri.dev.conf.json`. Dev mode intentionally clears bundle resources while still using the configured sidecar binary, so the large self-contained runtime is not compiled into the Windows debug resource file. The self-contained sidecar build also rewrites hard-linked deployed files as standalone copies so workspace `dist/` rebuilds do not trigger Tauri's `src-tauri` watcher.

## Current 4A Limits

No updater, no code signing, no store installer, no iOS, no new metrics, and no cloud. The self-contained sidecar can be built as a draft, but production readiness remains false until signing, installer QA, license notice review, and release smoke are complete.
