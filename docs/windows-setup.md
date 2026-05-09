# Windows Setup

Milestone 3A can use the local Windows process list for CPU and memory sampling. Milestone 3B can optionally run explicit PresentMon timed CSV capture for experimental FPS/frame-time metrics. Milestone 3C adds capture status, CSV retention controls, compatibility checks, permission hints, and sanitized report diagnostics.

## Requirements

- Windows host for real PC sampling.
- PowerShell available for process discovery.
- No administrator bypass is required for the foundation path.
- No process injection is used.
- PresentMon is optional. If installed, users can explicitly enable capture for a PC session.
- Windows log access group membership may improve PresentMon visibility in some environments, but LumaTrace does not bypass permissions.

## Run

```bash
pnpm dev:server
pnpm dev:desktop
```

Open the UI and select the `Local PC` device. On Windows, process targets should appear in Device Detail. Pick an already-running process and start a session.

## Notes

- The first CPU sample establishes a baseline.
- If the target process exits, CPU and memory metrics stop instead of being filled with zero.
- If a PID is reused, LumaTrace treats it as a new process identity and rebuilds the baseline.
- Executable paths may contain user names and are masked in UI/report surfaces.

## Troubleshooting

- If no process targets appear, check that PowerShell is available.
- If CPU stays N/A for one sample, wait for the second sample.
- If FPS is N/A, verify that PresentMon is installed, `enablePresentMonCapture` was enabled, and target matching succeeded.
- PresentMon capture can be permission-limited for processes from other users or short-lived processes.
- Check the PresentMon status panel for planning, capturing, parsing, matching, completed, no-data, permission-limited, failed, or aborted states.
- CSV retention defaults to `delete_after_parse`; retained paths are sanitized.
- Missing or ambiguous PresentMon rows are not converted into fake FPS.
