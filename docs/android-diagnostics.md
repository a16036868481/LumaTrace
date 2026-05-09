# Android Diagnostics

Android Beta diagnostics make fallbacks and uncertainty visible without collecting private logs.

Included:

- ADB missing, slow command, timeout, retry, and abort events.
- Device offline or unauthorized states.
- Explicit app start and explicit force-stop events.
- Process missing and PID rebound events.
- CPU, memory, battery, network, and experimental FPS probe warnings.
- Source and precision notices for device-level network and low-confidence memory fallback.

Excluded by default:

- No logcat.
- No adb bugreport.
- No raw privacy-sensitive stdout or stderr dumps.
- No full Android serial.
- No local user paths, email addresses, tokens, cookies, or secrets.

Sanitization:

- Android serials are masked or hashed before UI/report/export display.
- User paths on Windows, macOS, and Linux are replaced with placeholders.
- Tokens, emails, and long command output are redacted or truncated.
- Diagnostics JSON/HTML exports contain high-level reasons, durations, sanitized commands, and bounded details only.

Important codes:

- `NETWORK_FALLBACK_DEVICE_LEVEL`: `/proc/net/dev` was used. This is device-level traffic and can include other apps.
- `MEMINFO_FALLBACK_PROC_STATUS`: memory fell back to `/proc/<pid>/status` with lower confidence.
- `PID_MISSING`: CPU and memory for the target process must stay N/A during the missing interval.
- `PID_REBOUND`: process samplers reset baseline after a new PID appeared.
- `FPS_LAYER_MATCH_NONE` / `FPS_LAYER_MATCH_AMBIGUOUS`: Android FPS remains N/A.

APIs:

- `GET /api/sessions/:id/diagnostics`
- `GET /api/sessions/:id/diagnostics/export?format=json|html`
- `GET /api/android/:deviceId/health`
- `GET /api/android/:deviceId/cache/status`
- `POST /api/android/:deviceId/cache/refresh`

These APIs use the standard `{ ok, data }` / `{ ok, error }` REST envelope except diagnostics export, which returns raw JSON or HTML content.
