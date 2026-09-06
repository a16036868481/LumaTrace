# LumaTrace user guide

[Download](https://github.com/a16036868481/LumaTrace/releases/tag/v1.0.3-preview.1) · [Microsoft Store](https://apps.microsoft.com/detail/9P3KNQZMFBM8) · [中文使用说明](user-guide.zh-CN.md) · [Project home](../README.md)

## Install and prepare

Use a Windows 11 x64 PC. On the [1.0.3 preview release page](https://github.com/a16036868481/LumaTrace/releases/tag/v1.0.3-preview.1), choose one of these files:

- `LumaTrace-1.0.3-windows-x64-setup.exe`: run the installer, then launch LumaTrace.
- `LumaTrace-1.0.3-windows-x64-portable.zip`: extract the whole ZIP to a writable folder and run `lumatrace-desktop.exe`. Keep the `binaries` folder in the same directory as the executable.
- `SHA256SUMS.txt`: checksums for verifying the downloaded files.

The GitHub preview is unsigned. Windows may display an unknown-publisher or SmartScreen warning; verify the source and do not disable system protection. The [Microsoft Store](https://apps.microsoft.com/detail/9P3KNQZMFBM8) offers the version currently approved for your region, which can differ from this preview. GitHub's source-code ZIP is not the app.

Microsoft WebView2 Runtime is required. The installer downloads it if missing, so first-time setup may need an internet connection. For the portable ZIP, install [WebView2 Runtime from Microsoft](https://developer.microsoft.com/microsoft-edge/webview2/) first if it is not already installed.

No Node.js or pnpm installation is needed to use the downloaded application. **ADB** is needed for Android tests and **PresentMon** for Windows FPS; these tools are not bundled.

Choose **Language** at the bottom of the sidebar. English is the first-run default, and 101 language/region choices are included. Select the language before starting a test so the generated report uses it.

Click **Set report folder** and choose a writable folder with enough free space. Do this before testing. Use **Open report folder** later to find saved files.

## Test a Windows app or game

1. Open the app/game you want to measure.
2. Select **Windows** in LumaTrace.
3. Search for its name and select the actual application process. If you launched it after opening the list, click refresh beside **Start Test**.
4. Leave **Save log to report folder** unchecked unless you need a collection log.
5. Click **Start Test**, return to the game/app, and perform the actions you want to measure.
6. Click **End Test**. Open **Results** and select the run to see the summary and curves.

FPS, CPU, GPU, memory, GPU power, and GPU temperature charts are selected by default. The checkboxes control which charts are shown. Collection depends on the target, hardware, driver, and permissions; selecting a chart does not guarantee that its sensor is available.

Choose the game process rather than its launcher. For applications with several processes, the memory measurement covers the selected process, not every helper process added together.

### FPS and Windows permission

LumaTrace automatically attempts realtime FPS collection through PresentMon. If it is missing, install a compatible release from the official [PresentMon project](https://github.com/GameTechDev/PresentMon/releases). Advanced users can set `LUMATRACE_PRESENTMON_PATH` to its executable, then reopen LumaTrace.

A Windows setup prompt may appear the first time capture access is configured. This can require administrator approval and signing out and back in before permission takes effect; CPU/memory testing can still work without FPS access. LumaTrace does not silently grant itself administrator privileges.

If FPS has no data, keep the game rendering and check that the selected process is still running. Protected processes, unsupported rendering paths, permissions, and unmatched frame events can prevent collection. A loading indicator means the chart is waiting, not that data is guaranteed to arrive.

## Test an Android app

LumaTrace runs on your Windows PC. No companion app needs to be installed on the phone.

1. Enable **Developer options** and **USB debugging** on the phone. The menu location varies by manufacturer.
2. Connect a USB data cable, unlock the phone, and accept **Allow USB debugging** for your PC.
3. Open the app/game on the phone and keep it in the foreground.
4. Select **Android** in LumaTrace, then select the connected device.
5. Wait for **Current app on phone** to show the detected app or package, then click **Start Test**.
6. Use the phone normally. Click **End Test** in LumaTrace when finished.

If device discovery reports missing ADB, install the official [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools), make `adb` available on PATH, and reopen LumaTrace. Advanced users can set `LUMATRACE_ADB_PATH` to the ADB executable.

Android charts include FPS, frame time, CPU, memory, battery level, and battery temperature. Battery temperature is not CPU or GPU temperature. Reports can also include battery consumption and network traffic. FPS support depends on the device and app's exposed data; not every game or phone supports it. No ROOT is required. iOS is not supported.

## Loading and missing data

Device discovery, app detection, and collection startup show loading indicators. CPU and network sampling need a baseline before calculating a change, and some collectors take longer to produce their first result.

Once a metric receives a real sample, its value and chart appear. Missing samples are not drawn as zero. If a metric stays empty, use the checks below rather than assuming that the app is using no resources.

| What you see | What to check |
| --- | --- |
| Game/process missing | Open it, clear the search filter, and refresh the process list. |
| Android device missing | Use a data cable, unlock the phone, enable USB debugging, and accept authorization. Confirm ADB is installed. |
| Wrong Android package | Bring the intended app to the foreground on the selected phone before starting. |
| FPS still loading or not collected | Confirm the target is rendering. Check PresentMon and Windows permissions, or Android device/rendering compatibility. |
| GPU, power, or temperature not collected | The driver or sensor may not expose that measurement. Selecting more charts cannot create a missing reading. |
| Charts stop updating | Check USB and whether the target process exited. Start a new test if the process was restarted. |
| Local service cannot connect | End an active test if possible, then use **Repair / Submit Bug → One-click repair**. |
| No files in the report folder | Check write permission and free space. Look in **Results**, then choose a different output folder before retrying. |

## Read and save results

Open **Results** and select a run from the left-hand list. The report groups smoothness, app resource use, and device measurements.

| Metric | How to read it |
| --- | --- |
| Average FPS | Average frame rate during the measured interval. Compare runs with the same scene, settings, and frame-rate cap. |
| 1% Low FPS | Reflects the slower end of frame delivery. A large gap below average FPS can indicate uneven performance. |
| P95 frame time | A high-percentile frame duration in milliseconds. Lower values generally mean fewer long frames. |
| CPU | Usage attributed to the tested process/app according to the collector's measurement scope. |
| Memory | On Windows, the selected process's working-set memory. Android uses app memory data from the device; the accounting method can differ. |
| GPU | Process GPU utilization when that source is available. |
| GPU power / temperature | Graphics-device sensor readings, not one application's exclusive power or total PC power. |
| Android network | App/UID traffic where available; device-wide fallback can include other apps. Check the details. |

The FPS summary is a general reference. A 30 FPS-capped game should not be compared directly with an uncapped game. Missing values remain **N/A / Not collected**. Details retain source, precision, confidence, and availability.

When a test ends, the configured report directory contains a separate folder for that run:

```text
Your report folder/
  TestName_YYYY-MM-DD_HH-mm-ss-SSS_uniqueId/
    report.html
    report.csv
    report.json
    android-logcat.log or windows-session.log  (only if requested)
```

Open HTML in a browser for the readable report, CSV in a spreadsheet app for metric rows, or JSON for structured data. The test name, timestamp, and unique suffix keep repeated runs separate.

The trash button deletes one saved result. **Clear all** removes completed local results and their collected data after confirmation; running tests are retained. Already-exported files are kept, so manage those separately in File Explorer.

## Optional logs and privacy

Enable **Save log to report folder** before starting only when you need a log for that run. It is off by default and resets for a new test.

- **Android:** exports ADB logcat text for the test period, with timestamps and sensitive data redacted. Device log-buffer and output-size limits can truncate it. If capture fails, LumaTrace records the failure instead of inventing a log.
- **Windows:** exports timestamped LumaTrace session/collection records. This is not the target program's private log or the complete Windows event log.

Reports and logs stay local and redact sensitive values. Review files and screenshots before sharing them publicly.

For help, open [a GitHub bug report](https://github.com/a16036868481/LumaTrace/issues/new?template=bug_report.yml) with the version, device/OS, reproduction steps, and relevant sanitized evidence.
