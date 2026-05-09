# Local Server Sidecar Binaries

`pnpm build:sidecar` writes the development sidecar wrapper and `sidecar-manifest.json` here.

`pnpm build:self-contained-sidecar` writes the current self-contained draft: a target-triple sidecar wrapper, bundled Node.js runtime, deployed local-server app directory, `packaging-notices.json`, and `THIRD-PARTY-NOTICES.md`.

Milestone 4B uses sidecar manifests to validate target triple, artifact hash, artifact size, Node runtime requirement, packaging notice hashes, and production readiness. The current self-contained draft does not require system Node, but `productionReady` remains `false` until signing, installer QA, license notice review, and release smoke are complete.
