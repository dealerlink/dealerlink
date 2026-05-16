# Deployment

> **Scope:** Local dev bootstrap, DigitalOcean App Platform setup, and required env vars. Back to [CLAUDE.md](../CLAUDE.md).

## Local dev

```bash
pnpm install
pnpm db:up            # docker-compose with postgres
pnpm db:migrate
pnpm db:seed
pnpm dev              # runs apps/web
pnpm dev:workers      # in another terminal
```

## Production (DO App Platform)

- `apps/web` → DO App Platform service (1 GB / 1 vCPU initially)
- `apps/workers` → second component on same App Platform OR separate $6 Droplet with pm2
- Postgres → DO Managed Postgres ($15 tier)
- Migrations run automatically on deploy via `predeploy` hook
- Environment variables managed in DO dashboard; never commit `.env` files

## Required env vars

```
DATABASE_URL=
DATABASE_DIRECT_URL=          # migrations + pg-boss (bypass connection pool)
SESSION_SECRET=
RESEND_API_KEY=
RESEND_INBOUND_WEBHOOK_SECRET=  # required — Svix signing secret from the Resend webhook endpoint
RESEND_FROM_EMAIL=              # default From address for outbound mail
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_BUCKET=
DO_SPACES_REGION=blr1
SENTRY_DSN=                     # server-only DSN (web server + workers)
NEXT_PUBLIC_SENTRY_DSN=         # browser DSN (inlined into the client bundle)
SENTRY_ENVIRONMENT=
SENTRY_RELEASE=                 # git SHA — also surfaced as /health `version`
BETTERSTACK_SOURCE_TOKEN=       # structured-log ingestion; unset → stdout only
AXIOM_TOKEN=
AXIOM_DATASET=dealerlink-events
NEXT_PUBLIC_APP_URL=
```

`RESEND_INBOUND_WEBHOOK_SECRET` is **server-only** — never expose it via a
`NEXT_PUBLIC_*` variable. The web process enqueues email and the workers
process sends it; both connect pg-boss on `DATABASE_DIRECT_URL`, so that var
must be set for **both** components.

Every observability SDK (Sentry, Better Stack, Axiom) **gracefully no-ops when
its env vars are unset** — dev and CI run without any of them configured.

## Observability

Day 17 wired three telemetry surfaces; all are additive and degrade safely.

- **Sentry** — error capture for the browser, the web server, and the workers
  process. Every event is PII-scrubbed in `beforeSend` and tagged with
  tenant / user / route. Create projects `dealerlink-web` and
  `dealerlink-workers`; set `SENTRY_DSN` (server) + `NEXT_PUBLIC_SENTRY_DSN`
  (browser). `SENTRY_AUTH_TOKEN` is only needed at build time for source-map
  upload.
- **Better Stack (logs)** — structured `pino` logs ship here in production
  when `BETTERSTACK_SOURCE_TOKEN` is set; otherwise they go to stdout and DO
  Logs collects them. Dev uses `pino-pretty`.
- **Axiom** — business-event analytics (`dealerlink-events` dataset).

### Better Stack uptime monitor

Configured in the Better Stack UI (no code) — it pings the enriched
`/health` endpoint:

| Setting         | Value                                           |
| --------------- | ----------------------------------------------- |
| URL             | `https://app.dealerlink.in/api/health`          |
| Check frequency | **60 seconds**                                  |
| Request timeout | 5 seconds                                       |
| Confirmation    | **3 strikes** before alerting (avoids flapping) |
| Expected status | `200` (the route returns `503` when unhealthy)  |
| Recovery        | auto-resolve on the next `200`                  |

`/health` returns `200` for `ok` **and** `degraded` (still serving traffic)
and `503` only for `down`, so a 3-strike `5xx` rule alerts on genuine
outages, not transient degradation. See `docs/RUNBOOKS.md` for alert
thresholds.
