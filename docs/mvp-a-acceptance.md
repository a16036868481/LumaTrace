# MVP-A Acceptance

## Automated Acceptance

- [ ] `pnpm install`
- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm smoke:mvp-a`
- [ ] `pnpm verify:mvp-a`

## Service Acceptance

- [ ] `pnpm dev:server`
- [ ] `GET /api/health`
- [ ] `GET /api/devices`
- [ ] `GET /api/devices/:id/targets`
- [ ] `POST /api/sessions`
- [ ] `POST /api/sessions/:id/start`
- [ ] `WS /api/sessions/:id/stream`
- [ ] `POST /api/sessions/:id/markers`
- [ ] `GET /api/sessions/:id/metrics`
- [ ] `POST /api/sessions/:id/stop`
- [ ] `GET /api/sessions/:id/report`
- [ ] `GET /api/sessions/:id/export?format=json`
- [ ] `GET /api/sessions/:id/export?format=csv`
- [ ] `GET /api/sessions/:id/export?format=html`

## Data Truth Acceptance

- [ ] Every mock metric has `source: "mock"`.
- [ ] Every metric has `precision`.
- [ ] Every metric has `confidence`.
- [ ] Missing metrics are not filled with zero.
- [ ] Unavailable metrics do not generate fake `MetricEvent` records.
- [ ] Reports state limitations.

## MVP-A Complete When

All automated checks pass and the smoke script completes the backend loop from session creation to report/export without real devices or real platform tools.
