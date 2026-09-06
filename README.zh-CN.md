# LumaTrace 性能测试工具

**看见性能，优化体验。** 选择 Windows 应用/游戏进程或 Android 手机 App，即可查看实时性能曲线，并把测试报告保存在自己的电脑上。

[下载 Windows 预览版](https://github.com/a16036868481/LumaTrace/releases/tag/v1.0.3-preview.1) · [微软商店](https://apps.microsoft.com/detail/9P3KNQZMFBM8) · [详细使用说明](docs/user-guide.zh-CN.md) · [English](README.md)

## 下载与安装

**1.0.3 预览版**面向 **Windows 11 x64**，已包含软件自身的运行环境，普通用户无需安装 Node.js 或 pnpm。GitHub 版本是未签名预览版，Windows 可能提示未知发布者或 SmartScreen 警告；运行前请核对下载来源和版本，不要关闭系统防护。

| 下载文件 | 使用方法 |
| --- | --- |
| [安装版](https://github.com/a16036868481/LumaTrace/releases/download/v1.0.3-preview.1/LumaTrace-1.0.3-windows-x64-setup.exe) | 下载并运行安装程序，完成后打开 LumaTrace。 |
| [便携版 ZIP](https://github.com/a16036868481/LumaTrace/releases/download/v1.0.3-preview.1/LumaTrace-1.0.3-windows-x64-portable.zip) | 完整解压到可写的文件夹，运行 `lumatrace-desktop.exe`；让 `binaries` 文件夹保持在它旁边。 |
| [SHA256 校验文件](https://github.com/a16036868481/LumaTrace/releases/download/v1.0.3-preview.1/SHA256SUMS.txt) | 用于核对下载文件是否与发布文件一致。 |
| [微软商店](https://apps.microsoft.com/detail/9P3KNQZMFBM8) | 安装当前地区提供的版本。商店审核和分发独立于本次 GitHub 预览版发布。 |

[完整发布页](https://github.com/a16036868481/LumaTrace/releases/tag/v1.0.3-preview.1)提供版本说明及全部附件。GitHub 自动生成的 **Source code** 压缩包供开发者使用，不是可直接运行的软件。

电脑缺少 Microsoft WebView2 Runtime 时，安装版会联网下载；便携版用户需要先从[微软官方页面](https://developer.microsoft.com/microsoft-edge/webview2/)安装 WebView2 Runtime，再启动软件。

Android 测试需要在 Windows 电脑上运行 LumaTrace，并连接手机或兼容 ADB 的设备。**ADB、PresentMon 是单独安装的可选工具，未随软件打包。** 当前不支持 iOS。

## 第一次使用

1. 打开 LumaTrace，在左下角 **Language** 中选择 **简体中文**。首次启动默认为英文，之后会记住你的选择。
2. 点击左侧 **设置报告目录**，选择测试结果的保存位置。
3. 在首页选择 **Windows 本机** 或 **Android 手机**。
4. Windows：先打开应用或游戏，再选择对应进程；如果是后打开的，点击刷新按钮。Android：连接并授权手机，在手机上打开待测 App，等待识别名称或包名。
5. 点击 **开始测试**，正常使用应用；完成测试场景后点击 **结束测试**，到 **测试结果** 或报告目录查看结果。

开始后会自动采集。每个指标在第一条真实数据到达前显示加载效果，有数据后显示折线图；勾选框用于选择要看的曲线。一般不需要调整高级设置。

连接手机、FPS 权限及常见问题见[完整使用说明](docs/user-guide.zh-CN.md)。

## 可以测试什么

| 测试对象 | 指标与条件 |
| --- | --- |
| Windows 应用/游戏 | 进程 CPU、内存；PresentMon 可用且权限满足时采集 FPS、帧时间；Windows GPU 计数器可用时采集进程 GPU 使用率。 |
| Windows 显卡 | 驱动或传感器支持时采集 GPU 功耗、GPU 温度。这是显卡设备级数据，不是某个程序的独占功耗，也不是整机功耗。 |
| Android App | CPU、内存，以及设备能提供的 FPS、帧时间。FPS 支持情况受 Android 版本、App 和渲染方式影响。 |
| Android 手机 | 设备可提供的电量、电池温度和网络数据。网络退回整台设备统计时，指标详情会说明。 |

采不到的指标保持 **N/A / 未采集**，不会填成 0。部分指标需要工具、驱动或 Windows 权限。当前不显示 CPU 温度；指标详情保留来源、测量范围、精度和可信度。

## 报告、语言与日志

- **一次测试一个文件夹：** HTML、CSV、JSON 和可选日志放在一起，以测试名称、时间和唯一后缀命名。
- **结果更容易读：** 可查看平均 FPS、1% Low FPS、帧时间、资源占用、曲线和性能总结。FPS 分档是参考，不是硬件跑分。
- **101 种语言/地区选项：** 测试前选择语言，新生成的报告会使用该语言。全部选项见[语言列表](apps/desktop/src/i18n/localeCatalog.ts)。
- **日志默认关闭：** 开始前可勾选 **输出日志到报告目录**。Android 保存测试期间经脱敏的 ADB logcat；Windows 保存带时间的 LumaTrace 采集记录，不是被测程序自身的私有日志。
- **数据保存在本机：** 默认不上传云端。报告及日志会脱敏设备序列号、用户路径、邮箱、token 等敏感内容；分享前仍请检查文件。

## 遇到问题

在软件的 **修复/提交BUG** 页面，可一键修复本地采集服务，或打开 GitHub 提交问题。如果测试仍在进行，请先结束测试。

[提交 Bug](https://github.com/a16036868481/LumaTrace/issues/new?template=bug_report.yml) · [提出建议](https://github.com/a16036868481/LumaTrace/issues/new?template=feature_request.yml)

请附上软件版本、Windows/Android 版本、设备型号、复现步骤，以及检查过的截图或脱敏报告。不要公开密码、token、账号信息、原始隐私日志或完整设备标识。

## 开发与贡献

开发环境使用 **Node.js 24**（见 [`.node-version`](.node-version)）和 **pnpm 9.15.4**。构建 Tauri 桌面程序还需要 Rust 和 Windows 构建环境，详见[打包文档](docs/tauri-packaging.md)。

```bash
git clone https://github.com/a16036868481/LumaTrace.git
cd LumaTrace
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

开发网页界面时，在两个终端分别运行 `pnpm dev:server` 和 `pnpm dev:desktop`，然后打开 `http://127.0.0.1:5173`。开发用 Mock 目标会明确标记，不代表真实设备的测量结果。

[贡献指南](CONTRIBUTING.md) · [开发文档](docs/development.md) · [架构](docs/architecture.md) · [指标定义](docs/metric-definitions.md) · [安全说明](SECURITY.md) · [第三方许可证](docs/third-party-licenses.md)

部分开发文档记录的是早期里程碑，当前用户操作流程以本页和使用指南为准。

## 开源许可

项目采用 [MIT License](LICENSE)。LumaTrace 是 clean-room 实现，不复制商业工具的代码、界面、图标、协议或私有实现；采集不会绕过系统权限，也不要求 ROOT。第三方组件遵循各自的许可证。
