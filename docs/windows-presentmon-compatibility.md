# Windows PresentMon Compatibility

LumaTrace checks PresentMon version and help output before planning an explicit capture. Compatibility detection is intentionally conservative because PresentMon Console arguments can differ across releases.

## Compatibility Fields

- `supportsOutputFile`: required for LumaTrace capture.
- `supportsTimedCapture`: required for timed capture.
- `supportsProcessIdFilter`: preferred target filter.
- `supportsProcessNameFilter`: fallback target filter.
- `supportsTerminateAfterTimer`: used when available.
- `recommendedArgsStyle`: recorded for diagnostics and future compatibility work.

## Fallback Rules

- If the tool is missing, capture is unavailable and CPU/memory continue.
- If output-file capture is unsupported, capture is unavailable.
- If timed capture is unsupported, capture is unavailable.
- If PID filtering cannot be confirmed, LumaTrace can fall back to process-name mode and marks the ambiguity risk.
- If process-name matching produces multiple candidate PIDs, no FPS is emitted.

## Version Notes

Modern PresentMon Console builds usually expose output file, timed capture, PID or process-name filtering, and timer termination options. Legacy or malformed help output may not expose enough information; LumaTrace reports `unsupported` rather than guessing.

LumaTrace does not implement an ETW SDK consumer, PresentMon Service API, GPU telemetry, overlay, process injection, or permission bypass.
