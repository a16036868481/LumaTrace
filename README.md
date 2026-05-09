# LumaTrace

[![CI](https://github.com/a16036868481/LumaTrace/actions/workflows/ci.yml/badge.svg)](https://github.com/a16036868481/LumaTrace/actions/workflows/ci.yml)

English is the primary documentation language for this repository. A Chinese overview is available in [README.zh-CN.md](README.zh-CN.md), and the most important Chinese notes are included below.

LumaTrace is a clean-room, local-first device metrics testing toolkit. Milestone 1A backend and Milestone 1B web UI are complete. Milestone 2F closes Android Beta with non-root CPU, memory, battery, network, explicit app lifecycle, process rebind, experimental FPS probe paths, sanitized diagnostics, and report diagnostics. Milestone 3C closes PC Beta with Windows local process CPU/memory sampling plus explicit, experimental PresentMon CSV capture, capture status, compatibility checks, CSV retention, permission hints, and sanitized report diagnostics. Milestone 4B hardens the Tauri packaging foundation with toolchain detection, sidecar manifest validation, crash recovery, log rotation metadata, packaged storage smoke, and installer/signing draft docs without changing collector metrics. Milestone 5A starts iOS Foundation with Xcode/xcrun discovery and simulator target parsing; Milestone 5B adds manual xctrace CSV import parsing and target-matched MetricEvent mapping; Milestone 5C adds explicit macOS/Xcode xctrace record/export capture foundation.

## 中文快速说明

LumaTrace 是一个开源、本地优先、clean-room 的性能测试工具，用来帮助普通用户和开发者查看 Windows、Android、iOS 测试过程中的核心指标、实时曲线和测试报告。它不会上传云端，不默认采集隐私日志，不使用 ROOT、越狱、私有 API，也不会把无法采集的指标伪造成 0。

- Windows：选择本机正在运行的应用或游戏进程后开始测试，可采集 CPU、内存；FPS/帧时间依赖 PresentMon，仍按实验能力标记。
- Android：连接手机或模拟器，开启开发者选项和 USB 调试，授权电脑后打开要测试的 App，再开始测试。CPU、内存、电池、网络可用；FPS/帧时间仍是实验能力。
- iOS：当前主要是 macOS + Xcode/xctrace 相关能力和 trace 导入基础，不承诺稳定实时采集。
- 报告：测试结束后生成 HTML、JSON、CSV 报告，缺失指标显示 `N/A`，不会填 0。
- 隐私：导出的诊断和报告默认脱敏 token、邮箱、完整本地路径、设备序列号、原始日志等敏感信息。

### 中文问题反馈

如果你发现 Bug、安装失败、设备识别异常、FPS 不显示、报告不正确，或者有功能建议，请到 [GitHub Issues](https://github.com/a16036868481/LumaTrace/issues) 提交。

提交时建议附上：LumaTrace 版本、Windows/Android/iOS 版本、设备型号、复现步骤、预期结果、实际结果、截图，以及软件里的脱敏诊断导出。请不要上传 token、账号、完整本地路径、原始日志、raw CSV、logcat、bugreport 或包含隐私的截图。

## Clean-Room Statement

LumaTrace does not copy any commercial tool's code, UI, icons, text, protocols, product layout, private implementation, or proprietary behavior. This repository only implements the general product category of cross-platform device metrics testing.

## Bug Reports And Feature Requests

Please submit bugs and feature requests in [GitHub Issues](https://github.com/a16036868481/LumaTrace/issues). Include the LumaTrace version, operating system, device model, steps to reproduce, expected result, actual result, screenshots when useful, and a sanitized diagnostics export.

Do not upload tokens, accounts, full local paths, raw logs, raw PresentMon CSV files, logcat, bugreport, or screenshots that expose private information.

## Current Capabilities

- Core TypeScript models, metric availability, collector interfaces, stats, and command runner primitives.
- MockCollector with deterministic mock devices, mock targets, and mock metric streams.
- SQLite storage with migrations and repositories for devices, targets, sessions, metrics, markers, reports, tool status, and diagnostics.
- Report generation and JSON, CSV, and static HTML exporters.
- Fastify local-server with REST API and WebSocket metric stream.
- MVP-A session loop: discover device, list targets, create session, start stream, persist metrics, add markers, stop, report, export.
- MVP-B UI: dashboard, device detail, session console, realtime FPS/frame-time/CPU/memory charts, reconnecting WebSocket client, session recovery, report page, export buttons, and tools/diagnostics.
- Android 2E beta path: adb tool status, Android discovery, package targets, launcher activity parsing, explicit `am start -W`, explicit `am force-stop`, PID wait/rebind, CPU from `/proc/stat` + `/proc/<pid>/stat`, memory from `dumpsys meminfo` with `/proc/<pid>/status` fallback, battery fields from `dumpsys battery`, network deltas from UID-level `dumpsys netstats detail` with device-level `/proc/net/dev` fallback, and experimental FPS parser/probe research for `gfxinfo framestats` and SurfaceFlinger timestats.
- PC Beta: Local PC device discovery, Windows process targets, PID-bound CPU/memory sampling, process exit/PID reuse detection, PresentMon tool detection, explicit PresentMon timed CSV capture, target matching, capture status, version compatibility, CSV retention, permission diagnostics, and experimental `fps` / `frame_time_ms` MetricEvents only when rows match the selected process.
- iOS Beta: `@lumatrace/collectors-ios`, Xcode `xcrun` tool detection, `xcrun xctrace list devices` parsing, simulator app target parsing through `xcrun simctl listapps`, honest iOS availability, manual xctrace CSV import parsing/mapping, and explicit macOS/Xcode xctrace record/export capture foundation. It does not start stable iOS live metric sessions.
- Tauri 4A packaging foundation: `apps/desktop/src-tauri` host scaffold, local-server sidecar supervisor, packaged-mode `127.0.0.1` binding, memory-only bearer token, Tauri-aware API/WebSocket client, sidecar status UI, sanitized packaging diagnostics, and AppLocalData/AppLog path routing.
- Tauri 4B packaging hardening: Rust/Tauri toolchain detection, sidecar artifact manifest with target triple and hash, self-contained sidecar pipeline draft, packaging notice manifest, crash recovery status, restart limits, log rotation metadata, packaged storage restart smoke, Windows installer draft, macOS signing draft, and packaging QA checklist.
- Windows tool bootstrap: installer/first-run scripts can detect ADB and PresentMon, install missing optional tools through fixed winget package IDs, and configure user environment variables without bundling unclear-license binaries or granting arbitrary shell command permission.
- Windows packaging draft verification: unsigned portable release-directory checks validate the Tauri release exe, bundled sidecar resources, notice files, and `productionReady=false` without claiming an installer, code signing, updater, or store release.
- Windows installer draft probing: an explicit unsigned NSIS QA path can be run without changing the default `bundle.active=false`; it records `productionReady=false` and is not a release artifact.
- Windows installer draft smoke: the unsigned NSIS setup can be installed into a temporary directory, checked for expected resources, uninstalled, and cleaned up without writing desktop release artifacts.

## Not Implemented Yet

- Production installer, code signing, automatic updater, and store distribution.
- Production-ready self-contained local-server sidecar binary. The current self-contained draft bundles Node and notice metadata, but `productionReady` remains `false`.
- Stable Android FPS/frame-time collection and logcat collection.
- Stable iOS live metric sessions, arbitrary iOS FPS, macOS, or Linux real metric collectors.
- ETW SDK consumer, GPU telemetry, overlay, or stable production PC FPS/frame-time collection.
- `ideviceinfo`/libimobiledevice integration.
- Cloud upload or remote storage.

## Quick Start

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm dev:server
```

Health check:

```bash
curl http://127.0.0.1:3100/api/health
```

Expected status is `ok` and version is `mvp-a`.

## Start The MVP-B UI

Run the backend and UI in separate terminals:

```bash
pnpm dev:server
pnpm dev:desktop
```

The Vite UI runs at `http://127.0.0.1:5173`. By default it connects to:

- API: `http://127.0.0.1:3100`
- WebSocket: `ws://127.0.0.1:3100`

You can override them with `VITE_API_BASE_URL` and `VITE_WS_BASE_URL`. Values prefixed with `VITE_` are exposed to browser code, so do not put secrets, tokens, or credentials in them.

## MVP-A Smoke And Verification

```bash
pnpm smoke:mvp-a
pnpm verify:mvp-a
pnpm smoke:mvp-b-ui
pnpm smoke:mvp-b-browser
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
pnpm smoke:tauri-release-sidecar
pnpm verify:windows-bundle-draft
pnpm verify:windows-installer-draft
pnpm smoke:windows-installer-draft
pnpm smoke:tauri-foundation
pnpm verify:tauri-foundation
pnpm detect:tauri-toolchain
pnpm detect:windows-tools
pnpm verify:windows-tool-bootstrap
pnpm verify:sidecar-artifacts
pnpm smoke:packaged-storage
pnpm smoke:sidecar-crash-recovery
pnpm verify:packaging-hardening
```

The smoke script starts an in-memory local server, creates a mock session, receives WebSocket metrics, stops the session, and verifies report/export paths. The Windows packaging QA evidence manifest aggregates automated smoke results and intentionally leaves manual GUI QA as `not_run` until the installed app checklist is completed by a human. The manual GUI QA template keeps every checklist item `pending` until a reviewer fills it out; `pnpm verify:windows-manual-gui-qa-handoff` creates a sanitized reviewer handoff directory without a completed result or raw logs; `pnpm verify:windows-manual-gui-qa-result path/to/result.json` validates the filled result without changing `productionReady=false`; and the QA evidence manifest records only a sanitized manual result summary when that result is present. `pnpm verify:windows-packaging-release-readiness` adds a final blocker manifest for packaging QA; `pnpm verify:windows-packaging-rc-gate` adds an RC-level blocker manifest. Both are expected to remain blocked until signing, updater policy, release approval, and other production gates are complete.

## MVP-B UI Smoke

```bash
pnpm smoke:mvp-b-ui
```

This builds the desktop app, starts an in-memory local server, validates the APIs used by the UI, receives WebSocket mock metrics, stops the session, and checks report/export responses. The UI charts currently display mock metrics only. WebSocket reconnect does not stop the backend session, and localStorage stores only the last session UI state, never secrets.

`pnpm smoke:mvp-b-browser` also launches a real browser with Playwright, opens the built UI through Vite preview, runs a compact mock session flow, and writes screenshots under `tests/screenshots/`.

## Tauri Packaging Foundation

Milestone 4A keeps web development unchanged:

```bash
pnpm dev:server
pnpm dev:desktop
```

For packaged-mode checks:

```bash
pnpm detect:tauri-toolchain
pnpm build:sidecar
pnpm build:self-contained-sidecar
pnpm verify:sidecar-artifacts
pnpm verify:packaging-notices
pnpm smoke:tauri-release-sidecar
pnpm verify:windows-bundle-draft
pnpm verify:windows-installer-draft
pnpm smoke:windows-installer-draft
pnpm smoke:windows-installed-app-launch
pnpm smoke:windows-installed-sidecar-health
pnpm verify:windows-packaging-smoke-suite
pnpm verify:windows-packaging-qa-evidence
pnpm verify:windows-manual-gui-qa-template
pnpm verify:windows-manual-gui-qa-result path/to/result.json
pnpm smoke:windows-packaging-qa-evidence-manual-result
pnpm verify:windows-packaging-release-readiness
pnpm verify:windows-release-policy-template
pnpm verify:windows-packaging-rc-gate
pnpm smoke:tauri-foundation
pnpm smoke:packaged-storage
pnpm smoke:sidecar-crash-recovery
pnpm verify:tauri-foundation
pnpm verify:packaging-hardening
```

Packaged local-server binds only to `127.0.0.1` and requires a bearer token for `/api/*` REST and WebSocket routes. The token is generated by the Tauri host, held in memory, passed to the sidecar at launch, and fetched by the frontend through a Tauri command. It is not placed in `VITE_` variables, localStorage, URLs, logs, reports, or diagnostics.

## Open Source

LumaTrace is released under the MIT License. The root workspace keeps
`private: true` in `package.json` only to prevent accidental npm publication of
the monorepo packages; it does not make the GitHub project private.

Before publishing or accepting pull requests, keep generated artifacts out of
Git:

- `node_modules/`, `.turbo/`, `dist/`, and Tauri `target/` outputs.
- Local SQLite databases, reports, diagnostics, logs, screenshots, and app data.
- Packaged binaries and installer artifacts.
- Tokens, private keys, certificates, signing materials, and local `.env` files.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[docs/third-party-licenses.md](docs/third-party-licenses.md).

## Next Step

Milestone 4B does not claim production signing, automatic updates, store packaging, notarization, or a completed self-contained production sidecar unless the sidecar manifest says `artifactKind: "self-contained"` and `productionReady: true` after verification. On machines without cargo, `detect:tauri-toolchain` reports missing Rust clearly and Tauri Rust build verification should not be claimed.

Milestone 3C PC Beta keeps process start/stop out of scope and does not inject code, read window contents, bypass Windows permissions, implement ETW SDK capture, or collect GPU telemetry. PresentMon capture is default off and must be enabled explicitly for a PC process session. PresentMon may be missing, unsupported, permission-limited, failed, unmatched, or ambiguous without blocking CPU/memory. PC FPS and frame time remain `requires_tool` or `experimental`; missing fields display as `N/A`. Raw CSV content, full local paths, command lines, and stack traces are not included in reports.

Milestone 5A/5B/5C iOS Beta may use public Xcode command line tools (`xcrun`, `xctrace`, `simctl`) on macOS, hashes and masks UDIDs, and lists simulator app targets without exposing full simulator bundle paths. Manual xctrace CSV import and explicit automatic xctrace capture can map target-matched per-row data into experimental MetricEvents, but LumaTrace does not start xctrace by default, collect syslog/logs, use private APIs or jailbreak paths, or fabricate missing iOS metrics. `pnpm verify:ios-beta` aggregates the iOS Foundation, trace-import, and explicit xctrace-capture safety checks.

Milestone 2F Android Beta does not require root, does not collect logcat or bugreport by default, and does not fabricate missing metrics. App start and force-stop are explicit user actions; `autoStartTarget`, `allowMonkeyFallback`, and `stopTargetOnSessionStop` default to `false`. Session stop does not force-stop the app unless configured. Network collection prefers UID-level `dumpsys netstats detail`; if it falls back to `/proc/net/dev`, the metric is marked `device_level` and may include traffic from other apps. Android FPS remains `experimental`, the UI toggle is off by default, and layer matching failure or ambiguity leaves FPS as `N/A`. Diagnostics exports are sanitized.

More documentation is in [docs/README.md](docs/README.md).
