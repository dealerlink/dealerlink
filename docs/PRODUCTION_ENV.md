# Production environment

> The Dealerlink **production** deployment on DigitalOcean App Platform
> (Bangalore). Stood up in Stage D Day D.0 (2026-05-26, 2 days ahead of the
> May 28 plan). This is the real
> pilot-facing environment — a **dedicated** DO project, separate from staging.
> Staging stays the validated reference / pilot preview and is unchanged.

## Status (updated D.2, 2026-05-29)

Production is **functionally up and observable**: app deployed, `/api/health`
green (incl. `resend: ok`), RLS enforced, operator account seeded, SSL live,
and all third-party observability + outbound email wired with **fresh**
production credentials. It has **no real tenants** — those come in Stage E.

**D.2 progress (2026-05-29).** Migration **`0016_true_doctor_faustus`**
(F-3 `users.failed_login_attempts` + `users.lockout_until` columns) applied
to production via the R17 whitelist-migrate-remove sequence:
`/api/health` reports `migrations.applied: 17`, `rls.status: ok`,
`db.latencyMs: 3`. **17 migrations applied / 17 on disk.** Firewall
rule for the operator IP added + removed within the same window; only the
`type: app` rule for the production app's own UUID remains. The F-3 + F-1

- DEV.73 application code is committed locally on `main` (3 commits ahead
  of `origin/main`) and not yet pushed — the deploy is a separate operator-
  authorized step.

| Area                                            | State                                       | Lands in |
| ----------------------------------------------- | ------------------------------------------- | -------- |
| App + DB + RLS + operator login                 | ✅ live                                     | D.0      |
| `app.dealerlink.in` DNS + Let's Encrypt SSL     | ✅ live (HTTPS 200)                         | D.0/D.1  |
| Resend outbound (verified domain + sending key) | ✅ live (`resend: ok`)                      | D.1      |
| Resend inbound webhook + MX                     | ⏳ deferred (needs MX setup)                | D.3      |
| Sentry / Axiom                                  | ✅ wired (fresh prod creds)                 | D.1      |
| Better Stack uptime monitor / log shipping      | ✅ uptime live / ⏳ shipping off (DEV.79)   | D.1/D.2  |
| DO Spaces (`dealerlink-prod`)                   | ⏭️ skipped (see below)                      | (future) |
| F-1 (Next.js ≥14.2.35) + F-3 (login rate-limit) | ⏳ DB ready, code unpushed                  | D.2      |
| Wildcard `*.dealerlink.in` SSL                  | ✅ live (Option A, CNAME-validated)         | D.3      |
| Backup/restore rehearsal                        | ✅ done (RTO ~6 min, see DISASTER_RECOVERY) | D.3      |
| Prod single-tenant smoke                        | ⏳ in progress (PART 3)                     | D.3      |
| Real pilot tenant                               | ⛔ not seeded                               | Stage E  |

> **DO Spaces skipped at D.1 (operator decision).** Not provisioned.
> `apps/workers/src/pdf/store.ts` flips to the Spaces path the instant
> `DO_SPACES_KEY`+`_SECRET`+`_BUCKET` are all set, but `uploadToSpaces()` is an
> unimplemented stub that throws (DEV.16) — wiring it would break **every**
> production PDF render. PDFs stay on the working inline (base64-in-row) path.
> Activation waits until `uploadToSpaces()` is implemented (gated on F-9 logo
> validation). Do not set the Spaces env vars until that code lands.

## URLs

| Surface              | URL                                                    |
| -------------------- | ------------------------------------------------------ |
| App / operator login | https://app.dealerlink.in (✅ live, HTTPS 200)         |
| Health check         | https://app.dealerlink.in/api/health                   |
| DO-provided origin   | https://dealerlink-production-8treh.ondigitalocean.app |

Tenant routing is by subdomain (`NEXT_PUBLIC_APP_DOMAIN=dealerlink.in`):
`<slug>.dealerlink.in` → tenant `<slug>`; `app`/`www`/`admin`/apex →
operator/login (reserved subdomains, `apps/web/lib/tenant/resolve.ts`). No real
tenant subdomains exist yet (Stage E).

## DNS + SSL — ✅ LIVE (resolved by D.1, 2026-05-27)

`app.dealerlink.in` serves HTTPS 200 — the operator added the Cloudflare CNAME
and DO issued the cert. `curl -sI https://app.dealerlink.in/api/health` → 200
with a valid certificate. The record added (operator-owned Cloudflare zone):

| Type  | Name  | Target (content)                                 | TTL  |
| ----- | ----- | ------------------------------------------------ | ---- |
| CNAME | `app` | `dealerlink-production-8treh.ondigitalocean.app` | Auto |

The cert is **DO-managed**: `CN=app.dealerlink.in`, SAN `app.dealerlink.in` only
(single-domain, **not** wildcard), issuer **Google Trust Services WE1**, 90-day,
auto-renewed.

> ✅ **Resolved at the pre-D.2 DNS diagnostic (2026-05-28, DEV.78) — the D.1
> "orange-cloud" flag is cleared.** The `app` record is **gray-cloud (DNS-only)**,
> which is **correct**. `app.dealerlink.in` does resolve to Cloudflare edge IPs
> and responses carry `__cf_bm`/`CF-RAY` — but that is because the
> `…ondigitalocean.app` origin is **itself** Cloudflare-fronted by DO App Platform
> (verified: the bare DO origin resolves to the same Cloudflare IPs independent of
> our zone). Those edge signals therefore appear on gray-cloud too and do **not**
> indicate our-zone proxying. **No change needed.** Full architecture + the D.3
> wildcard-SSL plan are documented authoritatively in `STAGE_D_HANDOFF.md` §6 (not
> duplicated here); the prior "Cloudflare proxied origin cert" option is now
> **rejected** (it would double-proxy DO's own Cloudflare).

- **Leave the existing `staging` and `*.staging` records untouched.**
- ✅ **Wildcard `*.dealerlink.in` is now live (D.3, 2026-05-31).** Cloudflare has
  a `*` CNAME → `dealerlink-production-8treh.ondigitalocean.app` (gray-cloud,
  DNS-only); DO has `dealerlink.in` registered as `type: ALIAS`, `wildcard: true`
  on the prod app. DO validated via the CNAME (Option A — **no TXT** needed). The
  wildcard cert (Let's Encrypt, SAN `*.dealerlink.in, dealerlink.in`, → Aug 19 2026) serves any `<slug>.dealerlink.in`. Renewal is automatic (R19). Apex A
  record (marketing) untouched. **No per-tenant DNS/cert work** for Stage E.
- DMARC added at D.1: `_dmarc.dealerlink.in` TXT
  `v=DMARC1; p=quarantine; rua=mailto:dmarc@dealerlink.in; pct=100`
  (`dmarc@` has no mailbox yet → reports not collected; harmless, the policy
  still applies; add a report mailbox post-pilot).

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
**fresh** for production (none reused from staging). As of **D.1** all secrets
are populated (injected via `doctl apps update --spec`, replacing the D.0
empty-string placeholders, leaving `DATABASE_URL`/`DATABASE_DIRECT_URL`/
`SESSION_SECRET`/`RESEND_INBOUND_WEBHOOK_SECRET` untouched):

- `DATABASE_URL` (app role, RLS-enforced) · `DATABASE_DIRECT_URL` (doadmin) ·
  `SESSION_SECRET` — set at D.0.
- `RESEND_API_KEY` — **sending-only** prod key (least-privilege; not staging's).
  `RESEND_FROM_EMAIL=noreply@dealerlink.in` (verified domain).
- `SENTRY_DSN` — **two distinct projects**: web=`dealerlink-web-production`,
  workers=`dealerlink-workers-production` (same env var name, different value
  per component). `NEXT_PUBLIC_SENTRY_DSN` (web) = the web DSN.
- `BETTERSTACK_SOURCE_TOKEN` — prod source `dealerlink-production`.
- `AXIOM_TOKEN` + `AXIOM_DATASET=dealerlink-production` (renamed from
  `dealerlink-prod-events` at D.1 for naming consistency; spec + docs updated).
- `RESEND_INBOUND_WEBHOOK_SECRET` — D.0 placeholder retained; the real Svix
  secret is set when the inbound webhook is configured (deferred to D.3 — needs
  MX on the inbound domain).

## Observability + Email (D.1, 2026-05-27)

All three SDKs degrade to no-ops without credentials (Day 17 contract); D.1
populated them with **fresh** production values. None reused from staging.

| Service          | Production resource                                                                                    | Notes                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **Sentry (web)** | project `dealerlink-web-production` (Next.js)                                                          | errors 100%, `tracesSampleRate` 0.1 (10% perf), `beforeSend` PII scrub, no PII       |
| **Sentry (wk)**  | project `dealerlink-workers-production` (Node.js)                                                      | per-job capture; same scrubber                                                       |
| **Better Stack** | uptime monitor on `/api/health` (source `dealerlink-production` exists; log shipping disabled, DEV.79) | **3 min interval (free-tier max)**, expect 200, alert on 2 failures → operator email |
| **Axiom**        | dataset `dealerlink-production` (**US** org), 30-day retention                                         | structured business events; region fixed in D.1 follow-up (DEV.75)                   |
| **Resend**       | domain `dealerlink.in` **verified** (send-subdomain scheme)                                            | sending-only key; from `noreply@dealerlink.in`; DKIM/SPF live, DMARC quarantine      |

**Resend domain** was already verified on Resend's current `send.`-subdomain
scheme (DKIM `resend._domainkey`, `send.dealerlink.in` MX → AWS SES feedback +
SPF) — verified once per Resend account, shared from staging. Do **not** add a
root `include:_spf.resend.com` SPF (old scheme; would conflict).

**`/health` resend check** reports `ok`: the sending-only key can't read
`/domains` (Resend returns `401 restricted_api_key`), and the check now treats
that exact signal as healthy (DEV.74) — least-privilege preserved.

**Verification status:** `/api/health` `resend: ok` confirmed post-deploy
(by Claude). Web Sentry via the operator-gated `/api/internal/sentry-test`.

### D.1 smoke tests — RESOLVED (D.1 follow-up, 2026-05-28)

The D.1 post-deploy smoke surfaced four items; all are now resolved (see
DEV.75 / DEV.76 / DEV.77):

- **Axiom was receiving zero events** — root cause: the dataset was created in
  Axiom's **EU** data region while the ingest token was a **US** token, so every
  SDK ingest 400'd and was silently swallowed. **Fixed:** dataset recreated in
  the **US** org + fresh token (old one revoked); new token verified ingesting
  (`200 {"ingested":1}`). Client hardened with a loud `onError` + optional
  `AXIOM_URL` (DEV.75). **Operator follow-through:** the new `AXIOM_TOKEN` must
  be mirrored into the DO App Platform env on both components.
- **Better Stack frequency** documented as 30s/60s but the free tier caps at
  **3 min** — docs corrected (DEV.76).
- **Better Stack response-time spikes** (~1.2 s) — benign measurement latency
  from `/api/health`'s own Resend ping; cold-start ruled out. Monitor location
  switched to **Asia/Singapore** (DEV.76).
- **Sentry workers project untested** — verified with a temporary
  throw-on-purpose job; error captured + PII-clean; diagnostic endpoint removed
  (DEV.77).

### Better Stack response-time spikes (D.1 smoke finding)

The uptime monitor shows a ~150 ms baseline with periodic spikes to ~1.2 s.
Diagnosis (DEV.76):

- **Cold-start: ruled out.** Both `web` and `workers` run `instance_count: 1`
  (no scale-to-zero) in the production spec — there is no pod to cold-start.
- **Most likely cause:** `/api/health` itself makes an external, cross-region
  `fetch` to `https://api.resend.com/domains` on every poll (the `resendCheck`
  liveness probe, 3 s budget) and its reported `responseMs` **includes** that
  call. A fresh TLS handshake from BLR1 → Resend (US/EU) occasionally taking
  ~1 s produces exactly these isolated spikes on an otherwise fast baseline.
  So the spikes are measurement latency, not app latency — the endpoint still
  returns 200/`ok`, bounded at 3 s. We do **not** remove the Resend ping (it is
  the intended liveness signal per DEV.74).
- **Contributing cause + operator action:** the Better Stack monitor checks
  from a distant region (EU/US) vs. the BLR1 app — the ~150 ms baseline is the
  India↔Europe RTT. Operator should switch the monitor location to
  **Asia/Singapore** in the Better Stack UI to shrink both the baseline and the
  spike envelope. Residual occasional spikes (a handful/day) are acceptable
  network variance.

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

DO Managed Postgres includes daily automated backups. ✅ **Verified +
rehearsed in D.3 (2026-05-31):** 6 daily backups present (~7-day rolling
window); PITR available via `--restore-from-timestamp`; a full restore to a
throwaway fork was proven (online in ~6 min, 17 migrations + operator user
intact) then destroyed — production untouched. **Measured RTO ~6 min** (well
under the ≤ 1 h target); RPO ≤ 24 h (≤ minutes with PITR). Full procedure +
proof: `docs/DISASTER_RECOVERY.md` and `docs/RUNBOOKS.md` R20.

## Billing alerts — OPERATOR ACTION

DO billing-amount alerts are **account-level** (Billing → Billing alerts in the
DO cloud UI) — they cannot be scoped per project or set via `doctl`. Set email
alerts at **$50 / $100 / $200** to the operator. (The `dealerlink-production`
project gives per-project cost _visibility_, but not separate billing _alerts_.)

## Known limitations (after D.1)

- ~~SSL pending CNAME~~ — ✅ resolved D.1 (HTTPS 200). Note: `app` is currently
  orange-cloud proxied (see DNS+SSL above) — flagged for the D.3 decision.
- ~~Outbound email no-op; observability not wired~~ — ✅ resolved D.1 (all
  populated; `resend: ok`). Inbound email webhook still deferred (needs MX → D.3).
- `version` in `/api/health` still reports `dev` — `SENTRY_RELEASE` is **not**
  set. A static spec value would go stale on every push-triggered rebuild;
  proper build-time git-SHA injection belongs with the DEV.64 spec-sync
  automation (D.2). Deferred (low value; errors are still grouped by Sentry).
- DO Spaces not provisioned — deferred until `uploadToSpaces()` is implemented
  (would break PDF rendering today; see Status note above + DEV.16).
- ~~No wildcard SSL yet~~ — ✅ **resolved D.3 (2026-05-31).** `*.dealerlink.in`
  serves a valid wildcard cert (Option A, DO-managed, CNAME-validated — no TXT).
  Any tenant subdomain works with no per-tenant spec edit. See `STAGE_D_HANDOFF.md`
  §6 and `docs/RUNBOOKS.md` R19 (renewal).
- F-1 (Next.js upgrade) + F-3 (login rate-limit) not yet applied (D.2).
- Reserved-slug rejection not enforced on tenant creation (DEV.73 — D.2).
