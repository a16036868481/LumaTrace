# Windows Real Device Checklist

Use this checklist for manual PC Beta validation on Windows 10 or Windows 11.

## Preparation

- Install Node.js and pnpm.
- Install PresentMon or set `LUMATRACE_PRESENTMON_PATH`.
- Optionally add the test user to Windows Windows log access group when PresentMon visibility is limited.
- Start a target app or game manually.
- Start `pnpm dev:server` and `pnpm dev:desktop`.

## Basic PC Sampling

- Local PC appears on Dashboard and Device Detail.
- Process list appears and can be filtered.
- Select a process target.
- Start a session.
- CPU appears after the second sample because the first sample is baseline only.
- Memory appears when Windows process memory fields are available.
- Stop the session and generate a report.

## PresentMon Missing

- PresentMon missing status is visible when the tool is unavailable.
- CPU and memory still work.
- FPS and frame time remain `N/A`.

## PresentMon Capture

- Enable PresentMon capture explicitly.
- Use a 10 second duration.
- Prefer target mode `PID`.
- Start the session.
- Capture status progresses through planning, capturing, parsing, matching, and completed or no-data states.
- FPS and frame time appear only when target matching succeeds.
- No-data reasons are visible when rows are missing, unmatched, ambiguous, permission-limited, failed, or aborted.
- Report includes the PresentMon section.

## Permission Checks

- Run as a standard user.
- Confirm permission hints are visible when PresentMon output indicates limited visibility.
- Confirm Windows log access group guidance is visible.
- Confirm the app does not claim administrator bypass.

## Process Edge Cases

- Close the target during capture.
- Confirm process exited diagnostics are visible.
- If PID reuse is simulated or observed, confirm PID reused diagnostics are visible.
- Confirm no fake FPS is emitted.
- Confirm CPU and memory do not continue as fake zeros after process exit.

## Privacy

- Full local paths are not shown.
- Raw CSV content is not included in reports.
- Command lines are not shown.
- Diagnostics export is sanitized.
