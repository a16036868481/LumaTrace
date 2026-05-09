# Android Real Device Checklist

Automated Android Beta tests use fake adb clients and do not require a real device. Use this checklist for manual validation.

## Preparation

- Install Android SDK Platform Tools.
- Run `adb version`.
- Run `adb devices -l`.
- Enable USB debugging.
- Confirm the device RSA authorization prompt.
- Install the target app.
- Launch the target app manually at least once.

## Discovery

- Tool status shows `adb` available.
- Android device appears.
- Package list appears.
- Launcher is detected, or a launcher warning is visible.

## CPU / Memory / Battery

- Start the target app.
- Start a session.
- CPU appears after the second sample because the first sample is baseline-only.
- Memory appears from `dumpsys meminfo`, or a lower-confidence `/proc/<pid>/status` fallback is visible.
- Battery level appears when the device exposes it.
- Missing battery fields remain N/A.

## Network

- Generate traffic in the target app.
- UID-level network appears when available.
- Device-level fallback shows a visible warning.
- Device-level network is not treated as target-only traffic.
- Missing network fields remain N/A.

## Lifecycle

- `autoStartTarget` is off by default.
- `allowMonkeyFallback` is off by default.
- `stopTargetOnSessionStop` is off by default.
- Start App uses `am start -W`.
- Stop App shows a force-stop warning and requires explicit user action.
- Session stop does not force-stop the app unless configured.

## PID Rebind

- Restart the app manually during a session.
- PID missing and PID rebound events appear.
- CPU sampler baseline resets after rebound.
- CPU and memory stay N/A during missing intervals.

## Experimental FPS

- FPS probe is off by default.
- Enabling the probe marks results experimental.
- Layer match success, failure, or ambiguity is visible.
- Ambiguous or missing layer match keeps FPS and frame time N/A.
- Average FPS is not used to fabricate `frame_time_ms`.

## Report And Privacy

- Report contains Diagnostics Timeline and source/precision notices.
- Device-level network notice is visible when fallback occurs.
- FPS experimental notice is visible when the probe runs.
- No logcat is collected.
- No bugreport is collected.
- Exported diagnostics do not include full serials or raw long stdout/stderr.
