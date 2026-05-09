# Contributing to LumaTrace

Thanks for helping improve LumaTrace. This project is a clean-room,
local-first performance testing tool. Contributions should keep the app honest,
safe, and understandable for ordinary users.

English is the primary language for issues, pull requests, code comments, and
technical documentation. Chinese is welcome for user-facing explanations,
bug reports, and companion documentation when it helps users understand the
project.

## Development Setup

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm dev:server
pnpm dev:desktop
```

For the Tauri desktop host, install Rust/Cargo and the Tauri CLI first, then run:

```bash
pnpm detect:tauri-toolchain
pnpm check:tauri
pnpm dev:tauri
```

## Contribution Rules

- Do not copy commercial tool code, UI, icons, wording, protocols, or private behavior.
- Do not add cloud upload or privacy-sensitive logging by default.
- Do not fake unavailable metrics. Show N/A or an honest availability reason.
- Keep metrics tagged with source, precision, confidence, and availability.
- Keep external commands behind the shared CommandRunner abstraction.
- Keep permissions minimal. Do not bypass platform security controls.
- Add fixture-backed parser tests for new parsers.
- Run lint, tests, and typecheck before opening a pull request.

## Pull Request Checklist

- [ ] The change is scoped and documented.
- [ ] Tests were added or updated where behavior changed.
- [ ] `pnpm test` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.
- [ ] Generated artifacts, logs, local databases, and secrets are not committed.
