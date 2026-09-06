# Platform Limitations

## MVP-A / MVP-B Scope

MVP-A and MVP-B use MockCollector for realtime metric sessions. Mock metrics do not represent real devices, real apps, real games, real OS counters, or real frame presentation.

## Android

Milestone 2A added a non-root ADB foundation: adb tool detection, `adb devices -l`, `getprop`, package list parsing, pidof/ps PID parsing, package UID parsing, Android device discovery, and package targets.

Milestone 2B adds basic Android CPU, memory, and battery sampling for already-running target processes. CPU comes from `/proc/stat` plus `/proc/<pid>/stat`; the first sample is baseline-only. Memory comes from `dumpsys meminfo <package>` and may fall back to `/proc/<pid>/status` with lower confidence. Battery comes from `dumpsys battery`; temperature, voltage, and current are device-dependent.

Milestone 2C adds basic network sampling. It first attempts UID-level network deltas through `dumpsys netstats detail`; if unavailable, it falls back to device-level interface counters from `/proc/net/dev`. The fallback is marked `precision: "device_level"` and may include traffic from other apps. The first network sample is baseline-only, and counter resets or negative deltas are skipped rather than fabricated.

Milestone 2E adds explicit app start/force-stop and process rebind. App start uses `am start -W` when a launcher is known. Monkey fallback is optional, disabled by default, and limited to one launch event. Session stop does not force-stop by default. If the target PID is missing and `autoStartTarget=false`, session start fails clearly. PID missing during collection does not produce fake CPU or memory metrics; rebind resets process sampler baselines. adb missing, offline, or unauthorized states do not crash the app.

Milestone 2D adds FPS/frame-time pre-research. `dumpsys gfxinfo <package> framestats`, SurfaceFlinger timestats, SurfaceFlinger layer lists, and display refresh-rate parsing are available for experimental probe paths. The simplified Android flow now attempts a realtime public-ADB probe during the session, but this remains best-effort and can return `N/A`.

Android FPS is marked `experimental`. SurfaceFlinger data is layer-level; LumaTrace must match the target layer before emitting target FPS. Layer matching failure or ambiguity produces no FPS metric. Refresh rate, multi-window, orientation, engines, WebView, Flutter, Unity, Unreal, and vendor ROM differences can make FPS unavailable or estimated. Average FPS is not used to fabricate per-frame frame time.

Future Android work may include more robust experimental FPS paths and richer lifecycle timelines.

If Android network data is only device-level, it must be marked `precision: "device_level"` and must not be presented as app-level traffic.

Milestone 2F adds diagnostics timeline, sanitized diagnostics export, launcher/device metadata cache, and long-session fake stability coverage. Diagnostics exports do not include logcat or bugreport by default. Slow/timeout/retry/abort command events are diagnostics, not fabricated metrics.

## PC

Milestone 3A adds PC Foundation for Windows local process CPU and memory. LumaTrace discovers a local PC device, lists Windows process targets, samples PID-bound CPU/memory, and detects process exit or PID reuse. It does not start, stop, inject into, or inspect target process window contents.

PC CPU uses process kernel/user time deltas. The first sample is baseline-only and emits no fake zero. CPU baselines reset if PID identity changes. PC memory uses process memory snapshots and emits only fields that are present.

Milestone 3B adds PresentMon Console CSV capture. The simplified Windows flow automatically attempts an experimental realtime short-window PresentMon loop for the selected process; advanced timed capture remains explicit. LumaTrace parses the CSV and emits `fps` / `frame_time_ms` only when PID or process identity matching succeeds. No match, ambiguous process-name rows, missing PresentMon, permission-limited capture, or capture failure must not be converted into fake FPS. `frame_time_ms` comes from per-present fields such as `MsBetweenPresents`, not from average FPS.

Milestone 3C adds PC Beta diagnostics and stability polish: capture status, PresentMon version/help compatibility, CSV retention, permission hints including Windows log access group guidance, no-data reasons, and sanitized report diagnostics. Long captures can be cancelled, and aborted or partial captures do not produce fake FPS.

LumaTrace does not implement an ETW SDK consumer, PresentMon Service API, overlay, administrator bypass, process injection, or GPU telemetry in Milestone 3C. Raw PresentMon CSV content, full local output paths, full command lines, and stack traces are not included in reports by default.

macOS process CPU and memory are future targets. Generic FPS is not promised.

Linux is a later extension path through `/proc`, safe kernel counters and similar safe system interfaces.

## Tauri Packaging

Milestone 4A adds a Tauri v2 desktop host and local-server sidecar foundation. It does not change Android, PC, or mock metric semantics.

Packaged local-server is constrained to `127.0.0.1` and requires a one-time bearer token for `/api/*` REST requests and WebSocket streams. The token is generated by the Tauri host, kept in memory, and never placed in `VITE_` variables, URLs, localStorage, logs, reports, or diagnostics.

Packaged data uses application-owned locations such as AppLocalData for SQLite, reports, and diagnostics, and AppLog for app and sidecar logs. These paths are sanitized before UI/report display.

Milestone 4B adds toolchain detection, manifest validation, crash recovery status, log rotation metadata, and packaged storage smoke. The current Windows sidecar draft is self-contained for local QA, but `productionReady` remains `false`. Code signing, updater support, notarization, store distribution, and production release approval are not implemented in this milestone.

## Honesty Rules

- Unavailable metrics are not estimated or fabricated.
- Experimental metrics are labeled as experimental.
- Missing tools become `requires_tool` or tool status records.
- Device-level data is not disguised as app-level or process-level data.
- Mock metrics always use `source: "mock"`.
