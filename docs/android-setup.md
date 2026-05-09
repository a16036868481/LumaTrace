# Android Setup

Milestone 2E supports Android discovery, explicit app start/force-stop, PID rebind, and basic CPU, memory, battery, and network sampling through non-root ADB. It also includes experimental FPS/frame-time parser and probe research. Stable Android FPS and logcat collection are not implemented.

## Requirements

- Install Android SDK Platform Tools.
- Ensure `adb version` works, or set `LUMATRACE_ADB_PATH` to the adb executable.
- Enable Developer Options and USB debugging on the Android device.
- Connect the device over USB or an adb network connection.

## Authorization

Run:

```bash
adb devices -l
```

If the device is `unauthorized`, unlock the device and accept the RSA debugging prompt. If the device is `offline`, reconnect it or restart adb. LumaTrace reports these states honestly and does not execute shell commands against unauthorized or offline devices.

## Current 2E Capabilities

- adb tool status
- Android device discovery
- basic device info from `getprop`
- package targets from `pm list packages`
- PID parsing via `pidof` and `ps`
- package UID parsing via `dumpsys package`
- CPU sampling via `/proc/stat` and `/proc/<pid>/stat`
- Memory sampling via `dumpsys meminfo <package>`
- Memory fallback via `/proc/<pid>/status` with lower confidence
- Battery sampling via `dumpsys battery` when fields are present
- UID-level network sampling via `dumpsys netstats detail` when available
- Device-level network fallback via `/proc/net/dev`
- Experimental `gfxinfo framestats` parser
- Experimental SurfaceFlinger timestats and layer-list parsers
- Experimental FPS probe toggle, off by default
- Launcher activity parsing from `dumpsys package`
- Explicit app launch via `am start -W`
- Optional monkey fallback limited to one launch event and disabled by default
- Explicit force-stop via `am force-stop`
- PID wait and best-effort PID rebind

## Running Android Sessions

By default, the target app must already be running before `POST /api/sessions/:id/start`. If PID lookup fails and `autoStartTarget=false`, the API returns a clear error instead of starting a fake session. Users can explicitly click Start App, or set `autoStartTarget=true` in session config. `allowMonkeyFallback` defaults to `false`; when enabled, it only runs `monkey -p <package> 1` as a launch fallback, not a stress test.

Session stop does not force-stop the app by default. Explicit Stop App or `stopTargetOnSessionStop=true` uses `am force-stop <package>`.

If a process disappears during collection, process-level CPU/memory metrics are paused or the session fails depending on `processMissingPolicy`. Battery and network may continue when available, and PID rebind resets CPU baseline before emitting process CPU again.

Network sampling first attempts UID-level `dumpsys netstats detail`. If UID-level stats are missing or unusable, LumaTrace can fall back to `/proc/net/dev`. That fallback is marked `precision: "device_level"` and may include traffic from other apps. The first network sample is only a baseline, and counter resets or negative deltas are skipped.

Android FPS remains experimental. The optional probe uses `dumpsys gfxinfo <package> framestats` and `dumpsys SurfaceFlinger --timestats`, requires target layer matching, and leaves FPS as `N/A` when matching fails or is ambiguous. It does not use root or private APIs, and it must not infer per-frame `frame_time_ms` from average FPS.

No root is required. No private APIs are used. No logcat/syslog data is collected in this milestone.
