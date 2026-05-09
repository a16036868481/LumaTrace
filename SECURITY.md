# Security Policy

LumaTrace is local-first and should not upload device metrics, logs, reports,
or diagnostics to cloud services by default.

## Reporting a Vulnerability

Please open a GitHub security advisory or contact the maintainers privately
if the repository has private reporting enabled. If private reporting is not
available yet, open an issue with a high-level description only and avoid
posting secrets, tokens, crash dumps, raw logs, device serial numbers, or
private paths.

## Sensitive Data Rules

- Do not commit auth tokens, cookies, passwords, private keys, certificates, or signing keys.
- Do not commit raw device logs, logcat/syslog dumps, bugreports, or raw PresentMon CSV files.
- Do not commit local SQLite databases, generated reports, app data, or desktop logs.
- Diagnostics and exports should sanitize full local paths, serial numbers, emails, tokens, command lines, and long stdout/stderr.

## Supported Versions

The project is still pre-1.0. Security fixes are handled on the default branch.

