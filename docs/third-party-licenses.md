# Third-Party Licenses

Current distributable notices are in [desktop-third-party-notices.md](../legal/desktop-third-party-notices.md) for the desktop executable/frontend and [THIRD-PARTY-NOTICES.md](../apps/desktop/src-tauri/binaries/THIRD-PARTY-NOTICES.md) for the self-contained sidecar. Packages retain the corresponding license texts and version-specific source references. The table below is the historical MVP-A inventory, not the full current distribution manifest.

| Name | Usage | Package type | License | Distribution note | MVP-A bundled |
| --- | --- | --- | --- | --- | --- |
| TypeScript | Type checking and compilation | dev npm dependency | Apache-2.0 | Development tool only | No |
| pnpm | Workspace package manager | external tool | MIT | Required to install workspace | No |
| Turborepo | Workspace task runner | dev npm dependency | MIT | Development tool only | No |
| Vitest | Unit and integration tests | dev npm dependency | MIT | Development tool only | No |
| ESLint | Linting | dev npm dependency | MIT | Development tool only | No |
| Prettier | Formatting | dev npm dependency | MIT | Development tool only | No |
| Fastify | Local REST server | runtime npm dependency | MIT | Used by local-server | Yes, if server is packaged |
| @fastify/websocket | WebSocket plugin | runtime npm dependency | MIT | Used by local-server | Yes, if server is packaged |
| better-sqlite3 | SQLite storage binding | runtime npm dependency | MIT | Native dependency; review platform packaging before distribution | Yes, if server is packaged |
| ws | WebSocket integration tests | dev npm dependency | MIT | Test dependency only | No |
| @types/node | TypeScript node types | dev npm dependency | MIT | Development tool only | No |
| @types/ws | TypeScript ws types | dev npm dependency | MIT | Development tool only | No |
| @types/better-sqlite3 | TypeScript better-sqlite3 types | dev npm dependency | MIT | Development tool only | No |
| @playwright/test | Browser-level MVP-B smoke test and screenshot capture | dev npm dependency | Apache-2.0 | Development tool only; browser binaries are not bundled by LumaTrace packages in this milestone | No |
| Android SDK Platform Tools / adb | Optional external CLI for Android discovery, CPU/memory/battery/network sampling, and experimental 2D FPS probe commands | external cli | Android SDK License | Not bundled. Users install it separately from Android SDK Platform Tools. | No |

No external CLI binaries such as adb or PresentMon are bundled.
