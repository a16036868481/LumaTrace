# Architecture

## Monorepo Structure

```text
apps/
  local-server/
  desktop/
packages/
  core/
  collectors/mock/
  collectors/android/
  collectors/pc/
  storage/
  report/
docs/
scripts/
```

## Package Roles

- `packages/core`: the source of truth for TypeScript models, metric names, units, availability, collector interfaces, stats, command execution primitives, and errors.
- `packages/collectors/mock`: a deterministic collector that emits mock FPS, frame time, CPU, and memory metrics.
- `packages/collectors/android`: non-root Android ADB collector for discovery, package targets, CPU/memory/battery/network, app lifecycle, experimental FPS probe research, and sanitized diagnostics.
- `packages/collectors/pc`: PC Foundation collector for Local PC discovery, Windows process targets, PID-bound CPU/memory sampling, process identity checks, PresentMon detection, and PresentMon CSV parsing.
- `packages/storage`: SQLite database lifecycle, migrations, and repositories.
- `packages/report`: report summary generation and JSON, CSV, HTML export content.
- `apps/local-server`: REST API, WebSocket stream, services, runtime management, packaged sidecar mode, local auth middleware, and process entrypoint.
- `apps/desktop`: React/Vite UI, fetch API client, reconnecting browser WebSocket client, session recovery state, realtime SVG charts, MVP-B pages, and Tauri host scaffold.

## Data Flow

```text
GET /api/devices
  -> DeviceService
  -> CollectorRegistry.discoverAllDevices()
  -> DeviceRepository.upsert()

GET /api/devices/:id/targets
  -> DeviceService
  -> CollectorRegistry.listTargets()
  -> TargetRepository.upsert()

POST /api/sessions
  -> SessionService
  -> SessionRepository.create(status=created)

POST /api/sessions/:id/start
  -> SessionRuntimeManager.startSession()
  -> Collector.startSession()
  -> Collector.streamMetrics()
  -> MetricRingBuffer.push()
  -> WebSocket broadcast
  -> MetricRepository.insertRawBatch()

POST /api/sessions/:id/stop
  -> SessionRuntime.stop()
  -> flush pending metric batch
  -> SessionRepository.updateStatus(stopped)
  -> ReportGenerator.generateFromStorage()
  -> ReportRepository.save()

GET /api/sessions/:id/export
  -> ExportService
  -> ReportGenerator.generateFromStorage()
  -> JSON, CSV, or HTML content

GET /api/sessions/:id/metrics/downsampled
  -> MetricService
  -> MetricRepository.queryRaw()
  -> buildDownsampledMetricBuckets()
  -> bucketed min/max/avg/p50/p95 read model for long-session charts

apps/desktop Test Session page
  -> API client creates and starts a session
  -> reconnecting WebSocket client subscribes to metrics
  -> metric series buffer groups fps/frame_time_ms/cpu_percent/memory_mb
  -> realtime charts render recent mock samples
  -> last session UI state is stored in localStorage

apps/desktop Dashboard history
  -> GET /api/sessions?limit=20 when local-server is available
  -> localStorage fallback under lumatrace:session-history
  -> resume or report navigation without starting/stopping collection

Tauri packaged mode
  -> Rust host generates memory-only local auth token
  -> Rust host starts local-server sidecar on 127.0.0.1:0
  -> sidecar reports actual port
  -> desktop API client asks Tauri for base URL and token
  -> REST uses Authorization: Bearer token
  -> WebSocket uses local auth subprotocol
  -> app exit requests sidecar shutdown
```

## SessionRuntime Lifecycle

`SessionRuntime` owns one session. It starts the collector, reads metric events, pushes them to the ring buffer, broadcasts to subscribers, and batch writes raw metrics. It flushes on stop. A single metric write or client send failure must not crash the server.

## MetricRingBuffer

The ring buffer stores the most recent metrics per session in memory. It is used for realtime clients that connect after a session has already started. It is not the source of truth; SQLite raw metrics are.

Longer session history is read from SQLite. The `/api/sessions/:id/metrics/downsampled` endpoint groups raw numeric metric values into fixed-size buckets for visualization; it skips `null` values instead of converting unavailable samples to zero, and it marks mixed-source buckets honestly.

The desktop report page keeps a small raw metric preview for source/precision notices, and switches the timeline range to downsampled buckets when a report contains more than 500 raw metric rows. These buckets are display previews only; reports and exports continue to preserve raw metric events separately.

## CollectorRegistry

`CollectorRegistry` maps devices to collectors and hides collector-specific details from routes. Current local-server registration includes MockCollector, AndroidCollector when available, and PcCollector when available. Future macOS/Linux collectors will implement the same `MetricCollector` interface.

## Why Mock First

MockCollector makes the backend testable without hardware, platform tools, permissions, or unstable OS differences. It lets the project validate API contracts, storage, streaming, and reporting before real collectors add platform risk.

## Future Collector Integration

Future collectors should:

- Implement `MetricCollector`.
- Return honest `MetricAvailability`.
- Emit only unified `MetricEvent`.
- Mark unavailable or experimental metrics explicitly.
- Never require root, jailbreak, private APIs, or permission bypass as the default path.

## MVP-B UI Runtime Notes

The desktop UI is still a browser/Vite app, not a Tauri package. It connects to local-server over REST and WebSocket. The client stores the last session id, selected device/target, profile, sample interval, last known status, and recent session display history in localStorage so a refresh can restore the operator context. It does not store tokens, credentials, logs, or raw device secrets.

Realtime charts are intentionally frontend-local buffers. They do not replace SQLite raw metrics, and clearing or pausing chart rendering does not stop the backend session. If WebSocket disconnects, the UI shows the connection state and retries with bounded exponential backoff.

## Tauri Packaging Notes

Milestone 4A keeps the web UI intact and adds a Tauri v2 host. Packaged local-server mode is localhost-only and requires a Bearer token. The token is not stored in `VITE_`, localStorage, URL query strings, logs, reports, or diagnostics. App data moves to AppLocalData and logs move to AppLog.

Milestone 4B hardens this architecture with Rust/Tauri toolchain detection, sidecar artifact manifests, target-triple naming, log rotation metadata, and sanitized packaging diagnostics export. Packaging diagnostics export is JSON and omits raw logs, raw CSV, logcat, bugreport data, command lines, full local paths, tokens, and stack traces. The current Windows sidecar draft is self-contained for local QA and still has `productionReady: false`; updater, code signing, notarization, store distribution, and release approval remain future work.
