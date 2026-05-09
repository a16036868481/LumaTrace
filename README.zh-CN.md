# LumaTrace 中文说明

> English is the primary documentation language. This Chinese page is a companion overview for Chinese readers.
>
> 本仓库以英文文档作为主要说明语言。这个中文页面用于帮助中文用户快速理解项目定位、能力边界和运行方式。

LumaTrace 是一个 clean-room、本地优先的跨平台设备指标测试工具。它面向 Windows、Android 和 iOS 的应用或游戏测试流程，重点是把采集来源、精度、可信度和不可用原因说明清楚，而不是把采不到的数据填成 0 或伪造成真实指标。

## 这个项目能做什么

- 本地启动 `local-server`，通过桌面 UI 创建测试会话、查看实时指标、停止测试并生成报告。
- 使用 Mock 数据跑完整 UI/API/存储/报告流程，方便无设备时开发和演示。Mock 数据会明确标记为 `mock`。
- Android Beta：通过非 root adb 采集 CPU、内存、电量、网络，支持显式启动/停止 App、PID 重连、诊断时间线和报告。Android FPS 仍是实验能力。
- PC Beta：发现本机 Windows 进程，采集进程 CPU/内存；可显式开启 PresentMon CSV capture 来获取实验性 FPS/帧时间。
- iOS Beta：在 macOS + Xcode 环境下使用公开命令行工具做设备/模拟器发现，支持手动或显式 xctrace CSV 导入/采集基础能力。稳定实时 iOS 会话还没有完成。
- Tauri 打包基础：桌面宿主、local-server sidecar、本地 token 鉴权、打包诊断、崩溃恢复和 smoke 测试已经有基础。

## 明确不会做的事

- 不复制任何商业工具的代码、UI、图标、文案、协议或私有实现。
- 默认不上传云端，不采集隐私日志。
- 不默认采集 logcat、syslog、bugreport 或 raw CSV。
- 不使用 root、越狱、私有 API 或权限绕过作为默认方案。
- 采不到的指标显示 `N/A` 或明确的 availability reason，不会伪造。
- 当前不声明生产级代码签名、自动更新、商店发布或 production-ready sidecar。

## 快速运行

```bash
pnpm install
pnpm dev:server
pnpm dev:desktop
```

开发模式下：

- local-server 默认运行在 `http://127.0.0.1:3100`
- Vite 桌面 UI 默认运行在 `http://127.0.0.1:5173`

健康检查：

```bash
curl http://127.0.0.1:3100/api/health
```

## 常用测试命令

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build:desktop
pnpm verify:android-beta
pnpm verify:pc-beta
pnpm verify:ios-beta
pnpm verify:packaging-hardening
```

打包和 sidecar 相关检查：

```bash
pnpm detect:tauri-toolchain
pnpm build:sidecar
pnpm build:self-contained-sidecar
pnpm verify:sidecar-artifacts
pnpm smoke:tauri-foundation
pnpm smoke:packaged-storage
pnpm smoke:sidecar-crash-recovery
```

## 平台使用说明

### Windows

Windows 目标是本机进程。选择一个正在运行的应用或游戏进程后，可以开始测试 CPU 和内存。FPS/帧时间依赖 PresentMon，并且必须由用户显式开启；如果 PresentMon 缺失、权限不足、目标不匹配或结果有歧义，FPS 会保持 `N/A`。

### Android

Android 需要安装 Android SDK Platform Tools，并在手机上开启开发者选项和 USB 调试。连接并授权后，LumaTrace 会通过 adb 发现设备。CPU、内存、电量和网络是 Android Beta 的主要可用指标。FPS 仍是实验能力，设备和系统差异会影响可用性。

### iOS

iOS 当前主要依赖 macOS + Xcode 的公开命令行工具，例如 `xcrun`、`xctrace` 和 `simctl`。目前更适合 trace 导入和显式 capture 基础验证，不是完整实时采集体验。

## 报告与隐私

报告会保留指标的 `source`、`precision`、`confidence` 和 availability 信息。导出内容默认脱敏本地路径、设备序列号、邮箱、token、命令行和大段 stdout/stderr。原始日志、bugreport、logcat、raw PresentMon CSV 不会默认进入报告。

## 主要英文文档

- [Main README](README.md)
- [Architecture](docs/architecture.md)
- [Metric Definitions](docs/metric-definitions.md)
- [Platform Limitations](docs/platform-limitations.md)
- [Privacy and Security](docs/privacy-security.md)
- [Android Beta](docs/android-beta.md)
- [PC Beta](docs/pc-beta.md)
- [iOS Beta](docs/ios-beta.md)
- [Tauri Packaging](docs/tauri-packaging.md)

## 贡献说明

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) 和 [AGENTS.md](AGENTS.md)。请保持 clean-room 原则、最小权限、本地优先和指标真实性。
