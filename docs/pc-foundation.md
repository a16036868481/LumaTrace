# PC Foundation

Milestone 3A added the first PC collector foundation for Windows local process sampling. Milestone 3B adds explicit, user-enabled PresentMon CSV capture for experimental FPS/frame-time metrics. Milestone 3C closes the PC Beta scope with capture status, compatibility checks, CSV retention policy, permission hints, long-capture stability tests, and sanitized report diagnostics.

## Implemented In 3A

- Local PC device discovery.
- Windows process target listing.
- PID-bound `cpu_percent` sampling from process kernel/user time deltas.
- PID-bound `memory_mb` sampling from process memory snapshots.
- Process exit and PID reuse detection.
- PresentMon tool detection.
- PresentMon CSV parser fixtures.
- Explicit PresentMon timed capture adapter, default off.
- PresentMon PID/process-name matcher and MetricEvent mapper for `fps` and `frame_time_ms`.
- PresentMon capture status, compatibility planning, CSV retention, no-data reasons, and permission diagnostics.
- Local-server registration, WebSocket streaming, storage, report, and desktop UI display for PC CPU/memory.

## Boundaries

- LumaTrace does not start or stop Windows processes in Milestone 3A.
- LumaTrace does not inject into target processes.
- LumaTrace does not read window contents.
- LumaTrace does not bypass Windows permissions or require administrator rights for basic CPU/memory sampling.
- PresentMon capture is explicit and experimental in 3B.
- LumaTrace does not implement an ETW SDK consumer, PresentMon Service API, overlay, or GPU telemetry.
- PresentMon missing, permission-limited, failed, unmatched, or ambiguous capture does not block CPU/memory.
- GPU, macOS, and Linux collectors are outside this batch.

## Metrics

`cpu_percent` uses two process-time snapshots. The first sample is baseline only and emits no fake zero. `rawPercent` keeps multi-core process CPU semantics, while `normalizedPercent` is divided by processor count for UI display.

`memory_mb` uses working set when available. Private bytes, peak working set, and pagefile usage are kept in tags when present. Missing memory fields remain absent and are not replaced with `0`.

`fps` and `frame_time_ms` remain `requires_tool` or `experimental`. PresentMon capture must be explicitly enabled with `enablePresentMonCapture=true`. CSV rows must match the target PID or process identity before metrics are emitted. Missing PresentMon, no target rows, or ambiguous process-name matches never create fake FPS.

`frame_time_ms` comes from per-present fields such as `MsBetweenPresents`. LumaTrace does not reverse-engineer per-frame time from average FPS. PresentMon-derived events carry `source: "PresentMon:CSV"`, `precision: "estimated"`, confidence metadata, and `tags.experimental=true`.

## Identity

Process targets use PID plus `startTimeMs` or a runtime id. If a PID exits or is reused by another process, samplers reset or stop instead of mixing metrics across processes.

## Privacy

Executable paths and command lines can contain usernames or secrets. Desktop and report surfaces should mask user paths and never show raw command lines by default.

Raw PresentMon CSV content and full output paths are not included in reports by default.

## PC Beta Additions In 3C

`docs/pc-beta.md` is the current Beta summary. PresentMon capture status is queryable, CSV retention defaults to `delete_after_parse`, and reports include sanitized status/compatibility/permission/no-data diagnostics. The app still does not implement an ETW SDK consumer, GPU telemetry, overlay, process injection, or permission bypass.
