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
DATABASE_DIRECT_URL=          # for migrations (bypass connection pool)
SESSION_SECRET=
RESEND_API_KEY=
RESEND_INBOUND_WEBHOOK_SECRET=
DO_SPACES_KEY=
DO_SPACES_SECRET=
DO_SPACES_BUCKET=
DO_SPACES_REGION=blr1
SENTRY_DSN=
AXIOM_TOKEN=
AXIOM_DATASET=dealerlink
NEXT_PUBLIC_APP_URL=
```
