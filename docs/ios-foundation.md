# iOS Foundation

Milestone 5A starts the iOS Foundation without promising unavailable metrics.

## Current Scope

- Registers `@lumatrace/collectors-ios`.
- Detects Xcode command line tooling through `xcrun`.
- Parses `xcrun xctrace list devices` output from fixtures and, on macOS, from public Xcode tooling.
- Lists simulator app targets with `xcrun simctl listapps <udid> --json` when a simulator is available.
- Adds honest iOS capabilities for discovery and future trace-based metrics.
- Registers iOS tool status in local-server without breaking Mock, Android, PC, or Tauri packaging flows.

## Not Implemented

- No iOS metric sessions.
- No live iOS CPU, memory, FPS, frame time, battery, or network metrics.
- No xctrace recording.
- Manual xctrace CSV import is handled separately by the iOS trace import foundation; it does not start xctrace recording.
- No private APIs.
- No jailbreak path.
- No permission bypass.
- No app launch/stop automation.
- No log collection.
- No syslog collection.
- No cloud upload.

## Tooling

iOS Foundation uses public Apple tooling only:

- `xcrun --version` for tool detection.
- `xcrun xctrace list devices` for physical device and simulator discovery.
- `xcrun simctl listapps <udid> --json` for simulator app target listing.

On Windows and Linux, iOS discovery reports `requires_xcode` / unsupported tool status and returns no devices. This must not fail local-server startup or other collectors.

## Metric Honesty

iOS metric availability is intentionally conservative:

- `ios.device_discovery`: `available` only when `xcrun` is available on macOS, otherwise `requires_xcode`.
- `ios.simulator_app_list`: same Xcode requirement.
- `cpu_percent`: `requires_manual_trace`.
- `memory_mb`: `requires_manual_trace`.
- `fps`: `requires_manual_trace`.
- `frame_time_ms`: `requires_manual_trace`.
- process network metrics: `unavailable`.

LumaTrace must not display fake zero values for missing iOS metrics and must not infer `frame_time_ms` from average FPS.

## Privacy

Device UDIDs are hashed for device IDs and masked in tags. Simulator app parsing omits full bundle paths. Reports and diagnostics must continue to redact local paths, tokens, emails, and stack traces.

## Testing

The iOS collector test suite uses fixtures only and does not require macOS, Xcode, a real iPhone, or a booted simulator:

```bash
pnpm test:ios-collector
pnpm verify:ios-foundation
pnpm verify:ios-trace-import
```
