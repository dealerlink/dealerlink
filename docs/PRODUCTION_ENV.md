# Production environment

> The Dealerlink **production** deployment on DigitalOcean App Platform
> (Bangalore). Stood up in Stage D Day D.0 (2026-05-26, 2 days ahead of the
> May 28 plan). This is the real
> pilot-facing environment — a **dedicated** DO project, separate from staging.
> Staging stays the validated reference / pilot preview and is unchanged.

## Status at D.0 close

Production is **functionally up**: app deployed, `/api/health` green, RLS
enforced, operator account seeded. It is **not yet fully observable** and has
**no real tenants** — those come later:

| Area                                            | State at D.0            | Lands in |
| ----------------------------------------------- | ----------------------- | -------- |
| App + DB + RLS + operator login                 | ✅ live                 | D.0      |
| `app.dealerlink.in` DNS + Let's Encrypt SSL     | ⏳ pending operator DNS | D.0/D.1  |
| Resend (outbound + inbound) + verified domain   | ⏳ blank (no-op)        | D.1      |
| Sentry / Better Stack / Axiom                   | ⏳ blank (no-op)        | D.1      |
| DO Spaces (`dealerlink-prod`)                   | ⏳ not provisioned      | D.1      |
| F-1 (Next.js ≥14.2.35) + F-3 (login rate-limit) | ⏳ deferred             | D.2      |
| Wildcard `*.dealerlink.in` SSL strategy         | ⏳ deferred             | D.3      |
| Backup/restore rehearsal + prod smoke           | ⏳ deferred             | D.3      |
| Real pilot tenant                               | ⛔ not seeded           | Stage E  |

## URLs

| Surface              | URL                                                    |
| -------------------- | ------------------------------------------------------ |
| App / operator login | https://app.dealerlink.in (SSL pending CNAME)          |
| Health check         | https://app.dealerlink.in/api/health                   |
| DO-provided origin   | https://dealerlink-production-8treh.ondigitalocean.app |

Tenant routing is by subdomain (`NEXT_PUBLIC_APP_DOMAIN=dealerlink.in`):
`<slug>.dealerlink.in` → tenant `<slug>`; `app`/`www`/`admin`/apex →
operator/login (reserved subdomains, `apps/web/lib/tenant/resolve.ts`). No real
tenant subdomains exist yet (Stage E).

## DNS + SSL — OPERATOR ACTION REQUIRED

The DO app already has `app.dealerlink.in` configured (phase `CONFIGURING`,
`verify-cname: RUNNING`). It is waiting for **one** Cloudflare DNS record. The
operator owns the Cloudflare zone and applies DNS by hand (Claude does not use
`wrangler`). Add, in the `dealerlink.in` zone:

| Type  | Name  | Target (content)                                 | Proxy           | TTL  |
| ----- | ----- | ------------------------------------------------ | --------------- | ---- |
| CNAME | `app` | `dealerlink-production-8treh.ondigitalocean.app` | **DNS only** 🔘 | Auto |

- **Gray-cloud (DNS only)** per the locked decision — do NOT orange-cloud/proxy.
- **Leave the existing `staging` and `*.staging` records untouched.**
- Do **NOT** add the `*` (wildcard) record yet — the wildcard SSL strategy is a
  D.3 decision (DO can't issue a true wildcard via HTTP-01 with Cloudflare
  gray-cloud DNS; STAGE_D_HANDOFF §6). There are no tenants to serve until
  Stage E anyway.

After the CNAME resolves, DO auto-provisions a Let's Encrypt cert via HTTP-01
(~5–15 min). Verify:

```
doctl apps get d8a25cb8-e4cb-4035-8413-6baab72398cd -o json | <inspect domains[].phase → ACTIVE>
curl -sI https://app.dealerlink.in/api/health     # expect 200 + valid cert
```

## Operator login smoke — OPERATOR ACTION (after SSL active)

1. Open https://app.dealerlink.in → operator login page loads.
2. Log in as `dealerlink.io@gmail.com` with the **temp password** printed by the
   D.0 operator seed (saved to the operator's password manager — it is NOT in
   this repo or any committed file).
3. You are forced to `/change-password` (C.1 / ADR-010). Set a strong password
   and save it.
4. Confirm redirect to the operator dashboard, then log out.

## Tenants & users

**None.** Production has no seed data beyond the operator account. The real
pilot tenant — real legal name, GSTIN, address, bank details, first admin user
with their real email — is provisioned by the operator through the admin app in
**Stage E** (`docs/RUNBOOKS.md` R1), and goes through force-password-change on
first login. The pilot's real credentials must never be committed (F-8).

The platform **operator** account:

| Field      | Value                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| Email      | `dealerlink.io@gmail.com`                                                  |
| Role       | `operator` (platform-level, `tenant_id IS NULL`)                           |
| Password   | temp set at D.0, `must_change_password=true` → operator's password manager |
| Reached at | `app.dealerlink.in` (apex/reserved → operator)                             |

## Infrastructure

| Resource      | Identifier                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| DO project    | `dealerlink-production` (`5ca8a796-ea50-478a-b9b1-021b9fc9fc1c`)                                                  |
| App           | `dealerlink-production` (`d8a25cb8-e4cb-4035-8413-6baab72398cd`)                                                  |
| Web component | `web` — **basic-xs** (1 GB), buildpack, `pnpm --filter web start`, :3000                                          |
| Workers       | `workers` — **basic-xs** (1 GB), Dockerfile (Chromium), no HTTP port                                              |
| Database      | `dealerlink-production-db` (`6e0f1d36-d651-44d0-a062-ddf82e844812`), PG 16, **db-s-1vcpu-2gb** (Basic 2 GB), BLR1 |
| DB name       | `dealerlink_production`                                                                                           |
| DB firewall   | locked to trusted source `app:d8a25cb8-…` (only the app connects)                                                 |
| Region        | BLR1 (Bangalore)                                                                                                  |
| Cost          | ~$54/month (web ~$12 + workers ~$12 + DB ~$30) — confirm on DO dash                                               |

**Sizing rationale (STAGE_D_HANDOFF §2, data-driven from C.5):** workers up from
staging `basic-xxs` (C5b OOM, DEV.67); web `DB_POOL_MAX=10` (DEV.61); DB Basic
2 GB (~50 conns) to back the pool bump. The three move together. Pool caps: web
10/5/2, workers 5/2/3.

**Pro-tier upgrade trigger:** sustained DB connections >40 OR memory >80% (DO
Monitoring). Don't pre-buy Pro for the pilot.

## Deploy + spec sync (DEV.64)

GitOps: pushes to `main` rebuild against the **stored** spec. The repo
`.do/app.production.yaml` is the human-readable source of truth but does **not**
auto-apply — apply spec changes manually, merged into the live spec to preserve
encrypted secrets:

```
APP=d8a25cb8-e4cb-4035-8413-6baab72398cd
doctl apps spec get $APP > live.yaml     # has encrypted EV[...] secrets
# edit live.yaml — apply ONLY the intended change, leave EV[...] untouched
doctl apps update $APP --spec live.yaml
```

Automating this (so repo + live spec can't diverge) is a **D.2** item.

## Secrets

Not in the repo. Local source of truth:
`C:\Users\rohit\.dealerlink\production-secrets.txt` (outside the repo tree).
The running app reads them from DO App Platform encrypted env vars. All are
**fresh** for production (none reused from staging). At D.0 the real values are:
`DATABASE_URL` (app role, RLS-enforced), `DATABASE_DIRECT_URL` (doadmin),
`SESSION_SECRET`, `RESEND_INBOUND_WEBHOOK_SECRET` (placeholder until D.1).
Sentry / Better Stack / Axiom / `RESEND_API_KEY` are blank (no-op) until D.1.

## Database bootstrap (how D.0 built it)

Dual-role RLS, mirroring staging (RLS is enforced — `DATABASE_URL` connects as
`dealerlink_app`, `NOSUPERUSER NOBYPASSRLS`):

```
# pre: create dealerlink_production + uuid-ossp/btree_gin (pg_trgm via migration 0004)
STAGING_BOOTSTRAP_PHASE=pre STAGING_DB_NAME=dealerlink_production \
  STAGING_ADMIN_DEFAULTDB_URL=<doadmin@…/defaultdb> \
  STAGING_ADMIN_TARGET_URL=<doadmin@…/dealerlink_production> \
  node packages/db/scripts/staging-db-bootstrap.mjs
# migrate (16) + RLS + triggers, then rotate the app-role password
DATABASE_DIRECT_URL=<doadmin@…/dealerlink_production> pnpm --filter @dealerlink/db db:migrate
STAGING_BOOTSTRAP_PHASE=finalize STAGING_DB_NAME=dealerlink_production \
  STAGING_ADMIN_TARGET_URL=<doadmin@…/dealerlink_production> \
  STAGING_APP_PASSWORD=<app-pw> node packages/db/scripts/staging-db-bootstrap.mjs
# operator-ONLY seed (no demo/sample tenants), then verify RLS
PROD_OPERATOR_EMAIL=dealerlink.io@gmail.com \
  DATABASE_DIRECT_URL=<doadmin@…/dealerlink_production> \
  pnpm --filter @dealerlink/db exec tsx scripts/seed-production-operator.ts
PROD_APP_URL=<dealerlink_app@…/dealerlink_production> node packages/db/scripts/prod-db-rls-smoke.mjs
```

> Production DB is firewalled to the app. To run the above from a local machine,
> temporarily add this machine's IP: `doctl databases firewalls append <db-id>
--rule ip_addr:<ip>`, then remove it.

## Backups

DO Managed Postgres includes daily automated backups. Confirm ≥7-day retention

- enable PITR, and **rehearse a restore to a fresh DB in D.3** (an untested
  backup is not a backup). Targets: RTO ≤ 1 h, RPO ≤ 24 h (≤ minutes with PITR).

## Billing alerts — OPERATOR ACTION

DO billing-amount alerts are **account-level** (Billing → Billing alerts in the
DO cloud UI) — they cannot be scoped per project or set via `doctl`. Set email
alerts at **$50 / $100 / $200** to the operator. (The `dealerlink-production`
project gives per-project cost _visibility_, but not separate billing _alerts_.)

## Known limitations at D.0 close

- SSL on `app.dealerlink.in` pending the operator's Cloudflare CNAME.
- Outbound email no-op (no Resend key); observability dashboards not wired (D.1).
- No wildcard SSL — tenant subdomains deferred to D.3 (none needed until Stage E).
- `version` in `/api/health` reports `dev` (no git SHA injected — D.1 sets SENTRY_RELEASE).
- F-1 (Next.js upgrade) + F-3 (login rate-limit) not yet applied (D.2).
- Reserved-slug rejection not enforced on tenant creation (DEV.73 — D.2).
