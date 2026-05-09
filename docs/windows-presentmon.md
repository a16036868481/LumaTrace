# Windows PresentMon

Milestone 3B adds an explicit PresentMon Console capture adapter for Windows PC process sessions. The simplified Windows test flow now enables an experimental realtime PresentMon loop automatically for the selected process when PresentMon is available; advanced explicit timed CSV capture remains default off and controlled by `enablePresentMonCapture`.

LumaTrace still does not implement an ETW SDK consumer, GPU telemetry, overlay, process injection, or administrator-permission bypass. PresentMon capture remains experimental.

## Detection Order

1. `LUMATRACE_PRESENTMON_PATH`
2. `PATH`
3. Local `tools` directories
4. Common Program Files locations

If PresentMon is missing, `/api/tools/status` reports `missing`, and PC CPU/memory sampling continues.

## Realtime Session Loop

For the simple "Start Test" Windows flow, LumaTrace runs repeated short PresentMon capture windows during the session. Each completed window is parsed, target-matched by PID/process identity, and mapped into `fps` and `frame_time_ms` MetricEvents. This is realtime enough for the live cards and charts, but it is still an experimental PresentMon CSV loop rather than a production ETW SDK consumer.

If PresentMon is missing, permission-limited, returns no data, cannot match the target, or reports ambiguous rows, CPU/memory continue and FPS/frame time remain `N/A`.

## Explicit Timed Capture

When enabled, LumaTrace builds a PresentMon command with argument arrays, not shell strings. The adapter writes a timed capture to a temporary CSV file, reads the CSV after PresentMon exits, parses it, and maps matched rows to `fps` and `frame_time_ms` MetricEvents.

Defaults:

- `enablePresentMonCapture=false`
- `enablePresentMonRealtime=true` in the simplified Windows UI flow
- `presentMonCaptureDurationMs=10000`
- `presentMonRealtimeChunkMs=1000`
- `presentMonTargetMode=pid`
- `keepPresentMonCsv=false`
- `presentMonRetentionMode=delete_after_parse`

The capture duration is capped at 120 seconds. Output paths are treated as local temp paths and are sanitized in diagnostics, UI, and reports. Raw CSV contents are not included in reports by default.

PID matching is preferred. Process-name matching is allowed but lower confidence. If the CSV has no target rows, unknown process rows, or multiple process IDs for the same process name, LumaTrace outputs no FPS or frame-time metrics.

## Capture Status And Cancellation

Milestone 3C exposes PresentMon capture status for UI and diagnostics:

- `idle`
- `tool_missing`
- `planning`
- `starting`
- `capturing`
- `parsing_csv`
- `matching_target`
- `mapping_metrics`
- `completed`
- `no_data`
- `permission_limited`
- `failed`
- `aborted`

Progress is estimated from elapsed time and the configured duration. Session stop aborts a pending capture and records `PRESENTMON_CAPTURE_ABORTED`; it does not emit partial or fake FPS.

## Version Compatibility

LumaTrace checks PresentMon version/help output before planning a capture. Output-file and timed-capture support are required. PID filtering is preferred; if it cannot be confirmed, the planner can fall back to process-name mode and records an ambiguity warning. Unsupported or malformed help output makes capture unavailable instead of guessing.

See `docs/windows-presentmon-compatibility.md` for the compatibility matrix.

## CSV Retention

The default mode is `delete_after_parse`. Users can choose `keep_until_session_end` or `keep_user_requested`. Oversized CSV files are rejected before parsing, and reports show only sanitized paths. Raw CSV content is never written into HTML or JSON reports.

## CSV Parser

The parser accepts CSV text and recognizes common PresentMon columns such as process id, application, `MsBetweenPresents`, `FPS-Presents`, `FPS-Display`, CPU frame time, GPU duration, and latency fields when present.

The parser:

- returns warnings for malformed rows;
- leaves missing fields undefined;
- does not fabricate FPS;
- does not fabricate `frame_time_ms` from average FPS;
- does not assign CSV rows to a target unless PID or process identity is matched.

If `MsBetweenPresents` or an equivalent per-frame column is present, it can become `frame_time_ms`. If an explicit FPS column is present, it can become `fps`; otherwise instantaneous FPS may be derived from per-frame time with `derivedFromFrameTime=true`. Missing fields remain undefined and display as `N/A`.

## Permissions And Limitations

PresentMon may have limited visibility for processes from other users, short-lived processes, protected applications, or environments where ETW provider access is restricted. LumaTrace reports this as diagnostics such as `PRESENTMON_PERMISSION_LIMITED`, `PRESENTMON_LOG_ACCESS_USERS_HINT`, `PRESENTMON_ADMIN_HINT`, `PRESENTMON_TARGET_NO_MATCH`, or `PRESENTMON_TARGET_AMBIGUOUS`. Capture failure never blocks Windows CPU/memory sampling.

## Future Work

Future PC batches can improve capture scheduling and explore richer PresentMon integrations, but this milestone does not claim ETW SDK support, GPU telemetry, or stable production FPS coverage.
