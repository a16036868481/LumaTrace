# Third-Party Licenses

This is an MVP-A license inventory. A stricter automated license checker is planned for Milestone 4.

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

No external CLI binaries such as adb, xcrun, ideviceinfo, or PresentMon are bundled.
