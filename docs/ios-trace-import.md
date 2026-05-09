# iOS Trace Import

Milestone 5B adds a manual xctrace CSV import foundation. It is not live iOS collection.

## Scope

- Parses exported CSV text from an explicit user-provided xctrace/Instruments workflow.
- Maps matched rows into `fps`, `frame_time_ms`, `cpu_percent`, and `memory_mb` `MetricEvent` records when per-row columns exist.
- Requires target matching by bundle identifier, pid, or process name.
- Marks metrics with `source = ios:xctrace-csv-import`, `precision = estimated`, `manualTrace = true`, and `experimental = true`.
- Sanitizes diagnostics before they can be shown or exported.
- Provides `POST /api/sessions/:id/ios/trace-import` for importing into an existing iOS session.
- The desktop Test Session page shows a minimal iOS Trace Import panel for iOS targets.

Milestone 5C adds a separate explicit automatic capture route. This manual import route still does not start xctrace recording; it only parses user-provided CSV text.

## Safety Boundaries

- LumaTrace does not start xctrace recording in this batch.
- LumaTrace does not collect syslog or private logs.
- LumaTrace does not use private APIs, jailbreaks, or permission bypasses.
- LumaTrace does not infer target metrics from unknown processes.
- If target matching fails or is ambiguous, no metrics are emitted.
- LumaTrace does not derive frame_time_ms from average FPS.
- FPS may be derived only from per-row frame time, and such events are tagged with `derivedFromFrameTime = true`.
- Missing fields are skipped, not filled with `0`.

## Supported CSV Columns

The parser accepts common exported column names, including:

- `Time (s)`, `Timestamp (ms)`, or similar timestamp columns.
- `Process`, `Process Name`, or `Application`.
- `Bundle Identifier` or `Bundle ID`.
- `PID` or `Process ID`.
- `FPS` or `Frames Per Second`.
- `Frame Time (ms)` or `Frame Duration (ms)`.
- `CPU %` or `CPU Usage %`.
- `Memory (MB)` or similar memory columns.

Average or aggregate FPS columns are ignored for per-row mapping. This prevents fabricated frame-time timelines.

## Privacy

Diagnostics are sanitized before export:

- bearer tokens and WebSocket auth protocols are redacted;
- local user paths are replaced with `<user-path>`;
- iOS UDIDs are replaced with `<ios-udid>`;
- email addresses are replaced with `<email>`;
- raw CSV, command lines, and stack traces are removed or truncated.

## Testing

The trace import tests use fixtures only and do not require macOS, Xcode, a real iPhone, or a simulator:

```bash
pnpm test:ios-collector
pnpm verify:ios-trace-import
```
