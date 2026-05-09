# PC Diagnostics

PC diagnostics are designed to explain data quality without exposing local private data.

## Diagnostic Scope

- Process list failures.
- Process not found, process exited, and PID reuse.
- CPU baseline and CPU/memory sample failures.
- PresentMon missing, unsupported, permission limited, capture planned, progress, completed, failed, aborted, no data, CSV retained/deleted, target no-match, target ambiguous, process exited during capture, PID reused during capture, and metric mapping.

## Sanitization

Diagnostics do not include raw CSV content, full local paths, full command lines, stack traces, tokens, emails, or long raw stdout/stderr. Sanitized excerpts can keep high-level tool names, exit codes, durations, and user-facing reasons.

## Report Behavior

HTML and JSON reports include sanitized PC diagnostics, PresentMon status, compatibility, CSV retention summary, permission notices, no-data reasons, and source/precision/confidence notices. Missing FPS and frame time remain `N/A`.
