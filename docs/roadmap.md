# Roadmap

## Milestone 1A: Backend MVP

Status: complete.

Goal: build a local backend loop using mock data: core models, stats, mock collector, SQLite storage, reports, Fastify REST API, WebSocket stream, docs, smoke script, and acceptance checks.

Boundary: no desktop UI, no Tauri packaging, and no real Android or PC collection.

## Milestone 1B: Desktop UI

Goal: build the first React/Vite desktop web UI against local-server: dashboard, device detail, test session, realtime charts, markers, report view, export buttons, WebSocket reconnect, and session recovery.

Status: complete for MVP scope. The UI batches provide the Vite app, API client, WebSocket client, session history, realtime mock-metric charts, last-session restore, report details, browser smoke screenshots, and export controls.

Boundary: still use MockCollector only; do not start real platform collection in this milestone.

## Milestone 2: Android Beta

Goal: add non-root Android ADB discovery and basic real metrics where public tools allow it.

Status: Android Beta complete for the current scope. ADB tool detection, Android device discovery, getprop parsing, package listing, PID parsing, package UID parsing, basic CPU/memory/battery sampling, basic network sampling, FPS/frame-time pre-research parsers/probe paths, explicit app start/force-stop, PID wait, process rebind, diagnostics timeline, sanitized diagnostics export, launcher/device metadata cache, real-device checklist docs, and long-session fake stability tests are implemented.

Boundary: no root, no logcat by default, no default app launch, and no default force-stop. Lifecycle operations are explicit or config gated. Network falls back to `device_level` when UID-level stats are unavailable. FPS remains experimental and off by default; layer matching failure or ambiguity produces no FPS metric. Unavailable metrics are displayed honestly.

## Milestone 3: PC Foundation

Goal: add Windows/macOS process foundations.

Status: PC Beta is complete for the current scope. Windows local process discovery, PID-bound CPU/memory sampling, process exit/PID reuse detection, PresentMon tool detection, explicit PresentMon timed CSV capture, target matching, experimental FPS/frame-time MetricEvents, capture status, compatibility planning, CSV retention, permission diagnostics, sanitized report sections, and real Windows checklist docs are implemented. ETW SDK consumption, GPU telemetry, overlay, and macOS/Linux collectors remain future milestones.

Boundary: do not promise generic macOS FPS.

## Milestone 4: Production Hardening

Goal: Tauri sidecar packaging, localhost token auth, crash recovery, long-session downsampling, diagnostics export, license checker, privacy sanitizer tests, installer docs, richer reports, and e2e coverage.

Status: Milestone 4A adds the Tauri packaging foundation: `src-tauri` scaffold, local-server packaged sidecar mode, localhost-only binding, memory-only local auth token, sidecar status UI, AppLocalData/AppLog path planning, sidecar smoke, and verification docs.

Milestone 4B adds packaging hardening in small batches: Rust/Tauri toolchain detection, sidecar manifest validation, target-triple artifact naming, self-contained sidecar pipeline draft, log rotation metadata, sanitized packaging diagnostics export, sidecar crash recovery with restart cooldown/restart limit, packaged storage restart smoke, Tauri sidecar auth transport smoke, Windows installer draft, Windows packaging smoke suite, Windows manual GUI packaging checklist, macOS bundle/signing draft, and packaging QA checklist. The current Windows sidecar draft is self-contained for local QA and keeps `productionReady: false` until signing, installer QA, license review, updater policy, and release approval are complete.

Boundary: no bundled binaries with unclear licenses, no arbitrary shell permission, no updater/code signing/notarization/store release in 4B, no new metrics, and no cloud upload by default.
