# Development

## Workspace

The workspace is managed by pnpm and Turborepo.

```text
apps/local-server
apps/desktop
packages/core
packages/collectors/mock
packages/collectors/android
packages/collectors/pc
packages/collectors/ios
packages/storage
packages/report
```

## Commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm dev:server
pnpm dev:desktop
pnpm smoke:mvp-a
pnpm verify:mvp-a
pnpm smoke:mvp-b-ui
pnpm smoke:mvp-b-browser
pnpm test:android-collector
pnpm verify:android-beta
pnpm test:pc-collector
pnpm verify:pc-foundation
pnpm verify:presentmon-adapter
pnpm verify:pc-beta
pnpm test:ios-collector
pnpm verify:ios-foundation
pnpm verify:ios-trace-import
pnpm verify:ios-beta
pnpm build:sidecar
pnpm build:self-contained-sidecar
pnpm verify:packaging-notices
pnpm smoke:self-contained-sidecar
pnpm smoke:tauri-release-sidecar
pnpm smoke:tauri-sidecar-auth-transport
pnpm verify:windows-bundle-draft
pnpm verify:windows-installer-draft
pnpm smoke:windows-installer-draft
pnpm smoke:tauri-foundation
pnpm smoke:packaging-diagnostics
pnpm smoke:packaged-storage
pnpm smoke:sidecar-crash-recovery
pnpm verify:tauri-foundation
pnpm verify:sidecar-artifacts
pnpm verify:packaging-hardening
pnpm detect:tauri-toolchain
```

## Run The UI

Start local-server and the Vite UI in separate terminals:

```bash
pnpm dev:server
pnpm dev:desktop
```

The UI defaults to:

- API: `http://127.0.0.1:3100`
- WebSocket: `ws://127.0.0.1:3100`

`VITE_API_BASE_URL` and `VITE_WS_BASE_URL` can override those endpoints. `VITE_` variables are bundled into browser code, so never store secrets, tokens, credentials, or private paths in them.

Realtime metric sessions use MockCollector for demos and AndroidCollector for Milestone 2E CPU/memory/battery/network sampling when a target Android process is running. Android app start/force-stop are explicit lifecycle actions; `autoStartTarget`, `allowMonkeyFallback`, and `stopTargetOnSessionStop` default to `false`. Android FPS is experimental and disabled by default; logcat must not be described as implemented.

MVP-B UI smoke can be run with:

```bash
pnpm smoke:mvp-b-ui
```

It builds `apps/desktop`, starts a temporary in-memory local server, validates the UI-facing API flow, receives WebSocket mock metrics, stops the session, and checks JSON/CSV/HTML export responses.

Browser smoke can be run with:

```bash
pnpm smoke:mvp-b-browser
```

It starts a temporary local-server, builds the UI with local smoke endpoints, runs Vite preview, opens Playwright Chromium or an installed Chromium-based browser, captures screenshots, and closes all processes. It is a rendering smoke test, not a full E2E or visual regression suite.

The Test Session page keeps only non-sensitive last-session UI state in `localStorage` under `lumatrace:last-session`, plus recent session history under `lumatrace:session-history`. WebSocket reconnect is a client transport behavior only; disconnects must not stop the backend session. Realtime charts currently visualize mock metrics from the local-server stream and filter only the frontend buffer.

Run one package:

```bash
pnpm --filter @lumatrace/local-server test
```

## Add A Package

Add the package under `packages/` or `apps/`, give it a package name, add `build`, `test`, `typecheck`, and `lint` scripts, and use workspace dependencies such as `"@lumatrace/core": "workspace:*"`.

## Test With createServer()

Use `createServer({ dbPath: ":memory:", enableLogger: false })` for integration tests. Call `app.close()` in cleanup.

## Add An API

1. Put route logic in `apps/local-server/src/routes`.
2. Put business logic in `services`.
3. Return `{ ok: true, data }` or throw `AppError`.
4. Add tests with Fastify `inject`.
5. Update `docs/api.md` and `docs/openapi.yaml`.

## Add A Collector

1. Implement `MetricCollector`.
2. Emit only unified `MetricEvent`.
3. Declare metric availability honestly.
4. Do not require root, jailbreak, private APIs, or permission bypass.
5. Register through `CollectorRegistry`.

Android 2F closes the Android Beta with sanitized diagnostics timelines, command timeout/retry/abort policy, launcher/device info caches, report diagnostics notices, and fake long-session stability coverage. Network must prefer UID-level data when available and mark `/proc/net/dev` fallback as `device_level`. FPS work must keep `fps` and `frame_time_ms` `experimental`, require target layer matching, skip ambiguous/no-match cases, and never infer per-frame data from average FPS. Lifecycle work must avoid default force-stop or default auto-start, and PID-missing intervals must not emit fake CPU/memory. Android diagnostics exports must not include logcat, bugreport, raw stdout/stderr blocks, full serials, tokens, emails, or local user paths.

PC Beta keeps `packages/collectors/pc` behind adapters and CommandRunner for external commands. Windows process listing and process CPU/memory remain the baseline path. PresentMon capture is explicit, default off, timed CSV-based, and experimental. Capture status, compatibility planning, CSV retention, permission hints, and sanitized report diagnostics are part of the Beta contract. Do not implement ETW SDK capture, GPU telemetry, overlay, process injection, permission bypass, or raw path/CSV exposure. No-match, ambiguous, permission-limited, failed, or aborted PresentMon captures must not emit FPS/frame-time metrics.

iOS Beta keeps `packages/collectors/ios` conservative. It may use public Xcode command line tools (`xcrun`, `xctrace`, `simctl`) for discovery and simulator app target listing, but it must not use private APIs, jailbreak paths, syslog/log collection by default, or permission bypasses. Live iOS sessions remain unavailable. Manual xctrace CSV import is explicit, target-matched, sanitized, and does not start xctrace recording. iOS metrics availability remains `requires_manual_trace` or `unavailable`; missing values must display as `N/A`, not `0`. Tests must use fixtures and must not require a real iOS device or macOS host.

Tauri 4A adds packaging foundation. Tauri 4B adds packaging hardening in small batches: Rust/Tauri toolchain detection, sidecar artifact manifests, packaging notice manifests, unsigned portable bundle draft verification, log rotation, sanitized packaging diagnostics export, sidecar crash recovery status with restart cooldown/restart limit, packaged storage smoke, Windows installer draft docs, and macOS signing draft docs. Keep `pnpm dev:server` and `pnpm dev:desktop` working. Packaged local-server must bind to `127.0.0.1`, require a memory-only local auth token, and use AppLocalData/AppLog paths. Do not put the token in `VITE_`, localStorage, URLs, logs, reports, or diagnostics. Packaging diagnostics export is sanitized JSON; raw logs, raw CSV, logcat, bugreport data, full paths, command lines, and stack traces are omitted or redacted. `pnpm build:self-contained-sidecar` can build the current bundled Node runtime draft and writes `packaging-notices.json` plus `THIRD-PARTY-NOTICES.md`, but the sidecar manifest must keep `productionReady: false` until signing, installer QA, license notice review, and release smoke are complete. `pnpm verify:windows-bundle-draft` writes an unsigned portable release-directory manifest; it does not create a signed installer. `pnpm verify:windows-installer-draft` is an explicit unsigned NSIS QA probe using a temporary config override and must still keep `productionReady: false`. `pnpm smoke:windows-installer-draft` runs a temporary silent install/uninstall cycle and must not write to the desktop or claim release readiness. `pnpm check:tauri`, `pnpm dev:tauri`, and `pnpm build:tauri` require cargo and the Tauri CLI; if cargo is missing, do not claim Rust/Tauri build verification.

For a Windows preview GitHub prerelease, run `pnpm release:windows-preview -- --tag v0.1.0-preview.N --publish` only after reviewing the diff. The command stages an unsigned installer and sanitized manifests, writes bilingual release notes, and keeps `productionReady=false`; `--dry-run` performs the same staging without pushing a tag or GitHub release.

For 4B-4 Rust/Tauri real-machine verification, run `pnpm detect:tauri-toolchain` first. Continue to `pnpm check:tauri`, `pnpm dev:tauri`, and `pnpm build:tauri` only if Rust/Cargo and the Tauri CLI are detected. On Windows, unresolved MSVC Build Tools or WebView2 Runtime issues should be documented as environment blockers rather than hidden by loosening capabilities or auth.

After toolchain setup, `pnpm check:tauri` runs a real Cargo check of `apps/desktop/src-tauri`. `pnpm build:tauri` produces a Windows release executable under `apps/desktop/src-tauri/target/release/`. `pnpm dev:tauri` is a long-running command; automated validation should treat successful launch plus sidecar supervisor startup as the smoke signal, then stop the process tree.

`pnpm dev:tauri` uses a dev-only Tauri config override that clears bundle resources. Keep the release `tauri.conf.json` resources intact, but do not force the self-contained sidecar runtime through the Windows debug resource compiler. Self-contained sidecar builds should materialize deployed workspace files as independent copies rather than hardlinks, otherwise package rebuilds can touch files under `src-tauri/binaries` and trigger dev watcher rebuilds.

Do not run `pnpm check:tauri`, `pnpm build:tauri`, or `pnpm smoke:tauri-release-sidecar` in parallel with `pnpm build:self-contained-sidecar` or `pnpm verify:packaging-notices`. Those scripts rewrite `apps/desktop/src-tauri/binaries`, and Cargo/Tauri enumerates that directory while checking resources.

## Add A Metric

1. Add the metric name and unit in `packages/core`.
2. Add stats helpers if needed.
3. Add storage/report handling only where the value is real and available.
4. Update metric definitions and tests.

## Add A Report Field

1. Add the field to `ReportSummary`.
2. Calculate it through core stats.
3. Update JSON, CSV, HTML behavior if needed.
4. Keep missing values undefined or `N/A`, not fake zero.

## Coding Rules

- Keep TypeScript strict.
- Use pure functions for stats.
- Keep external command calls behind CommandRunner.
- Add tests for parser and report behavior.
- Avoid large dependencies unless they remove real risk.

## AGENTS.md Summary

Do not copy commercial tools. Do not bypass permissions. Do not fake metrics. Mock data must remain clearly marked as mock. Run lint, test, and typecheck after changes.
