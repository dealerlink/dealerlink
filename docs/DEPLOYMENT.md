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

- `apps/web` → DO App Platform service (1 GB / 1 vCPU initially), Node buildpack
- `apps/workers` → second component on same App Platform, **built from a
  Dockerfile** (not the Node buildpack)
- Postgres → DO Managed Postgres ($15 tier)
- Migrations run automatically on deploy via `predeploy` hook
- Environment variables managed in DO dashboard; never commit `.env` files

### DNS + custom domains (DO-Cloudflare)

DNS lives in an operator-owned Cloudflare zone (`dealerlink.in`); the operator
applies records by hand (Claude does not use `wrangler`). App records are
**gray-cloud (DNS-only)** CNAMEs to the `…ondigitalocean.app` origin — which is
itself Cloudflare-fronted by DO App Platform, so app traffic is Cloudflare-edged
and DO-cert-terminated (issuer Google Trust Services, auto-renewed) **without**
our own proxy. Do **not** flip app records to orange-cloud — that double-proxies
DO's own Cloudflare. Production tenant subdomains (`<slug>.dealerlink.in`) need a
`*.dealerlink.in` wildcard cert (D.3). **The authoritative DNS architecture +
the wildcard-SSL plan live in `STAGE_D_HANDOFF.md` §6 (DEV.78)** — keep this
section a pointer, not a second copy.

### The workers component requires a Dockerfile (DEV.63)

PDF generation runs in the workers process via Puppeteer +
`@sparticuz/chromium`. That Chromium binary dynamically links system libraries
(`libnss3`, `libgbm1`, fonts, …) that the App Platform **Node buildpack base
image does not provide** — Chromium fails to launch with
`libnss3.so: cannot open shared object file`. Buildpacks cannot
`apt-get install`, so the workers component is built from
`apps/workers/Dockerfile` (glibc `node:20-bookworm-slim` + the Chromium
runtime libs). In `.do/app.yaml` the workers component sets
`dockerfile_path: apps/workers/Dockerfile` instead of `build_command` /
`run_command`. The web component stays on the buildpack — it enqueues a
`render-pdf` pg-boss job and never launches Chromium.

`PDF_RENDER_TIMEOUT_MS` (web component, default 15000) bounds how long a PDF
Server Action waits for the worker to render before returning a retryable
error; staging uses `30000` for cold-Chromium headroom on the basic-xxs
worker.

### `.do/app.yaml` is documentation — apply it with `doctl` (DEV.64)

**Editing `.do/app.yaml` in the repo and pushing does NOT update the running
app.** DO App Platform stores its own copy of the spec; `deploy_on_push`
rebuilds the latest commit against the _already-stored_ spec. **Every
`.do/app.yaml` change MUST be followed by a spec apply, or the change is
illusory** (this is how the DEV.63 Dockerfile switch silently no-op'd at first).

Because the committed `.do/app.yaml` ships **blank `SECRET` values** (real
values live only in DO), do not apply it directly — that risks wiping live
secrets. Instead merge your change into the live spec, which round-trips the
encrypted secrets:

```bash
APP=<app-id>                          # doctl apps list
doctl apps spec get $APP > live.yaml  # contains encrypted EV[...] secrets
# edit live.yaml: apply ONLY your intended change (e.g. workers build method,
# a new env) — leave every EV[...] value untouched
doctl apps update $APP --spec live.yaml
```

Notes:

- `doctl apps spec validate` will reject a round-tripped spec ("secret env value
  must not be encrypted before app is created") — it validates against the
  new-app `/propose` path. This is expected; `apps update` accepts encrypted
  secrets on an existing app.
- Keep `.do/app.yaml` updated too — it's the human-readable source of truth and
  the diff reviewers read. Repo file and live spec drift silently otherwise.
- Stage D: automate the apply (post-push CI step or DO's spec-sync GitHub
  Action) so repo and live spec cannot diverge.

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
