# iOS Real Device Checklist

This checklist is for manual iOS Beta validation on macOS. It is not required for automated tests.

## Preparation

- Use macOS with Xcode or Xcode Command Line Tools installed.
- Run `xcrun --version`.
- Run `xcrun xctrace list devices`.
- Connect and trust the iOS device, or boot a simulator.
- Confirm the target app is installed.
- Confirm LumaTrace local-server and desktop UI start normally.

## Discovery

- Open Tools / Diagnostics and confirm `xcrun` status is visible.
- Refresh devices and confirm iOS devices or simulators appear when Xcode tooling is available.
- Confirm UDIDs are masked, not shown in full.
- For simulators, open Device Detail and confirm app targets appear when `simctl listapps` succeeds.
- On non-macOS hosts, confirm iOS discovery is shown as `requires_xcode` and does not break Mock, Android, or PC flows.

## Availability

- Confirm iOS CPU, memory, FPS, and frame time availability is `requires_manual_trace`.
- Confirm iOS target network metrics are `unavailable`.
- Confirm missing iOS metrics display as `N/A`, not `0`.
- Confirm starting a normal live iOS metric session fails with a clear manual-trace requirement.

## Manual Xctrace CSV Import

- Export a CSV through an explicit user-driven xctrace/Instruments workflow.
- Create or select an iOS session in LumaTrace.
- Paste the CSV into the iOS Trace Import panel.
- Provide a bundle id, pid, or process name for target matching.
- Confirm successful imports show raw row count, matched row count, metric count, match status, and confidence.
- Confirm no-match or ambiguous imports produce no metrics.
- Confirm average FPS is not used to fabricate `frame_time_ms`.
- Confirm raw CSV content is not shown in diagnostics or reports.

## Automatic Xctrace Capture

- On macOS, confirm `xcrun` is available and an iOS device or simulator is visible.
- Create or select an iOS session and target.
- Trigger the explicit automatic xctrace capture action/API.
- Confirm capture records a `.trace` and exports a table of contents.
- If no metric export XPath is configured, confirm the result is `trace_recorded` and iOS metrics remain `N/A`.
- If a compatible XPath export is configured, confirm metrics appear only when bundle id, pid, or process-name matching succeeds.
- Confirm no-match, ambiguous, timeout, abort, missing `xcrun`, or empty export emits no FPS or frame-time metrics.
- Confirm raw trace data, raw CSV, full UDID, local paths, command lines, tokens, and stack traces are not shown in diagnostics or reports.

## Report

- Generate a report after importing target-matched trace rows.
- Confirm imported metrics show source `ios:xctrace-csv-import`.
- Confirm imported metrics are marked manual trace and experimental.
- Confirm missing iOS values remain `N/A`.
- Confirm diagnostics are sanitized.

## Privacy And Safety

- No private APIs.
- No jailbreak path.
- No permission bypass.
- No syslog, app logs, crash logs, or device logs by default.
- No default automatic xctrace recording; automatic capture is explicit and macOS/Xcode-only.
- No full UDID in UI, reports, or diagnostics.
- No raw CSV in diagnostics or reports.
- No tokens, emails, full local paths, command lines, or stack traces in exported diagnostics.
