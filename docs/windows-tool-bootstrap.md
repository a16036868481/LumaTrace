# Windows Tool Bootstrap

This bootstrap is the Windows installer/first-run path for optional native tools. It is designed so a normal user does not need to manually hunt for ADB or PresentMon after installing LumaTrace.

It is still not a production release approval. LumaTrace does not bundle unclear-license binaries. Bundling ADB or PresentMon directly inside the app remains blocked until license review, third-party notices, signing, and release approval are complete. `productionReady=false` must remain true for the current release artifacts.

## What It Handles

- Android SDK Platform-Tools (`adb`) for Android device discovery and Android metrics.
- PresentMon Console for explicit Windows FPS and frame-time capture.
- User environment setup:
  - `LUMATRACE_ADB_PATH`
  - `ANDROID_HOME`
  - `ANDROID_SDK_ROOT`
  - user `PATH` entry for `platform-tools`
  - `LUMATRACE_PRESENTMON_PATH`

## Commands

Detection only:

```bash
pnpm detect:windows-tools
```

Install missing tools through fixed winget package IDs and configure found paths:

```bash
pnpm bootstrap:windows-tools
```

Verification:

```bash
pnpm verify:windows-tool-bootstrap
```

The bootstrap uses exact package IDs:

- `Google.PlatformTools`
- `Intel.PresentMon.Console`

The commands are fixed by the installer/bootstrap script. The frontend does not receive arbitrary shell command permission, and users cannot pass arbitrary binary paths for execution.

## Installer Direction

The Windows installer can run the same bootstrap as an optional setup step after the app files are installed:

1. Detect `winget`.
2. Detect ADB and PresentMon.
3. Install missing optional tools with winget after the installer shows the tool list and source package IDs.
4. Configure user environment variables for tools that were found or installed.
5. Tell the user to reopen LumaTrace or restart the computer if Windows has not refreshed user environment variables yet.

Android still needs the phone-side authorization step: enable Developer Options, enable USB debugging, connect USB, and approve the RSA prompt. This cannot be bypassed by the installer.

PresentMon may still require Windows permissions for some cross-user or protected processes. LumaTrace only shows permission guidance; it does not bypass permissions.

## Privacy And Logs

The bootstrap must not write auth tokens to logs, reports, diagnostics, environment variables, or URLs. It does not handle LumaTrace local auth tokens.

Tool paths are sanitized in JSON/status output. Diagnostics and reports should use file names, package IDs, hashes, booleans, and sanitized path labels instead of full local paths.

## Production Boundary

This bootstrap reduces manual setup for users, but it does not make the current package production-ready. Production readiness still requires:

- self-contained sidecar release approval;
- third-party binary/license notice review;
- code signing;
- installer QA;
- updater policy decision;
- final release approval.

