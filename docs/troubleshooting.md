# Troubleshooting

## pnpm install fails

- Confirm Node.js is installed.
- Confirm pnpm is available.
- Delete `node_modules` only if dependency state is corrupt, then run `pnpm install` again.

## pnpm dev:server fails

- Run `pnpm build` first to surface TypeScript errors.
- Check whether port `3100` is already in use.
- Set a custom port:

```bash
LUMATRACE_PORT=3101 pnpm dev:server
```

PowerShell:

```powershell
$env:LUMATRACE_PORT="3101"; pnpm dev:server
```

## Port 3100 is occupied

Use another port with `LUMATRACE_PORT`. The default API examples assume `127.0.0.1:3100`.

## SQLite path issues

Set `LUMATRACE_DB_PATH` to a writable file path. Tests and smoke scripts can use `:memory:`.

PowerShell:

```powershell
$env:LUMATRACE_DB_PATH="$env:TEMP\lumatrace.sqlite"; pnpm dev:server
```

## WebSocket connection fails

- Start a session before expecting metric messages.
- Verify the URL uses `ws://127.0.0.1:3100/api/sessions/{id}/stream`.
- Check that the session id exists.
- UI reconnect attempts do not stop the backend session.

## Browser smoke fails

- Run `pnpm install` first so `@playwright/test` is available.
- If no Chromium browser is installed for Playwright, run `pnpm exec playwright install chromium`.
- Retry `pnpm smoke:mvp-b-browser`.
- The browser smoke uses only MockCollector and localhost endpoints.

## Android device does not appear

- Install Android SDK Platform Tools and confirm `adb version` works.
- Enable USB debugging on the device.
- Run `adb devices -l`; if the state is `unauthorized`, unlock the device and accept the RSA prompt.
- If adb is missing, LumaTrace continues to run and shows `adb` as `missing` in Tools / Diagnostics.
- Android 2E discovers devices and package targets, then can sample CPU, memory, battery, and network for running apps. App start is explicit and off by default for session start.

## Android session fails with target process not running

- Start the target app manually on the device first.
- Confirm the package appears in `adb shell pidof <package>`.
- In Milestone 2E, click Start App or set `autoStartTarget=true` if you want LumaTrace to launch it with `am start -W`.
- `allowMonkeyFallback` remains off by default and only sends `monkey -p <package> 1` when explicitly enabled.
- The API returns a clear error instead of emitting fake Android metrics.

## Android Start App or Stop App fails

- Confirm adb is available and the device is authorized.
- Check whether the package has a launcher activity in Device Detail.
- Stop App uses `am force-stop`; it is an explicit action and may close the target app.
- Session stop does not force-stop unless `stopTargetOnSessionStop=true`.

## Android PID disappears during a session

- LumaTrace does not output fake CPU or memory while the process is missing.
- With the default process policy, battery and network can continue when available.
- If the PID reappears, CPU sampling uses a fresh baseline before emitting CPU again.

## Android CPU, memory, or battery is missing

- The first CPU sample is baseline-only; wait for at least one more sample window.
- Memory depends on `dumpsys meminfo <package>` and may fall back to `/proc/<pid>/status` with lower confidence.
- Battery temperature, voltage, and current are device-dependent `dumpsys battery` fields.
- Missing fields are shown as N/A and are not filled with zero.

## Android network is missing or device-level

- The first network sample is baseline-only; wait for at least one more sample window.
- UID-level network uses `dumpsys netstats detail` and varies by Android version and device.
- If UID-level stats are unavailable, LumaTrace may fall back to `/proc/net/dev`.
- `/proc/net/dev` is marked `device_level` and may include traffic from other apps.
- Counter resets or negative deltas are skipped and are not emitted as `0`.

## Android diagnostics warnings

- Slow or timed-out adb command: check Tools / Diagnostics for `ADB_SLOW_COMMAND` or `ADB_TIMEOUT`.
- Command retry is limited to idempotent reads; app start, force-stop, and monkey launch are not retried.
- Session stop aborts pending adb commands when possible.
- Sanitized diagnostics export is available at `GET /api/sessions/:id/diagnostics/export?format=json|html`.
- Diagnostics export does not include logcat or bugreport.

## Android FPS remains N/A

- Android FPS is experimental and the UI toggle is off by default.
- The probe uses `dumpsys gfxinfo <package> framestats` and SurfaceFlinger timestats only when explicitly enabled.
- SurfaceFlinger data is layer-level; target layer matching must succeed before FPS can be emitted.
- If layer matching is ambiguous or missing, LumaTrace leaves FPS/frame time as N/A.
- Average FPS is not used to fabricate per-frame `frame_time_ms`.
- Multi-window, SurfaceView, WebView, Flutter, Unity, Unreal, orientation, and vendor ROM differences can make Android FPS unavailable.

## Local PC process targets do not appear

- Milestone 3A process listing is implemented for Windows only.
- Confirm PowerShell is available.
- Check Tools / Diagnostics for `PROCESS_LIST_FAILED`.
- On non-Windows hosts, Local PC discovery can appear while Windows process sampling remains planned/unavailable.

## PC CPU remains N/A

- The first CPU sample is baseline-only.
- CPU requires two process time snapshots for the same PID/runtime identity.
- If the process exits or the PID is reused, LumaTrace resets or stops sampling instead of emitting fake CPU.

## PC memory remains N/A

- Memory requires a process memory snapshot with working set or equivalent fields.
- Missing process memory fields are not filled with zero.
- If the process exits, memory stops instead of using stale data.

## PresentMon is missing

- PresentMon is optional in Milestone 3B and explicit capture is default off.
- Missing PresentMon appears in `/api/tools/status` and Tools / Diagnostics.
- CPU and memory sampling continue without PresentMon.
- FPS and frame time remain N/A / `requires_tool`; LumaTrace does not fake FPS when PresentMon is missing.

## PresentMon capture has no FPS data

- Confirm `enablePresentMonCapture` was enabled for the PC process session.
- Check `/api/sessions/:id/presentmon/status` or the Test Session PresentMon panel for `planning`, `capturing`, `parsing_csv`, `matching_target`, `completed`, `no_data`, `permission_limited`, `failed`, or `aborted`.
- Prefer PID target mode. Process-name mode can be ambiguous when multiple processes share the same executable name.
- PresentMon may be permission-limited for processes from another user or short-lived processes.
- If permission hints mention Windows log access group, add the user through Windows account management if appropriate and retry. This is optional guidance, not a permission bypass.
- No target rows, ambiguous rows, missing CSV, or capture failure leaves FPS/frame time as N/A.
- CSV retention defaults to `delete_after_parse`; enable keep CSV only for local debugging. Reports do not include raw CSV content.
- LumaTrace does not use average FPS to fabricate `frame_time_ms`.

## No metrics received

- Confirm `POST /api/sessions/:id/start` returned `status: "running"`.
- Query `/api/sessions/:id/metrics`.
- Check `/api/diagnostics` for collection errors.

## Report is empty

- Stop the session first so pending metrics are flushed.
- Confirm raw metrics exist.
- Remember that missing metric classes are not filled with zero.

## typecheck, lint, or test fails

Run the command at the workspace root:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Then inspect the package-specific output.

## Windows notes

Use PowerShell environment assignment syntax. Native SQLite dependencies are installed through npm packages.

## macOS and Linux notes

Use shell environment assignment syntax. MVP-A does not call platform tools.

## Clear local database

Stop the server, then delete the SQLite file configured by `LUMATRACE_DB_PATH`. Do not delete files unless you are sure they are the intended local LumaTrace database.

## In-memory tests

Tests and scripts can use `:memory:` so no persistent database file is created.
