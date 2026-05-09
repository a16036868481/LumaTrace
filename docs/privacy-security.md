# Privacy And Security

## Local First

LumaTrace MVP-A is local-first. It stores data in local SQLite and does not upload metrics, reports, diagnostics, or logs to a cloud service.

## Logs

MVP-A does not collect real logcat or syslog. Future log features must be explicitly enabled and must pass through sanitization before diagnostics or exports.

## Reports

Reports may contain app names, target names, marker labels, tags, metric timestamps, and local file paths if a user supplies them. Share exported JSON, CSV, or HTML only after reviewing the content.

## Sanitization

The core CommandRunner includes log sanitization for:

- token-like values
- email addresses
- user home paths
- local file paths
- device-serial-style strings

Config values with sensitive key names such as token, password, secret, or cookie are redacted by the local-server session service.

## Network Surface

MVP-A local-server is intended for local development. Future sidecar packaging must bind to `127.0.0.1`, generate a one-time auth token, and require desktop API calls to include that token.

## Permissions

LumaTrace does not bypass system permissions. It does not require root or jailbreak by default and does not use private APIs.

## Storage

SQLite is local. Test and smoke paths can use `:memory:` or temporary files. Delete the configured database file to clear local MVP-A data.

## Android Beta Diagnostics

Android Beta diagnostics are sanitized before UI, report, and export display. They do not include logcat or adb bugreport output by default. Full Android serials, local user paths, emails, tokens, cookies, and long raw stdout/stderr are redacted or truncated. Diagnostics keep high-level command names, durations, source/precision notices, fallback reasons, and sampler warnings so users can understand data quality without exposing private logs.

## PC Foundation Diagnostics

PC diagnostics sanitize Windows user paths, executable paths, command lines, email addresses, tokens, long stdout/stderr, and stack traces before UI or report display. Process names and PIDs can be shown for clarity, but full command lines are not shown by default.

Milestone 3B PresentMon capture is explicit and default off. The report includes sanitized capture diagnostics and matched metric metadata, but not raw CSV content or full local output paths. LumaTrace does not inject into processes, read window contents, bypass permissions, implement an ETW SDK consumer, or collect GPU telemetry.

Milestone 3C keeps that boundary and adds explicit CSV retention controls. The default is `delete_after_parse`; retained CSV paths are displayed only in sanitized form. Reports and diagnostics exports do not include raw CSV, full local paths, full command lines, stack traces, tokens, or emails. Permission guidance such as Windows log access group membership is informational only and is not a permission bypass.

## Tauri Sidecar Local Auth

Milestone 4A packaged mode runs local-server as a Tauri-supervised sidecar bound to `127.0.0.1`. Packaged REST/WebSocket calls require a one-time local auth token generated at startup. The token stays in memory, is not written to `VITE_` variables, localStorage, URL query strings, logs, reports, or diagnostics, and is redacted from packaging diagnostics.

Milestone 4B adds sidecar manifest verification, log rotation metadata, sidecar crash recovery status, packaged storage smoke, and sanitized packaging diagnostics export in small batches. Diagnostics export is JSON and may include short sanitized excerpts, sidecar crash state, restart cooldown/limit metadata, and storage migration status, but it must not include raw logs, raw CSV files, Android logcat, bugreport, command lines, full local paths, tokens, emails, Android full serials, or stack traces.

Windows optional tool bootstrap detects and can install ADB and PresentMon through fixed winget package IDs for installer/first-run setup. It does not handle LumaTrace local auth tokens, does not write tokens to logs/reports/diagnostics, and exposes only sanitized path labels in status output. LumaTrace does not bundle unclear-license tool binaries into production artifacts until license review, third-party notices, signing, and release approval are complete.

## iOS Beta Privacy

iOS Beta does not collect syslog, app logs, crash logs, or Instruments traces by default. Device UDIDs are hashed for internal device IDs and masked before UI/report-style display. Simulator app parsing keeps bundle IDs and display names but does not expose full simulator bundle paths. Manual xctrace CSV import must be explicit, target-matched, and sanitized before report or diagnostics export; raw CSV is not written to diagnostics or reports.
