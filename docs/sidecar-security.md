# Sidecar Security

The packaged local-server sidecar is local-only.

## Network Binding

Packaged mode must listen on `127.0.0.1`. `0.0.0.0` is rejected. Port `0` is preferred so the operating system chooses an available local port.

## Auth

All packaged `/api/*` REST routes except minimal health require `Authorization: Bearer <token>`. WebSocket streams require the same token through the `Sec-WebSocket-Protocol` header. Invalid or missing tokens return `401 AUTH_REQUIRED` or `401 AUTH_INVALID`, or close the WebSocket with the auth error reason.

The Tauri supervisor passes the token to the sidecar through `LUMATRACE_AUTH_TOKEN`; it is not placed in sidecar launch arguments, `VITE_` variables, localStorage, URLs, logs, reports, or diagnostics exports.

`pnpm smoke:tauri-sidecar-auth-transport` is the Windows real-machine guard for this behavior. It launches the Tauri dev app long enough to observe the desktop and sidecar processes, confirms the sidecar command line does not contain `--auth-token`, bearer tokens, or `lumatrace-auth.*`, verifies the sidecar is bound to `127.0.0.1`, and then shuts the process tree down.

## Permissions

Tauri capabilities are intentionally minimal. The frontend is not granted arbitrary shell execution, arbitrary filesystem access, or arbitrary binary paths. The Rust side starts only the configured local-server sidecar and exposes typed commands for status, restart, logs, reports, token retrieval, and diagnostics.

## Artifact Manifest

Milestone 4B sidecar artifacts are described by `sidecar-manifest.json`. The manifest records artifact kind, target triple, file name, SHA-256 hash, size, Node requirement, limitations, and production readiness. A `dev-wrapper` artifact must keep `productionReady: false`.

Self-contained draft artifacts also record `packaging-notices.json` and `THIRD-PARTY-NOTICES.md` hashes. These notice files list bundled runtime/dependency metadata for review and must not include auth tokens, raw logs, command lines, raw CSV paths, or full local paths. Their `licenseReviewStatus` remains `draft_requires_review` until release review is complete.

## Shutdown

Tauri shutdown requests graceful local-server shutdown first. The sidecar flushes sessions through normal server close behavior. If the supervised process does not exit in a future production supervisor, it may be killed after a timeout and recorded as diagnostics.

## Logging

Sidecar logs are separate from app logs. Logs and diagnostics must redact tokens, full user paths, device serials, command lines, and long stdout/stderr excerpts.

Log rotation defaults to 10 MB per file and 5 retained files. Reports and diagnostics exports do not embed raw logs. Packaging diagnostics may include sanitized excerpts only.

## Crash Recovery

Sidecar crashes are tracked through a bounded recovery state machine. States include `starting`, `running`, `stopping`, `stopped`, `crashed`, `restart_limited`, `auth_failed`, `port_conflict`, `db_migration_failed`, and `shutdown_requested`.

Restart uses a cooldown and restart limit, so the app does not retry forever. Crash evidence is reduced to sanitized excerpts and must not include auth tokens, full local paths, raw stdout/stderr blocks, command lines, or stack traces. Normal graceful shutdown is not marked as a crash.
