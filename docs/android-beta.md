# Android Beta Notes

Milestone 2F closes the Android Beta scope with diagnostics timeline, sanitized diagnostics export, command timeout/retry/abort diagnostics, launcher/device metadata cache, long-session fake stability tests, and real-device manual acceptance docs.

Milestone 2E adds explicit Android app lifecycle operations and process rebind handling. It builds on the Milestone 2A ADB foundation, Milestone 2B CPU/memory/battery sampling, Milestone 2C network sampling, and Milestone 2D FPS/frame-time pre-research, while still using non-root, public Android tooling only.

Implemented:

- adb detection through `LUMATRACE_ADB_PATH`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `PATH`
- `adb devices -l` parser
- `getprop` parser and basic device metadata
- `pm list packages` parser and package targets
- `pidof` and `ps` PID parser
- `dumpsys package` UID parser
- Android availability labels in local-server and desktop UI
- Android CPU sampling from `/proc/stat` and `/proc/<pid>/stat`
- Android memory sampling from `dumpsys meminfo <package>`
- Low-confidence Android memory fallback from `/proc/<pid>/status`
- Android battery level, temperature, voltage, and current when `dumpsys battery` exposes those fields
- Android network RX/TX byte deltas and RX/TX rates
- UID-level network attempt through `dumpsys netstats detail`
- Device-level network fallback through `/proc/net/dev`
- `dumpsys gfxinfo <package> framestats` parser and stop-time probe path
- SurfaceFlinger timestats/layer-list parsers and layer matching
- display refresh-rate parser for analysis context
- experimental FPS availability surfaced to local-server and desktop UI
- experimental realtime FPS/frame-time probe loop in the simplified Android test flow
- launcher activity discovery from `dumpsys package <package>`
- explicit app launch through `am start -W`
- optional monkey fallback limited to `monkey -p <package> 1`, disabled by default
- explicit app force-stop through `am force-stop`
- PID wait after launch and best-effort PID rebind during sessions
- Android diagnostics timeline for parser warnings, fallback reasons, process missing/rebound, device-level network, and FPS probe results
- sanitized diagnostics JSON/HTML export
- launcher discovery cache and device info cache
- ADB command slow/timeout/retry/abort diagnostics
- Android Beta real-device checklist

Not implemented:

- production-stable Android FPS or frame-time streaming across all devices/apps
- logcat
- adb bugreport auto collection

Operational boundaries:

- App start is explicit. `autoStartTarget` defaults to `false`.
- Force-stop is explicit. Session stop does not force-stop the app unless `stopTargetOnSessionStop=true`.
- Monkey fallback is disabled by default and only sends one launch event; it is not monkey stress testing.
- If a target process is missing, LumaTrace does not emit fake CPU or memory metrics.
- PID rebind resets process-level sampler baselines before emitting CPU again.
- The first CPU sample is baseline-only and does not emit a fake CPU metric.
- The first network sample is baseline-only and does not emit fake network deltas.
- UID-level network availability varies by Android version and device.
- `/proc/net/dev` fallback is `device_level`; it may include traffic from other apps and must not be interpreted as target-only traffic.
- Negative network deltas or counter resets are skipped and used to rebuild baseline.
- Missing memory or battery fields are left absent; they are not filled with `0`.
- Missing network fields are left absent; they are not filled with `0`.
- Android FPS is `experimental`. The simplified UI enables a realtime public-ADB probe during tests, but it can still return `N/A` when public frame data cannot be matched.
- The FPS probe uses `gfxinfo framestats` and SurfaceFlinger timestats only through session config.
- SurfaceFlinger data is layer-level; LumaTrace must match a target layer before emitting target FPS.
- If layer matching fails or multiple candidates are ambiguous, FPS and frame time remain `N/A`.
- `gfxinfo framestats` does not cover every rendering path, especially some games, WebView, Flutter, Unity, Unreal, multi-window, and vendor ROM variants.
- Average FPS is not used to fabricate per-frame `frame_time_ms`.
- No root is required and no private API is used.
- Diagnostics export is sanitized and does not contain logcat, bugreport, full serials, or raw long stdout/stderr.
- Android Beta automated tests do not require real adb or a real Android device.
