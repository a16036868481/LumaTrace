# iOS Beta

Milestone 5A/5B/5C is an iOS Beta foundation for discovery, explicit manual trace import, and explicit macOS/Xcode `xcrun xctrace` capture. It is not stable live iOS metric collection.

## Current Scope

- Detect Xcode command line tooling through public `xcrun`.
- Discover physical devices and simulators through `xcrun xctrace list devices`.
- List simulator app targets through `xcrun simctl listapps <udid> --json`.
- Hash iOS UDIDs for device IDs and show only masked UDIDs in tags.
- Import a user-provided xctrace CSV into an existing iOS session through `POST /api/sessions/:id/ios/trace-import`.
- Run an explicit automatic xctrace capture through `POST /api/sessions/:id/ios/xctrace-capture` on macOS when `xcrun` is available.
- Record a `.trace`, export a table of contents, and optionally export a configured XPath table for CSV-compatible metric mapping.
- Map target-matched per-row trace data into `fps`, `frame_time_ms`, `cpu_percent`, and `memory_mb` MetricEvents when those columns exist.
- Store metrics, diagnostics, and report summaries only after bundle id, pid, or process-name matching succeeds.
- Keep diagnostics sanitized and exclude raw CSV content from diagnostics and reports.

## Explicit Boundaries

- LumaTrace does not start xctrace recording by default; automatic capture is an explicit API/UI action.
- LumaTrace does not run stable live iOS metric sessions.
- No private APIs.
- No jailbreak paths.
- No permission bypass.
- No syslog, app logs, crash logs, or device logs by default.
- No app launch/stop automation.
- No target process network counters on non-jailbroken iOS.
- No cloud upload.
- No fake zero metrics.
- No `frame_time_ms` derived from average FPS.

## Availability

- `ios.device_discovery`: `available` only on macOS when `xcrun` is available; otherwise `requires_xcode`.
- `ios.simulator_app_list`: same Xcode requirement.
- `ios.xctrace_capture`: `experimental` when macOS/Xcode `xcrun` is available; otherwise `requires_xcode`.
- `cpu_percent`, `memory_mb`, `fps`, and `frame_time_ms`: `requires_manual_trace`.
- iOS target network metrics: `unavailable`.

Unavailable iOS values must display as `N/A`, not `0`.

## Manual Trace Import

Manual import accepts CSV text exported by the user from an external xctrace/Instruments workflow. The importer is intentionally conservative:

- no target match means no metrics;
- ambiguous target match means no metrics;
- missing per-row fields are skipped;
- average FPS columns are ignored for per-frame mapping;
- FPS may be derived only from per-row frame time and is tagged with `derivedFromFrameTime = true`;
- imported metrics use `source = "ios:xctrace-csv-import"`, `precision = "estimated"`, `manualTrace = true`, and `experimental = true`.

## Automatic Xctrace Capture

Automatic capture is intentionally conservative:

- it requires macOS with Xcode command line tools and public `xcrun xctrace`;
- it records only after explicit user/API action;
- it uses argument arrays through `CommandRunner`, never shell string concatenation;
- it exports the trace table of contents first;
- metrics are emitted only when a configured export XPath produces per-row data and target matching succeeds;
- no match, ambiguous match, missing XPath, empty export, timeout, abort, or unsupported tool state emits no iOS metrics;
- raw trace data, raw CSV, full UDID, local paths, command lines, tokens, and stack traces are excluded from diagnostics and reports.

## Privacy

The iOS path redacts bearer tokens, WebSocket auth protocols, user paths, emails, UDIDs, command lines, stack traces, and long diagnostic text. Raw CSV is not written to diagnostics or reports.

## Verification

```bash
pnpm test:ios-collector
pnpm verify:ios-foundation
pnpm verify:ios-trace-import
pnpm verify:ios-beta
```

These checks do not require macOS, Xcode, a real iPhone, or a booted simulator.

## Real-Device Checklist

Use [ios-real-device-checklist.md](ios-real-device-checklist.md) for manual validation on macOS. The checklist is explicit about Xcode requirements, manual export, target matching, `N/A` behavior, and sanitized diagnostics.
