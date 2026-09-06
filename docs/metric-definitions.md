# Metric Definitions

## Core Metrics

- `fps`: frames per second. Mock values are generated and are not real device FPS.
- `frame_time_ms`: frame duration in milliseconds.
- `cpu_percent`: CPU usage percentage. UI should prefer normalized values when available in tags.
- `memory_mb`: memory usage in megabytes.
- `network_rx_bytes`: received bytes during the current sample window, not boot-time cumulative bytes.
- `network_tx_bytes`: transmitted bytes during the current sample window, not boot-time cumulative bytes.
- `network_rx_rate_bps`: receive rate in `B/s`.
- `network_tx_rate_bps`: transmit rate in `B/s`.
- `network_rx_bytes_per_sec` / `network_tx_bytes_per_sec`: legacy rate names still understood by report summaries.
- `battery_level_percent`: battery level.
- `battery_current_ma`: battery current when available.
- `battery_voltage_mv`: battery voltage when available.
- `battery_temperature_c`: battery temperature when available.
- `thermal_event`: thermal event count or marker.

## Metadata

- `source`: where the metric came from, for example `mock`, `adb`, or `PresentMon`.
- `precision`: `exact`, `estimated`, `device_level`, or `unavailable`.
- `confidence`: `high`, `medium`, or `low`.
- `MetricAvailability`: declares whether a metric is `available`, `unavailable`, `requires_tool`, `requires_permission`, or `experimental`.
- Android diagnostics record parser warnings, fallback reasons, process missing/rebound, and command timeout events separately from metrics. These diagnostics explain data quality; they must not be converted into fake zero-valued metrics.

## Android 2E Availability And Metrics

- `android.device_discovery`: adb device discovery capability.
- `android.device_info`: basic metadata from `getprop`.
- `android.package_list`: package target listing from `pm list packages`.
- `android.pid`: PID lookup helpers via `pidof` and `ps`.
- `android.launcher_activity_discovery`: launcher parsing from `dumpsys package`.
- `android.app_start`: explicit app start via `am start -W`; optional monkey fallback remains disabled by default.
- `android.app_force_stop`: explicit force-stop via `am force-stop`; session stop does not use this unless configured.
- `android.process_rebind`: best-effort PID rebound handling during sessions.
- `adb`: external tool status for Android SDK Platform Tools.

Android 2E can emit:

- `cpu_percent`: calculated from `/proc/stat` and `/proc/<pid>/stat` deltas. The first sample establishes a baseline and does not emit a value. Tags include `rawPercent`, `normalizedPercent`, `coreCount`, `pid`, and `sampler`.
- `memory_mb`: preferably total PSS from `dumpsys meminfo <package>`. If unavailable, `/proc/<pid>/status` RSS can be used with lower confidence.
- `battery_level_percent`: normalized from `level / scale * 100` when both fields are present.
- `battery_temperature_c`, `battery_voltage_mv`, `battery_current_ma`: emitted only when `dumpsys battery` exposes the corresponding field.
- `network_rx_bytes` and `network_tx_bytes`: byte deltas for a sample window. UID-level source is `adb:dumpsys netstats detail` with `precision: "estimated"`. Device fallback source is `adb:/proc/net/dev` with `precision: "device_level"`.
- `network_rx_rate_bps` and `network_tx_rate_bps`: byte deltas divided by the sample window seconds.

Network rules:

- The first network sample establishes a baseline and emits no metric.
- UID-level netstats availability varies by Android version and device.
- Device-level `/proc/net/dev` may include traffic from other apps and must not be interpreted as target-only traffic.
- Negative deltas or counter resets are skipped.
- Missing network fields are not emitted and are not replaced with `0`.

Android FPS and frame time remain experimental:

- `fps` and `frame_time_ms` availability is `experimental` for Android.
- The simplified Android test flow enables an experimental realtime probe. The collector repeatedly opens short public-ADB sampling windows during the session and emits `fps` / `frame_time_ms` only when target frame data can be matched.
- The probe still uses public ADB data only; no root, private API, logcat, or bugreport path is used.
- `gfxinfo framestats` can provide frame completion deltas for some rendering paths.
- SurfaceFlinger timestats is layer-level and requires layer matching before target FPS can be emitted.
- Ambiguous or missing layer matches produce no target FPS metric.
- Histogram-based SurfaceFlinger frame-time analysis is approximate and marked as such.
- Average FPS alone is not used to infer P95/P99 frame time or fabricate `frame_time_ms`.
- Multi-window, orientation, SurfaceView, WebView, Flutter, Unity, Unreal, and vendor ROM differences can make Android FPS unavailable.

Missing Android fields are not emitted and are not replaced with `0`.

Lifecycle rules:

- `autoStartTarget`, `allowMonkeyFallback`, and `stopTargetOnSessionStop` default to `false`.
- Monkey fallback is limited to one launch event and is not a stress test.
- PID missing intervals do not emit fake process CPU or memory metrics.
- PID rebound recreates CPU/memory samplers so process CPU uses a fresh baseline.

## PC Beta Availability And Metrics

- `pc.device_discovery`: local PC device discovery.
- `pc.process_list`: Windows process targets when the Windows process adapter is available.
- `cpu_percent`: calculated from Windows process kernel/user time deltas. The first sample establishes a baseline and does not emit a value.
- `memory_mb`: emitted from Windows process memory snapshots when working set is available.
- `fps` and `frame_time_ms`: `requires_tool` or `experimental` through PresentMon CSV capture. The simplified Windows test flow enables a realtime short-window PresentMon loop when the tool is available; advanced timed capture remains explicit.

PC metric metadata:

- CPU source: `windows:process-times`.
- Memory source: `windows:process-memory`.
- CPU tags include `rawPercent`, `normalizedPercent`, `processorCount`, `pid`, `processName`, `sampleWindowMs`, and `targetRuntimeId`.
- Memory tags include working set and any available private bytes or peak working set values.
- PresentMon source: `PresentMon:CSV`.
- PresentMon tags include process id, application, runtime, capture id, match confidence, `experimental=true`, and whether FPS was derived from per-frame time.
- Realtime Windows FPS is produced by repeated short PresentMon capture windows and is still marked experimental. If PresentMon is missing, no data, no-match, ambiguous, permission-limited, failed, or aborted, FPS/frame time stay `N/A`.
- PresentMon capture status is diagnostic metadata, not a metric. Status values include `capturing`, `parsing_csv`, `matching_target`, `completed`, `no_data`, `permission_limited`, `failed`, and `aborted`.

PC process rules:

- PID plus start time/runtime id identify the target.
- PID exit or reuse resets or stops sampling and does not emit fake CPU/memory.
- PresentMon missing is a tool status, not an FPS metric.
- PresentMon no-match or ambiguous-match results produce no FPS/frame-time metrics.
- PresentMon permission-limited, failed, aborted, CSV-missing, or CSV-empty results produce no FPS/frame-time metrics.
- `frame_time_ms` comes from per-present fields such as `MsBetweenPresents`; average FPS is not used to fabricate frame-time samples.
- CSV retention diagnostics explain whether CSV was deleted or retained; reports do not contain raw CSV content.
- Missing PC fields remain undefined and display as `N/A`.

## Mock Profiles

- `stable_60fps`: mostly stable 60 Hz-like data with small drops.
- `janky_game`: periodic FPS drops, jank, severe jank, and CPU spikes.
- `memory_growth`: gradual memory growth with occasional simulated release.

All mock profile data uses `source: "mock"`.

## Jank Rules

Default refresh rate is 60 Hz unless a metric tag or profile specifies otherwise.

- `expectedFrameTimeMs = 1000 / refreshRate`
- jank: `frame_time_ms > 2 * expectedFrameTimeMs`
- severe jank: `frame_time_ms > 3 * expectedFrameTimeMs`

Supported refresh rates include 30, 60, 90, 120, and custom values.

## Low FPS Metrics

- `1% low`: average of the lowest 1 percent of FPS samples.
- `0.1% low`: average of the lowest 0.1 percent of FPS samples.

## Missing Metrics

If a metric class is absent, the report leaves the corresponding summary field undefined and HTML displays `N/A`. Missing network, battery, thermal, GPU, FPS, or other metrics are never filled with fake zero values.
