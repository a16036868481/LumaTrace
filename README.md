# LumaTrace Performance Lab

[![CI](https://github.com/a16036868481/LumaTrace/actions/workflows/ci.yml/badge.svg)](https://github.com/a16036868481/LumaTrace/actions/workflows/ci.yml)

**See how your apps and games perform.** Test a Windows process or an Android app, watch live performance charts, and save a readable report on your own computer.

[Download Windows preview](https://github.com/a16036868481/LumaTrace/releases/tag/v1.0.3-preview.1) · [Microsoft Store](https://apps.microsoft.com/detail/9P3KNQZMFBM8) · [User guide](docs/user-guide.md) · [简体中文](README.zh-CN.md)

## Download and install

The **1.0.3 preview** targets **Windows 11 x64**. It includes its own application runtime; you do not need Node.js or pnpm to use it. GitHub builds are unsigned previews, so Windows may show an unknown-publisher or SmartScreen warning. Check the release and publisher before running a downloaded file; do not disable Windows protection.

| Download | Use |
| --- | --- |
| [Installer](https://github.com/a16036868481/LumaTrace/releases/download/v1.0.3-preview.1/LumaTrace-1.0.3-windows-x64-setup.exe) | Download and run the setup file, then launch LumaTrace. |
| [Portable ZIP](https://github.com/a16036868481/LumaTrace/releases/download/v1.0.3-preview.1/LumaTrace-1.0.3-windows-x64-portable.zip) | Extract the entire archive to a writable folder and run `lumatrace-desktop.exe`. Keep the `binaries` folder beside it. |
| [SHA256 checksums](https://github.com/a16036868481/LumaTrace/releases/download/v1.0.3-preview.1/SHA256SUMS.txt) | Verify downloaded files against the release checksums. |
| [Microsoft Store](https://apps.microsoft.com/detail/9P3KNQZMFBM8) | Install the version currently offered in your region. Store review and distribution are separate from this GitHub preview. |

The [release page](https://github.com/a16036868481/LumaTrace/releases/tag/v1.0.3-preview.1) contains the version notes and all assets. GitHub's **Source code** ZIP is for developers, not a ready-to-run application.

The installer downloads Microsoft WebView2 Runtime if it is missing, which requires an internet connection. For the portable ZIP, install [Microsoft WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) first if your PC does not already have it.

Android testing runs from this Windows app with a connected phone or compatible ADB device. **ADB and PresentMon are separate optional tools and are not bundled.** iOS is not supported.

## Your first test

1. Launch LumaTrace. Change **Language** at the bottom of the sidebar if needed; the default is English.
2. Choose **Set report folder** in the sidebar and select a destination.
3. Select **Windows** or **Android** on the home page.
4. For Windows, open the app/game and select its process. Use refresh if you opened it after LumaTrace. For Android, connect and authorize your phone, open the app on the phone, and wait for its name/package to appear.
5. Click **Start Test**, use the app normally, then click **End Test**. Open **Test Results** or the report folder to review the run.

Collection starts automatically. Each chart shows a loading indicator while it waits for its first real sample; metric checkboxes let you choose which charts to display. Advanced settings are optional.

For device connection, FPS, permissions, and report help, see the [step-by-step user guide](docs/user-guide.md).

## What you can measure

| Target | Metrics and conditions |
| --- | --- |
| Windows app or game | Process CPU and memory; FPS/frame time through PresentMon when supported and permitted; process GPU usage when Windows GPU counters are available. |
| Windows graphics hardware | GPU power and GPU temperature when a supported driver/sensor supplies readings. These describe the graphics device, not one process or total PC power. |
| Android app | CPU, memory, and FPS/frame time where the device exposes usable data. FPS support varies by Android version, app, and rendering path. |
| Android device | Battery level/temperature and network measurements where available. Device-wide network fallback is identified in metric details. |

Unavailable measurements stay **N/A / Not collected** rather than becoming zero. Collection may require a tool, a driver, or Windows permission. CPU temperature is not displayed. Details retain the source, measurement scope, precision, and confidence.

## Reports, languages, and logs

- **One folder per test:** HTML, CSV, JSON, and an optional log are grouped in a folder named after the test with a timestamp and unique suffix.
- **Readable results:** inspect average FPS, 1% Low FPS, frame time, resource use, charts, and a performance summary. FPS ratings are a reference, not a hardware benchmark score.
- **101 language/region choices:** select a language before testing to use it in the generated report. Your choice is remembered. See the [locale catalog](apps/desktop/src/i18n/localeCatalog.ts).
- **Optional logs:** **Save log to report folder** is unchecked by default. Android saves a sanitized ADB logcat for the test period; Windows saves timestamped LumaTrace collection/session records, not the target program's private logs.
- **Local storage:** test data stays on your computer. Reports and saved logs redact sensitive values such as device serials, user paths, emails, and tokens. Review files before sharing them.

## Troubleshooting and feedback

Use **Repair / Submit Bug** in the app for a one-click local service repair or to open the GitHub bug form. End an active test before repairing.

[Report a bug](https://github.com/a16036868481/LumaTrace/issues/new?template=bug_report.yml) · [Request a feature](https://github.com/a16036868481/LumaTrace/issues/new?template=feature_request.yml)

Include the app version, Windows/Android version, device model, steps, and a screenshot or reviewed, sanitized report. Do not post passwords, tokens, account information, raw private logs, or unredacted device identifiers.

## Build and contribute

Use **Node.js 24** (see [`.node-version`](.node-version)) and **pnpm 9.15.4**. A Tauri desktop build also needs Rust and the Windows prerequisites in the [packaging guide](docs/tauri-packaging.md).

```bash
git clone https://github.com/a16036868481/LumaTrace.git
cd LumaTrace
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

For web development, start these in separate terminals:

```bash
pnpm dev:server
pnpm dev:desktop
```

Open `http://127.0.0.1:5173`; the local development API defaults to `http://127.0.0.1:3100`. Mock targets are explicitly marked as mock and are not real device measurements.

[Contributing](CONTRIBUTING.md) · [Developer documentation](docs/development.md) · [Architecture](docs/architecture.md) · [Metric definitions](docs/metric-definitions.md) · [Security](SECURITY.md) · [Third-party licenses](docs/third-party-licenses.md)

Some developer documents describe earlier milestones; use this README and the user guide for the current user workflow.

## License

LumaTrace is open source under the [MIT License](LICENSE). It is a clean-room implementation: it does not copy commercial tools' code, UI, icons, protocols, or private implementations. Collection does not bypass system permissions or require root. Third-party components retain their own licenses.
