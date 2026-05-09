# MVP-B UI

Milestone 1B adds the first desktop web UI for the local-server backend. It is a React/Vite app and uses MockCollector for demo metrics. Milestone 2D can also show Android adb discovery, stream Android CPU, memory, battery, and network metrics for already-running target processes, and expose an off-by-default experimental Android FPS probe toggle.

## Run

Start backend and UI in separate terminals:

```bash
pnpm dev:server
pnpm dev:desktop
```

Run the UI smoke path:

```bash
pnpm smoke:mvp-b-ui
pnpm smoke:mvp-b-browser
```

The UI defaults to:

- API: `http://127.0.0.1:3100`
- WebSocket: `ws://127.0.0.1:3100`

`VITE_API_BASE_URL` and `VITE_WS_BASE_URL` may override those values. `VITE_*` variables are shipped to browser code, so never put secrets, tokens, credentials, or private paths in them.

## Current UI Capabilities

- Dashboard shows local-server health, mock devices, and Android adb devices when available.
- Device Detail shows mock targets or Android package targets and metric availability.
- Test Session can create, start, stop, add markers, and receive realtime mock or Android beta metrics.
- FPS, frame time, CPU, and memory render as local realtime charts.
- Android targets show an experimental FPS probe toggle. It is off by default and does not emit FPS when layer matching fails or is ambiguous.
- WebSocket status is visible and reconnects with bounded backoff.
- Refresh can restore the last session context from localStorage.
- Report shows summary cards, marker timeline, and JSON/CSV/HTML export buttons.
- Tools/Diagnostics shows adb status plus placeholder statuses for later platform tools.
- Dashboard shows recent sessions from local-server when available, with localStorage fallback.
- Browser smoke opens the app in Playwright and captures dashboard, running session, and report screenshots.

## Data Honesty

Mock demo charts display `source = mock`. Android beta sessions display ADB-sourced CPU, memory, battery, and network metrics when available. Device-level network is explicitly marked and may include other apps' traffic. Android FPS remains `experimental`; ambiguous or missing layers keep FPS and frame time as `N/A`. Missing metrics show `N/A`; they are not converted to zero. WebSocket disconnects do not stop the backend session.

## localStorage

The UI stores only last-session operator state and a small recent-session history:

- session id
- device id
- target id
- session name
- mock profile
- sample interval
- last known status
- updated time
- recent session status and display metadata

It does not store secrets, tokens, raw logs, account data, or external tool credentials.

## Completion Boundary

Milestone 1B is a UI MVP, not a production desktop package. The next milestone should move to Android Beta foundations rather than extending UI polish indefinitely.
