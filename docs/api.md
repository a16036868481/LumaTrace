# Local Server API

Base URL: `http://127.0.0.1:3100`

All REST success responses:

```json
{
  "ok": true,
  "data": {}
}
```

All REST error responses:

```json
{
  "ok": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session not found",
    "details": {}
  }
}
```

Stack traces are not returned to clients.

## GET /api/health

Returns server status, version, and uptime. In packaged mode this route remains minimal and unauthenticated.

```bash
curl http://127.0.0.1:3100/api/health
```

Response:

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "version": "mvp-a",
    "uptimeMs": 1000
  }
}
```

## GET /api/devices

Discovers mock devices, Android adb devices when available, and the Local PC device. Devices are stored locally.

```bash
curl http://127.0.0.1:3100/api/devices
```

Response data: `Device[]`.

## GET /api/devices/:id/targets

Lists targets for a device and stores them locally. Android targets are packages. Windows PC targets are already-running processes and include PID/runtime metadata when available.

```bash
curl http://127.0.0.1:3100/api/devices/mock-local-device-1/targets
```

Response data: `Target[]`.

Errors: `DEVICE_NOT_FOUND`.

## GET /api/capabilities

Query params:

- `platform`: optional `android`, `windows`, `macos`, or `linux`.

```bash
curl "http://127.0.0.1:3100/api/capabilities?platform=windows"
```

Response data: `MetricAvailability[]`. Android returns availability for adb discovery, device info, package listing, PID helpers, CPU/memory/battery sampling, network sampling, and Milestone 2D experimental FPS/frame-time probe paths. Android network prefers UID-level `dumpsys netstats detail` and can fall back to `/proc/net/dev` with `device_level` precision. Android FPS and frame time remain `experimental`; layer matching failure or ambiguity produces no FPS metrics.

Windows returns PC Foundation availability for local device discovery, process listing, process CPU/memory sampling, and explicit PresentMon-dependent FPS/frame-time capture. PresentMon missing is reported as `requires_tool` and does not block CPU/memory.

## POST /api/sessions

Creates a session but does not start collection.

Request body:

```json
{
  "name": "Test Session",
  "deviceId": "mock-local-device-1",
  "targetId": "mock-game",
  "sampleIntervalMs": 100,
  "config": {
    "profileName": "janky_game",
    "enableExperimentalFps": false,
    "autoStartTarget": false,
    "allowMonkeyFallback": false,
    "stopTargetOnSessionStop": false,
    "processMissingPolicy": "pause_process_metrics_keep_device_metrics"
  }
}
```

```bash
curl -X POST http://127.0.0.1:3100/api/sessions \
  -H "content-type: application/json" \
  -d "{\"name\":\"Test Session\",\"deviceId\":\"mock-local-device-1\",\"targetId\":\"mock-game\",\"sampleIntervalMs\":100,\"config\":{\"profileName\":\"janky_game\",\"enableExperimentalFps\":false}}"
```

Response data: `Session` with `status: "created"`.

For Android sessions, lifecycle options are explicit and default to safe values:

- `autoStartTarget`: default `false`; when `true`, start tries `am start -W` before sampling if PID is missing.
- `allowMonkeyFallback`: default `false`; when `true`, launch fallback is limited to `monkey -p <package> 1`.
- `stopTargetOnSessionStop`: default `false`; session stop does not force-stop unless this is set.
- `launcherComponent`: optional explicit launcher component.
- `processMissingPolicy`: `pause_process_metrics_keep_device_metrics`, `wait_for_rebind`, or `fail_session`.

For Windows PC sessions, the target must be an existing process target. The local-server does not start or stop PC processes. CPU needs a baseline sample before emitting `cpu_percent`; FPS and frame time remain N/A unless explicit PresentMon capture is enabled and target matching succeeds.

- `enablePresentMonCapture`: default `false`; runs explicit PresentMon timed CSV capture for PC process sessions.
- `presentMonCaptureDurationMs`: default `10000`, capped at `120000`.
- `presentMonTargetMode`: `pid` or `process_name`; PID matching is preferred.
- `keepPresentMonCsv`: default `false`; raw CSV is not included in reports by default.
- `presentMonRetentionMode`: `delete_after_parse`, `keep_until_session_end`, or `keep_user_requested`; default `delete_after_parse`.
- `presentMonGracePeriodMs`: optional stop grace period after the timed capture duration.
- PresentMon missing, permission-limited capture, no target rows, or ambiguous process matches do not block CPU/memory and do not emit FPS.

- `enableExperimentalFps`: default `false`; runs the stop-time experimental FPS probe when enabled.

Probe failure, missing target layers, ambiguous layer matches, or missing PID must not fabricate metrics.

## POST /api/android/:deviceId/apps/:packageName/start

Starts an Android app as an explicit user action. It does not start a metric session.

Request body:

```json
{
  "launcherComponent": "com.example/.MainActivity",
  "allowMonkeyFallback": false,
  "waitForPid": true
}
```

```bash
curl -X POST http://127.0.0.1:3100/api/android/android%3Adevice/apps/com.example.app/start \
  -H "content-type: application/json" \
  -d "{\"allowMonkeyFallback\":false,\"waitForPid\":true}"
```

Response data: Android app start result with `ok`, `method`, optional `pid`, `durationMs`, `warnings`, and `diagnostics`.

Errors: `DEVICE_NOT_FOUND`, `INVALID_REQUEST`, `TOOL_UNAVAILABLE`.

## POST /api/android/:deviceId/apps/:packageName/stop

Force-stops an Android app as an explicit user action. It does not delete sessions or stored metrics.

Request body:

```json
{
  "waitUntilStopped": true
}
```

```bash
curl -X POST http://127.0.0.1:3100/api/android/android%3Adevice/apps/com.example.app/stop \
  -H "content-type: application/json" \
  -d "{\"waitUntilStopped\":true}"
```

Response data: Android app stop result with `ok`, `method`, `durationMs`, optional `stopped`, `warnings`, and `diagnostics`.

Errors: `DEVICE_NOT_FOUND`, `INVALID_REQUEST`, `TOOL_UNAVAILABLE`.

Errors: `INVALID_REQUEST`, `DEVICE_NOT_FOUND`, `TARGET_NOT_FOUND`.

## GET /api/pc/:deviceId/presentmon/status

Returns PresentMon tool status plus version/help compatibility for a Local PC device. Full local paths are sanitized.

```bash
curl http://127.0.0.1:3100/api/pc/pc-local%3Awindows/presentmon/status
```

Response data:

```json
{
  "toolStatus": {
    "toolName": "PresentMon",
    "status": "missing",
    "suggestedAction": "Install PresentMon or set LUMATRACE_PRESENTMON_PATH."
  },
  "compatibility": null,
  "limitations": [
    "PresentMon capture is explicit and experimental.",
    "CPU and memory continue when PresentMon is missing."
  ]
}
```

## GET /api/sessions/:id/presentmon/status

Returns the current or last PresentMon capture status for a PC session.

```bash
curl http://127.0.0.1:3100/api/sessions/session_x/presentmon/status
```

Response data:

```json
{
  "status": "idle",
  "updatedAt": 1730000000000,
  "warnings": [],
  "diagnostics": []
}
```

Status values include `idle`, `tool_missing`, `planning`, `starting`, `capturing`, `parsing_csv`, `matching_target`, `mapping_metrics`, `completed`, `no_data`, `permission_limited`, `failed`, and `aborted`.

## GET /api/sessions

Lists recent stored sessions. This read-only API is used by the MVP-B UI session history.

Query params:

- `limit`: optional, default UI usage is 20.

```bash
curl "http://127.0.0.1:3100/api/sessions?limit=20"
```

Response data: `Session[]`.

## GET /api/sessions/:id

Reads a stored session without starting collection.

```bash
curl http://127.0.0.1:3100/api/sessions/session_x
```

Response data: `Session`.

Errors: `SESSION_NOT_FOUND`.

## POST /api/sessions/:id/start

Starts collection for an existing session.

```bash
curl -X POST http://127.0.0.1:3100/api/sessions/session_x/start
```

Response data: `Session` with `status: "running"`.

Errors: `SESSION_NOT_FOUND`, `SESSION_ALREADY_RUNNING`.

## POST /api/sessions/:id/pause

Pauses a running session.

```bash
curl -X POST http://127.0.0.1:3100/api/sessions/session_x/pause
```

Response data: `Session` with `status: "paused"`.

Errors: `SESSION_NOT_FOUND`, `SESSION_NOT_RUNNING`.

## POST /api/sessions/:id/stop

Stops a session, flushes pending metrics, and creates report cache.

```bash
curl -X POST http://127.0.0.1:3100/api/sessions/session_x/stop
```

Response data: `Session` with `status: "stopped"`.

Errors: `SESSION_NOT_FOUND`.

## GET /api/packaged/status

Returns packaged-mode status. In packaged mode this route requires `Authorization: Bearer <token>`.

```bash
curl http://127.0.0.1:3100/api/packaged/status \
  -H "authorization: Bearer <token>"
```

Response data includes `packaged`, `host`, `port`, `artifactKind`, sanitized `dataDir`, sanitized `logsDir`, sanitized `dbPath`, `authRequired`, optional `sidecarPid`, and `uptimeMs`. Milestone 4B also adds sanitized sidecar manifest metadata, release-readiness gate summary, Windows release policy template summary, Windows manual GUI QA handoff summary, Windows release gate results intake summary, Windows packaging RC gate summary, sidecar crash state, packaged storage status, log rotation metadata, runtime uptime, diagnostics export availability, sanitizer status, and production limitation flags. The auth token is never returned.

`windowsRcStatus` is a sanitized release-candidate planning summary. It folds sidecar manifest readiness, release-readiness evidence, release policy blockers, Windows RC gate outcomes, and manual GUI QA result status into one view with gate counts, blocker codes, and next actions. It is not release approval and keeps `productionReady: false`.

For self-contained sidecar draft builds, `sidecarManifest` can also include `noticesFile`, `noticesSha256`, `thirdPartyNoticesFile`, `thirdPartyNoticesSha256`, and `licenseReviewStatus`. These fields are release review metadata only; notice generation does not make the build production-ready.

When `lumatrace-windows-packaging-release-readiness.json` is available, `releaseReadiness` contains sanitized readiness status, QA draft status, blocker codes, and production gate booleans. It does not include tokens, local paths, raw logs, command lines, stack traces, reviewer notes, or release approval.

When `lumatrace-windows-packaging-rc-gate.json` is available, `rcGate` contains the sanitized release-candidate gate status, gate outcomes, blocker codes, and production booleans. Current unsigned draft builds remain `status: "blocked"`, `rcCandidateReady: false`, and `productionReady: false` until manual GUI QA, sidecar production readiness, license notice review, code signing, updater policy, and release approval are complete.

When `lumatrace-windows-release-policy-template.json` is available, `releasePolicy` contains the sanitized draft policy status for code signing, updater policy, license review, and release approval. It is expected to remain `status: "draft_blocked"` and `productionReady: false` until real production policy evidence is reviewed and approved.

When `lumatrace-windows-manual-gui-qa-handoff-manifest.json` is available, `manualGuiQaHandoff` contains the sanitized reviewer handoff status, file count, excluded-file list, and security assertion booleans. It is expected to remain `manualGuiQaStatus: "not_run"` and `productionReady: false`; it does not include a completed manual result, reviewer notes, raw logs, tokens, or full local paths.

When `lumatrace-windows-manual-gui-qa-result.json` is available, `manualGuiQaResult` contains only a sanitized result summary: validation status, overall status, reviewer-field presence booleans, step counts, source checklist metadata, and security assertion booleans. It does not include reviewer names, reviewer notes, evidence notes, raw logs, command lines, tokens, stack traces, or full local paths. A valid passed result is still QA evidence only; code signing, updater policy, license review, and release approval remain separate gates.

When `lumatrace-windows-release-gate-results-intake.json` is available, `releaseGateResults` contains the sanitized release gate result intake: per-gate result status, blocker code, stable file names, verifier command names, hashes/sizes for present result files, and count summaries. It does not include verifier stdout/stderr, reviewer notes, evidence notes, raw logs, command lines, tokens, stack traces, or full local paths. Valid entries only indicate which blocker can be removed after the RC gate is refreshed; they are not release approval.

When `lumatrace-windows-release-gate-results-import-manifest.json` is available, `releaseGateResultsImport` contains the sanitized release gate result import summary: import status, source directory kind, valid/invalid/missing/copied counts, refreshed intake counts, stable result file names, and verifier exit codes. It does not include the source directory path, verifier stdout/stderr, reviewer notes, evidence notes, raw logs, command lines, tokens, stack traces, or full local paths. Imported valid results still only refresh gate evidence; they are not release approval.

When `lumatrace-windows-release-gate-results-suite-smoke-manifest.json` is available, `releaseGateResultsSuite` contains the sanitized release gate results suite smoke summary: no-results, partial-results, invalid-results, and all-results-valid intake cases, restore confirmation, and safety assertions. The suite uses synthetic evidence only, does not include verifier stdout/stderr or raw logs, and does not make the build release-approved.

When `lumatrace-windows-release-result-workspace-manifest.json` is available, `releaseResultWorkspace` contains the sanitized reviewer workspace status: gate actions, draft file names, template counts, draft counts, file counts, current intake counts, and safety assertions. Drafts are deliberately not valid release results, cannot remove blockers, and keep `productionReady: false`. The packaged diagnostics export includes this release result workspace summary without raw reviewer notes, raw logs, tokens, full local paths, command lines, stdout/stderr, or stack traces.

Example:

```json
{
  "packaged": true,
  "host": "127.0.0.1",
  "port": 49152,
  "artifactKind": "self-contained",
  "sidecarManifest": {
    "artifactKind": "self-contained",
    "productionReady": false,
    "nodeRequired": false,
    "noticesFile": "packaging-notices.json",
    "thirdPartyNoticesFile": "THIRD-PARTY-NOTICES.md",
    "licenseReviewStatus": "draft_requires_review"
  },
  "rcGate": {
    "exists": true,
    "valid": true,
    "status": "blocked",
    "rcCandidateReady": false,
    "productionReady": false,
    "blockers": [
      {
        "code": "CODE_SIGNING",
        "reason": "Production code signing is not configured.",
        "requiredForRc": true
      }
    ],
    "gates": [
      {
        "id": "code_signing",
        "status": "blocked",
        "requiredForRc": true
      }
    ]
  },
  "releasePolicy": {
    "exists": true,
    "valid": true,
    "status": "draft_blocked",
    "rcCandidateReady": false,
    "productionReady": false,
    "blockers": [
      {
        "code": "CODE_SIGNING_NOT_CONFIGURED",
        "reason": "Windows signing certificate, timestamping, and signature verification policy are not configured.",
        "requiredForRc": true
      }
    ]
  },
  "manualGuiQaHandoff": {
    "exists": true,
    "valid": true,
    "status": "handoff_ready",
    "manualGuiQaStatus": "not_run",
    "productionReady": false,
    "fileCount": 9,
    "excludedFiles": [
      "lumatrace-windows-manual-gui-qa-result.json",
      "raw logs",
      "auth token"
    ],
    "securityAssertions": {
      "tokenRedacted": true,
      "rawLogsExcluded": true
    }
  },
  "manualGuiQaResult": {
    "exists": true,
    "valid": true,
    "status": "passed",
    "productionReady": false,
    "unsignedDraft": true,
    "sourceChecklist": {
      "path": "docs/windows-packaging-manual-gui-checklist.md",
      "itemCount": 24
    },
    "reviewer": {
      "namePresent": true,
      "completedAtPresent": true,
      "environmentPresent": true
    },
    "stepSummary": {
      "total": 24,
      "passed": 24,
      "failed": 0,
      "blocked": 0,
      "pending": 0,
      "unknown": 0
    },
    "securityAssertions": {
      "rawLogsExcluded": true,
      "publicSidecarListenersAllowed": false
    }
  },
  "releaseGateResults": {
    "exists": true,
    "valid": true,
    "status": "no_results",
    "rcCandidateReady": false,
    "productionReady": false,
    "resultSummary": {
      "total": 6,
      "valid": 0,
      "invalid": 0,
      "missing": 6
    },
    "results": [
      {
        "gate": "code_signing",
        "blockerCode": "CODE_SIGNING",
        "resultFile": "lumatrace-windows-code-signing-readiness-result.json",
        "status": "missing_result",
        "canRemoveBlocker": false
      }
    ]
  },
  "releaseGateResultsImport": {
    "exists": true,
    "valid": true,
    "status": "mixed_results",
    "sourceDirectoryKind": "workspace_results_dir",
    "dryRun": false,
    "rcCandidateReady": false,
    "productionReady": false,
    "importSummary": {
      "total": 6,
      "valid": 1,
      "invalid": 1,
      "missing": 4,
      "copied": 1
    },
    "refreshedIntake": {
      "fileName": "lumatrace-windows-release-gate-results-intake.json",
      "status": "partial_results",
      "validResults": 1,
      "invalidResults": 0,
      "missingResults": 5
    }
  },
  "releaseGateResultsSuite": {
    "exists": true,
    "valid": true,
    "status": "success",
    "rcCandidateReady": false,
    "productionReady": false,
    "restoredPreviousFiles": true,
    "caseSummary": {
      "total": 4,
      "passed": 4,
      "failed": 0,
      "unknown": 0
    }
  },
  "releaseResultWorkspace": {
    "exists": true,
    "valid": true,
    "status": "workspace_ready",
    "rcCandidateReady": false,
    "productionReady": false,
    "workspaceDirectory": "lumatrace-windows-release-result-workspace",
    "currentIntake": {
      "exists": true,
      "status": "no_results",
      "validResults": 0,
      "invalidResults": 0,
      "missingResults": 6
    },
    "gateSummary": {
      "total": 6,
      "requiresHumanReview": 6
    },
    "draftSummary": {
      "total": 6,
      "cannotRemoveBlockers": 6
    },
    "fileSummary": {
      "total": 14,
      "templates": 6,
      "drafts": 6
    }
  },
  "windowsRcStatus": {
    "status": "blocked",
    "rcCandidateReady": false,
    "productionReady": false,
    "evidence": {
      "selfContainedSidecar": true,
      "sidecarProductionReady": false,
      "licenseReviewStatus": "draft_requires_review",
      "manualGuiQaResultValid": true,
      "manualGuiQaResultStatus": "passed"
    },
    "gateCounts": {
      "total": 6,
      "passed": 2,
      "blocked": 4,
      "missing": 0,
      "unknown": 0
    },
    "blockers": [
      {
        "code": "CODE_SIGNING",
        "source": "rc_gate",
        "reason": "Production code signing is not configured.",
        "requiredForRc": true
      }
    ],
    "nextActions": [
      "Configure and verify Windows code signing before RC approval."
    ]
  },
  "authRequired": true,
  "auth": {
    "required": true,
    "tokenPresent": true,
    "tokenPreview": "<redacted>"
  },
  "storage": {
    "dbExists": true,
    "migrationStatus": "ok",
    "migrationVersions": ["001_initial"],
    "sessionsCount": 2,
    "reportsCount": 1,
    "dbPathSanitized": "<user-path>/LumaTrace/lumatrace.db"
  },
  "sidecarCrashState": {
    "status": "running",
    "restartCount": 0,
    "maxRestarts": 3,
    "restartCooldownMs": 5000,
    "lastKnownPort": 49152,
    "lastKnownAuthRequired": true
  },
  "logs": {
    "rotationPolicy": {
      "maxFileSizeBytes": 10485760,
      "maxFiles": 5,
      "rotateOnStartup": true,
      "rotateWhenThresholdExceeded": true,
      "deleteOldest": true
    },
    "lastRotationResult": {
      "ok": true,
      "rotatedFiles": [],
      "warnings": []
    }
  },
  "diagnosticsExportAvailable": true,
  "packagingDiagnosticsSummary": {
    "sanitizerEnabled": true,
    "rawLogsIncluded": false,
    "warningCount": 0
  },
  "sanitizerEnabled": true,
  "limitations": {
    "productionReady": false,
    "codeSigningConfigured": false,
    "updaterConfigured": false,
    "rcStatus": "blocked"
  }
}
```

## GET /api/packaged/diagnostics/export

Exports sanitized packaging diagnostics as JSON. In packaged mode this route requires `Authorization: Bearer <token>`.

```bash
curl "http://127.0.0.1:3100/api/packaged/diagnostics/export?format=json" \
  -H "authorization: Bearer <token>"
```

The export includes toolchain status, sidecar manifest metadata, packaging notice metadata, release-readiness gate summary, Windows release policy template summary, Windows manual GUI QA handoff summary, Windows manual GUI QA result summary, Windows release gate results intake, Windows release gate results import summary, Windows release gate results suite smoke summary, Windows release result workspace summary, Windows RC status summary, Windows packaging RC gate summary, packaged status, sidecar crash state, restart cooldown/limit metadata, sanitized paths, log rotation metadata, short sanitized log excerpts, storage migration status, DB/session/report counts, collector availability summaries, and packaging warnings. It does not include auth tokens, raw logs, raw stdout/stderr, command lines, raw PresentMon CSV, logcat, bugreport data, stack traces, Android full serials, reviewer names, reviewer notes, evidence notes, source directory paths, or full local paths.

## POST /api/packaged/shutdown

Requests graceful shutdown for the sidecar local-server. In packaged mode this route requires auth.

```bash
curl -X POST http://127.0.0.1:3100/api/packaged/shutdown \
  -H "authorization: Bearer <token>"
```

Response data:

```json
{
  "shuttingDown": true
}
```

## GET /api/sessions/:id/metrics

Query params:

- `fromTimestampMs`
- `toTimestampMs`
- `metricNames`: comma-separated names, for example `fps,cpu_percent,network_rx_bytes`
- `limit`: default 1000, max 10000
- `offset`

```bash
curl "http://127.0.0.1:3100/api/sessions/session_x/metrics?metricNames=fps,cpu_percent&limit=100"
```

Response data: `MetricEvent[]`.

Errors: `SESSION_NOT_FOUND`, `INVALID_REQUEST`.

## GET /api/sessions/:id/metrics/downsampled

Returns bucketed metric summaries for long-session charting. The server groups stored raw
`MetricEvent` rows by `metricName` and `bucketSizeMs` and returns min/max/avg/p50/p95 values.
Only numeric metric values are included; missing or `null` values are skipped and are not converted
to `0`.

Query params:

- `bucketSizeMs`: optional positive integer, default `1000`, max `3600000`.
- `fromTimestampMs`
- `toTimestampMs`
- `metricNames`: comma-separated names, for example `fps,cpu_percent,network_rx_bytes`
- `limit`: default `1000`, max `10000`
- `offset`

```bash
curl "http://127.0.0.1:3100/api/sessions/session_x/metrics/downsampled?bucketSizeMs=1000&metricNames=fps,cpu_percent"
```

Response data: `DownsampledMetricBucket[]`.

Downsampled buckets include `source: "mixed"` when a bucket contains multiple sources. If precision
differs inside a bucket, `precision` is omitted instead of guessing. This endpoint is a read model
for visualization and does not replace raw metric storage.

Errors: `SESSION_NOT_FOUND`, `INVALID_REQUEST`.

## POST /api/sessions/:id/markers

Adds an event marker.

Request body:

```json
{
  "timestampMs": 1710000000000,
  "label": "Boss fight",
  "description": "Entered heavy scene",
  "tags": {
    "phase": "combat"
  }
}
```

```bash
curl -X POST http://127.0.0.1:3100/api/sessions/session_x/markers \
  -H "content-type: application/json" \
  -d "{\"label\":\"Boss fight\",\"description\":\"Entered heavy scene\"}"
```

Response data: `EventMarker`.

Errors: `SESSION_NOT_FOUND`, `INVALID_REQUEST`.

## GET /api/sessions/:id/markers

Lists markers for a session.

```bash
curl http://127.0.0.1:3100/api/sessions/session_x/markers
```

Response data: `EventMarker[]`.

Errors: `SESSION_NOT_FOUND`.

## GET /api/sessions/:id/report

Returns cached summary or generates one from storage.

```bash
curl http://127.0.0.1:3100/api/sessions/session_x/report
```

Response:

```json
{
  "ok": true,
  "data": {
    "summary": {},
    "cached": true,
    "rawMetricCount": 120
  }
}
```

Errors: `SESSION_NOT_FOUND`.

## GET /api/sessions/:id/export

Query params:

- `format`: required `json`, `csv`, or `html`.

```bash
curl "http://127.0.0.1:3100/api/sessions/session_x/export?format=json"
curl "http://127.0.0.1:3100/api/sessions/session_x/export?format=csv"
curl "http://127.0.0.1:3100/api/sessions/session_x/export?format=html"
```

Returns raw content with content types:

- JSON: `application/json; charset=utf-8`
- CSV: `text/csv; charset=utf-8`
- HTML: `text/html; charset=utf-8`

Errors: `SESSION_NOT_FOUND`, `EXPORT_FORMAT_UNSUPPORTED`.

## GET /api/tools/status

Returns tool status records. Android runs adb detection. PC Foundation reports PresentMon status when the PC collector is registered. PresentMon missing or unsupported does not block Windows CPU/memory sampling.

```bash
curl http://127.0.0.1:3100/api/tools/status
```

Response data: `ToolStatus[]`.

## GET /api/diagnostics

Query params:

- `sessionId`
- `deviceId`
- `level`: `debug`, `info`, `warn`, or `error`
- `limit`: default 100, max 1000
- `fromTimestampMs`
- `toTimestampMs`

```bash
curl "http://127.0.0.1:3100/api/diagnostics?level=error&limit=50"
```

Response data: `DiagnosticRecord[]`.

## GET /api/sessions/:id/diagnostics

Returns sanitized diagnostics for one session, including Android fallback, lifecycle, process, command, and FPS probe events when available.

```bash
curl http://127.0.0.1:3100/api/sessions/session_x/diagnostics
```

Response data: `DiagnosticRecord[]`.

Errors: `SESSION_NOT_FOUND`.

## GET /api/sessions/:id/diagnostics/export

Query params:

- `format`: `json` or `html`, default `json`.

```bash
curl "http://127.0.0.1:3100/api/sessions/session_x/diagnostics/export?format=json"
curl "http://127.0.0.1:3100/api/sessions/session_x/diagnostics/export?format=html"
```

Returns sanitized diagnostics content. The export does not include logcat, bugreport, full serials, or raw long stdout/stderr.

## GET /api/android/:deviceId/health

Returns Android adb/device health, cache summary, and known limitations.

```bash
curl http://127.0.0.1:3100/api/android/android%3Adevice/health
```

Errors: `DEVICE_NOT_FOUND`, `INVALID_REQUEST`.

## GET /api/android/:deviceId/cache/status

Returns launcher and device info cache status. Cache keys use serial hashes, not full serials.

```bash
curl http://127.0.0.1:3100/api/android/android%3Adevice/cache/status
```

## POST /api/android/:deviceId/cache/refresh

Invalidates Android launcher/device info cache and refreshes metadata.

```bash
curl -X POST http://127.0.0.1:3100/api/android/android%3Adevice/cache/refresh
```

## WS /api/sessions/:id/stream

WebSocket endpoint for realtime session events. It does not auto-start sessions.

Messages:

```json
{ "type": "session_status", "data": { "sessionId": "session_x", "status": "running" } }
```

```json
{ "type": "metric", "data": { "metricName": "fps", "source": "mock" } }
```

```json
{ "type": "session_stopped", "data": { "sessionId": "session_x" } }
```

```json
{ "type": "error", "error": { "code": "SESSION_NOT_FOUND", "message": "Session not found" } }
```

Example with a generic WebSocket client:

```bash
wscat -c ws://127.0.0.1:3100/api/sessions/session_x/stream
```
