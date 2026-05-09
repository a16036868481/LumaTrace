# PC Beta

Milestone 3C closes the PC + PresentMon Beta scope. The current Windows path supports Local PC discovery, process targets, PID-bound CPU and memory sampling, explicit PresentMon CSV capture, sanitized diagnostics, and report sections for PresentMon capture status.

## Current Capabilities

- Local PC device discovery.
- Windows process target listing.
- `cpu_percent` and `memory_mb` for an already-running process.
- PresentMon tool detection and version/help compatibility checks.
- Experimental realtime PresentMon loop for `fps` and `frame_time_ms` in the simplified Windows test flow.
- Explicit PresentMon timed CSV capture remains available for advanced/session config paths.
- Capture status, cancellation, no-data reasons, permission hints, and sanitized diagnostics.
- PC report diagnostics, source/precision/confidence notices, and PresentMon capture metadata.

## Defaults And Boundaries

- Advanced timed PresentMon capture is default off.
- The simplified Windows flow automatically attempts realtime PresentMon capture for the selected process when PresentMon is available.
- FPS and frame time remain experimental.
- No FPS is emitted for missing, no-match, ambiguous, permission-limited, failed, or aborted captures.
- CPU and memory continue when PresentMon is missing or capture fails.
- LumaTrace does not implement an ETW SDK consumer, PresentMon Service API, GPU telemetry, overlay, process injection, or permission bypass.
- LumaTrace does not start or kill Windows processes in this milestone.
- Missing metrics stay `N/A`; they are never replaced with `0`.

## CSV Retention

The default retention mode is `delete_after_parse`. Users can opt into `keep_until_session_end` or `keep_user_requested` for local debugging. Reports never include raw CSV content, full local output paths, full command lines, or stack traces. CSV files larger than the configured safety limit are rejected and recorded as diagnostics.

## Permissions

PresentMon may report limited data for cross-user, protected, or short-lived processes. The UI and diagnostics surface Windows log access group hints and normal administrator/elevation hints when PresentMon output suggests them. LumaTrace never bypasses Windows permissions.

## Diagnostics

PC Beta diagnostics include tool missing, compatibility unsupported, capture planned, capture progress, capture completed, no data, permission limited, CSV retained/deleted, process exited during capture, PID reused during capture, target no-match, target ambiguous, and metric mapped events. Diagnostics are sanitized before UI, report, or export display.
