# Stage D — Production Deployment Prompts

Stage D runs from May 28 to May 31, 2026. Goal: provision production environment, harden against deferred Stage C findings, and prepare for pilot tenant onboarding in Stage E.

**Pilot live target:** Wednesday, June 3, 2026.
**Authoritative scope:** `docs/STAGE_D_HANDOFF.md` (generated at Stage C close).

## Schedule

| Day           | Date           | Focus                                                           | Status      |
| ------------- | -------------- | --------------------------------------------------------------- | ----------- |
| **D.0**       | **Thu May 28** | **Production environment provisioning + DB + initial deploy**   | **Current** |
| D.1           | Fri May 29     | Production secrets + Resend domain verification + observability | ⏳          |
| D.2           | Sat May 30     | F-1 (Next.js upgrade) + F-3 (rate limit) + DEV.64 sync workflow | ⏳          |
| D.3           | Sun May 31     | Production smoke test + pilot dry run + final validation        | ⏳          |
| Buffer        | —              | 1 day of slack absorbed into schedule                           | —           |
| Stage E start | Mon Jun 1      | Pilot tenant provisioning                                       | —           |

## Locked Decisions Before D.0 Starts

These are operator-confirmed and override the original STAGE_D_HANDOFF.md recommendations where they conflict:

### Domain pattern

- Root: `dealerlink.in` — parked or redirects to www
- Marketing: `www.dealerlink.in` — Phase 2, can be parked initially
- Operator login: `app.dealerlink.in`
- Tenant subdomains: `<tenant>.dealerlink.in` (single-level, NOT `<tenant>.app.dealerlink.in`)
- Reserved words list (cannot be tenant slugs): `app`, `www`, `api`, `admin`, `blog`, `docs`, `status`, `mail`, `staging`

### SSL approach

- Same pattern as staging — Cloudflare DNS-only (gray-cloud) + Let's Encrypt via DO App Platform
- Wildcard cert: `*.dealerlink.in`
- No Cloudflare proxying for pilot (revisit post-pilot if threat surface justifies it)

### Production sizing (the coupled decision from C.5)

- Workers: basic-xs (1 GB, ~$12/mo) — up from staging's basic-xxs (512 MB) per C.5 OOM finding
- Web: basic-xs (~$12/mo) — same as staging
- DB: Basic 2 GB tier ($30/mo, ~50 connections) — up from staging's Basic 1 GB
- Web DB_POOL_MAX env: 10 (up from staging's 2 per DEV.61)
- **Total production: ~$54/month**
- Upgrade trigger to Pro tier DB: sustained connections >40 OR memory >80%

---

## Stage D Day D.0 — Production Environment Provisioning (Current — Thursday May 28)

**Goal:** Provision a dedicated production DO project + DB + App Platform with the new sizing decisions. Deploy current `main` branch (with full Stage C validation) to production. Verify health, basic flows, and rollback path. No real customer data, no real Resend, no pilot tenant yet.

**Estimated time:** 4-5 hours

**Deliverable:** `https://app.dealerlink.in/api/health` returns 200 with all checks green. Production is reachable, secure, sized per the C.5 decision, but with placeholder secrets (Resend/observability) — those land in D.1.

### Prompt for Claude Code

```
You are implementing Stage D Day D.0 of the Dealerlink build. Stage C closed on tag stage-c-complete (commit 457fc56). 6 days of validation shipped. Pilot live target: Wednesday June 3.

Today provisions production environment on DO App Platform. This is similar to Stage C Day C.0 (staging deploy) but with production-grade sizing and a separate DO project.

PRELIMINARY:
P.1. `pnpm preflight` confirms 17 green checks against local dev DB. Today's work is provisioning + configuration; minimal code changes.
P.2. Read docs/STAGE_D_HANDOFF.md (the authoritative Stage D scope doc generated at C.5 close).
P.3. Read docs/DEPLOYMENT.md (the runbook from C.0; production is similar with sizing differences).
P.4. Read .do/app.yaml — current staging spec; production uses similar structure with different sizing.
P.5. Read apps/workers/Dockerfile — same Dockerfile applies to production.
P.6. Read C:\Users\rohit\.dealerlink\staging-secrets.txt for reference on what secrets need production equivalents.

PRIMARY REFERENCES:
1. docs/STAGE_D_HANDOFF.md (authoritative)
2. docs/DEPLOYMENT.md (runbook from C.0)
3. The locked decisions above (domain pattern, SSL approach, sizing)
4. doctl (authenticated as dealerlink.io@gmail.com — verified Stage C)

==========================================================
TRACK A — PRODUCTION DEPLOY (CHUNKED — 4 chunks)
==========================================================

CHUNK D0a — DO production project + Managed Postgres
---------------------------------

A1.1. Create a new DO project for production isolation:
   - Name: dealerlink-production
   - Purpose: dedicated production project (separate from staging)
   - This separates billing alerts, access controls, and resource visibility
   - Run: `doctl projects create --name dealerlink-production --purpose "Dealerlink production environment"`

A1.2. Provision DO Managed Postgres for production:
   - Name: dealerlink-production-db
   - Engine: PostgreSQL 16
   - Region: BLR1 (Bangalore)
   - Size: db-s-1vcpu-2gb (Basic 2 GB, ~$30/mo) — UP from staging's 1 GB per C.5 sizing decision
   - Nodes: 1
   - Run: `doctl databases create dealerlink-production-db --engine pg --version 16 --region blr1 --size db-s-1vcpu-2gb --num-nodes 1`
   - Show me the command BEFORE running so I can confirm (~$30/mo spend).

A1.3. After cluster ACTIVE:
   - Create the named DB inside: `doctl databases db create <cluster-id> dealerlink_production`
   - Get connection details: `doctl databases connection <cluster-id>`
   - Save these to C:\Users\rohit\.dealerlink\production-secrets.txt (gitignored, outside repo per Stage C pattern)

A1.4. Set up extensions:
   - Connect via psql: `psql "<connection-string>"`
   - Run: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gin;`
   - Verify all 3 loaded

A1.5. Generate production secrets (separate from staging):
   - LUCIA_SESSION_SECRET — fresh 32-byte base64 (do NOT reuse staging's)
   - RESEND_INBOUND_WEBHOOK_SECRET — fresh (do NOT reuse staging's)
   - All others remain placeholders for D.1 (SENTRY_DSN, BETTERSTACK_SOURCE_TOKEN, AXIOM_TOKEN, AXIOM_DATASET, RESEND_API_KEY)
   - DATABASE_URL — from A1.3
   - NEXT_PUBLIC_APP_URL — https://app.dealerlink.in
   - DB_POOL_MAX — 10 (UP from staging's 2 per DEV.61 production sizing)
   - NODE_ENV — production
   - TZ — Asia/Kolkata
   - PDF_RENDER_TIMEOUT_MS — 120000 (same as staging)
   - PDF_EAGER_WARM — true (same as staging)
   - Add all to /production-secrets.txt

A1.6. Apply migrations to production DB:
   - From local: `DATABASE_URL=<prod-connection-string> pnpm --filter @dealerlink/db db:migrate`
   - Confirm all migrations apply (count should match staging — currently 16)
   - Verify with: `SELECT COUNT(*) FROM drizzle.__drizzle_migrations;`

A1.7. SEED CAREFULLY:
   - Production should NOT have demo + sample tenants like staging does
   - Should only have the operator user (operator@dealerlink.test or your operator email)
   - Create scripts/seed-production-operator.ts that ONLY seeds the operator account
   - Operator email: confirm with operator before seeding — should be a real email they monitor (dealerlink.io@gmail.com or similar)
   - Set must_change_password=true for the operator's first login (forced rotation per ADR-010 + C.1)
   - Generate a temp password, log to console (operator copies it for first login)
   - Run: `DATABASE_URL=<prod-connection-string> pnpm --filter @dealerlink/db tsx scripts/seed-production-operator.ts`

A1.8. Lock down DB firewall:
   - Initially open during provisioning (same as staging pattern)
   - Will lock down to App Platform UUID in D0b after app exists

COMMIT D0a: `chore(prod): provision DO production project + Postgres + operator seed`

CHUNK D0b — DO App Platform production spec + first deploy
---------------------------------

A2.1. Create .do/app.production.yaml (NOT replacing staging's .do/app.yaml):
   - Two components:
     - web: apps/web
       - Source: github repo, branch main
       - Build: buildpack (same as staging)
       - Run: pnpm --filter web start
       - HTTP port: 3000
       - Instance size: basic-xs ($12/month) — same as staging
       - Instance count: 1 initially
       - Health check: /api/health, 30s interval
     - workers: apps/workers
       - Source: same repo
       - Dockerfile: apps/workers/Dockerfile (custom Dockerfile per ADR-013)
       - No HTTP port (background worker)
       - Instance size: basic-xs ($12/month) — UP from staging's basic-xxs per C.5 OOM finding
       - Instance count: 1
   - Database link to production Postgres from D0a
   - Env vars: all production values from /production-secrets.txt
   - Critical: NEXT_PUBLIC_APP_URL=https://app.dealerlink.in

A2.2. Create the production app:
   - `doctl apps create --spec .do/app.production.yaml`
   - Show me the command BEFORE running (this commits to monthly cost: ~$24/mo for web+workers + $30/mo DB = ~$54/mo)
   - Capture the auto-generated DO app URL (e.g., dealerlink-production-xxxxx.ondigitalocean.app)
   - Save app ID + URL to /production-secrets.txt

A2.3. Move the app to the production DO project:
   - `doctl projects resources assign <project-id> --resource=do:app:<app-id>`
   - `doctl projects resources assign <project-id> --resource=do:dbaas:<db-id>`
   - This is for billing/access organization

A2.4. Monitor first deploy:
   - `doctl apps logs <app-id> --component web --follow`
   - Watch for build success on both components
   - Workers component should boot Chromium eager-warm successfully (per C.5 validation)

A2.5. Verify production-ready /api/health on the auto-URL:
   - `curl -sI https://dealerlink-production-xxxxx.ondigitalocean.app/api/health`
   - Expect 200 + all checks green (db ok, migrations 16, queue ok, audit ok, rls ok)
   - Resend check shows status=skipped (no API key — by design until D.1)

A2.6. Lock down DB trusted-sources to App Platform UUID:
   - Get app UUID from doctl apps get <app-id>
   - `doctl databases firewalls append <db-id> --rule app:<app-uuid>`
   - Remove the wildcard if present
   - Verify with: `doctl databases firewalls list <db-id>`

COMMIT D0b: `chore(prod): App Platform production deploy + first health green`

CHUNK D0c — Cloudflare DNS + SSL for production domains
---------------------------------

A3.1. Verify Cloudflare DNS is still active for dealerlink.in (it is, from staging setup).

A3.2. Add DNS records for production:
   - CNAME `app` → auto-generated DO app URL (without https://)
     - Proxy: DNS only (gray cloud) per locked decision
   - CNAME `*` → auto-generated DO app URL
     - Proxy: DNS only (gray cloud)
     - Enables tenant subdomains: <tenant>.dealerlink.in
   - VERIFY existing staging records (`staging`, `*.staging`) remain unchanged

A3.3. In DO App Platform, add custom domains:
   - Settings → Domains → Add domain
   - Add: app.dealerlink.in
   - Add wildcard: *.dealerlink.in
   - DO auto-provisions Let's Encrypt SSL (takes ~5-15 min)

A3.4. Verify SSL provisioning:
   - Wait for DO to show "SSL Active" on both domains
   - Test: `curl -sI https://app.dealerlink.in/api/health` — expect 200 + valid cert
   - Test: `curl -sI https://test.dealerlink.in/api/health` — expect 200 (wildcard cert covers it; test slug won't resolve to a real tenant but cert is valid)

A3.5. Verify production smoke flow:
   - Open https://app.dealerlink.in in browser
   - Operator login page loads
   - Login as operator with the temp password from D0a
   - Should be forced to /change-password (per C.1)
   - Change password to a secure value (operator saves to password manager)
   - Verify redirect to operator dashboard
   - Logout

A3.6. Verify reserved-word handling:
   - Attempt to create a tenant with slug "app" — should be rejected
   - Attempt to create a tenant with slug "www" — should be rejected
   - If reserved-word validation doesn't exist yet, log as DEV.73 + flag for D.1 or D.2

COMMIT D0c: `chore(prod): Cloudflare DNS + Let's Encrypt SSL on app.dealerlink.in`

CHUNK D0d — Production verification + monitoring setup + closeout
---------------------------------

A4.1. Set DO billing alerts on the production project:
   - $50, $100, $200 thresholds
   - Email alerts to operator
   - Separate from staging alerts (different DO project = separate alert configs)

A4.2. Verify production observability is partial (placeholder mode):
   - /api/health shows all green
   - Resend check shows status=skipped (no key — by design until D.1)
   - Sentry shows status=skipped or no-DSN (by design until D.1)
   - Document: production is functionally up but not yet observable in third-party tools

A4.3. Critical-path E2E against production:
   - Adapt the critical-path spec for production URL
   - Run: `BASE_URL=https://app.dealerlink.in pnpm --filter web exec playwright test critical-path.spec.ts --project=chromium`
   - This requires a test tenant — for production, this might fail because we deliberately have no test tenants
   - Alternative: smoke verification — operator login, navigate to admin sections, confirm UI renders cleanly
   - Decision: defer full critical-path E2E to D.3 (production smoke test day) once a test tenant exists for it
   - Today's smoke: operator login + dashboard + change-password flow + logout

A4.4. Document production environment:
   - Create docs/PRODUCTION_ENV.md (parallel to docs/STAGING_ENV.md)
   - Includes: production URL, operator credentials reference (NOT the actual password — point to operator's password manager), DO app/DB IDs, current sizing
   - Mark: real tenants come in Stage E
   - Mark: D.1 will fill in observability + Resend
   - Mark: D.2 will fix F-1 (Next.js) + F-3 (rate limit)

A4.5. Cost verification:
   - Confirm DO billing dashboard shows expected resources:
     - dealerlink-production app (~$24/mo)
     - dealerlink-production-db Postgres (~$30/mo)
     - Total ~$54/mo as planned
   - If actual is higher, investigate before D.1

A4.6. Closeout:
   - pnpm preflight still green (local dev unchanged)
   - Update PROJECT_PLAN.md: add Stage D section, mark D.0 ✅ with date 2026-05-28
   - Update STAGE_D_HANDOFF.md: mark D.0 ✅, note what's deferred to D.1+
   - Final commit: `feat(stage-d): Day D.0 complete — production environment live at app.dealerlink.in`
   - Push to main (auto-deploys to STAGING — production deploys from .do/app.production.yaml which is manually applied via doctl)

A4.7. CRITICAL — App.yaml sync workflow note:
   - Per DEV.64, .do/app.production.yaml is documentation
   - Production deployment goes via `doctl apps update <prod-app-id> --spec .do/app.production.yaml`
   - This must be run manually after each app.production.yaml edit
   - Stage D Day D.2 addresses the sync workflow improvement

COMMIT D0d: `chore(prod): D.0 closeout — production env documented + billing alerts + handoff updated`

==========================================================
GUARDRAILS (STAGE D DAY D.0)
==========================================================

- Production secrets NEVER committed. /production-secrets.txt is gitignored (outside repo at C:\Users\rohit\.dealerlink\).
- Production DB has NO seed data beyond operator user. No demo/sample tenants. Real pilot tenant comes in Stage E.
- Production secrets are FRESH — do NOT reuse staging's LUCIA_SESSION_SECRET, RESEND_INBOUND_WEBHOOK_SECRET, or any other secret.
- Cloudflare DNS for production stays gray-cloud per locked decision.
- DO billing alerts on the production project are SEPARATE from staging — don't assume they carry over.
- The DB firewall MUST lock down to the App Platform UUID by end of D.0. Don't leave it wide-open past today.
- DB tier is Basic 2 GB ($30/mo), NOT Basic 1 GB. Per C.5 sizing decision.
- Workers are basic-xs ($12/mo), NOT basic-xxs. Per C.5 OOM finding.
- Web DB_POOL_MAX is 10, NOT 2. Per DEV.61 production sizing.
- Show me each billable doctl command BEFORE executing.

WHEN DONE:
- Print summary, 4 chunk commits
- Confirm: https://app.dealerlink.in/api/health returns 200 with all checks green
- Confirm: SSL active on app.dealerlink.in AND *.dealerlink.in
- Confirm: Operator can login on app.dealerlink.in and forced through change-password
- Confirm: DO billing alerts set on production project
- Confirm: DB firewall locked to App Platform UUID
- Confirm: Total monthly cost ~$54
- Tell me Stage D Day D.0 is complete and Day D.1 (production secrets + Resend + observability) is next
```

### Verification checklist (operator)

#### Infrastructure

- [ ] DO project `dealerlink-production` exists, separate from staging
- [ ] DO Managed Postgres Basic 2 GB tier running, 16 migrations applied
- [ ] DO App Platform shows web (basic-xs) + workers (basic-xs) both Active
- [ ] DB firewall locked to App Platform UUID (not wildcard)
- [ ] Billing alerts $50, $100, $200 set on production project

#### Domain + SSL

- [ ] Cloudflare shows `app` and `*` CNAME records (gray-cloud)
- [ ] DO App Platform shows app.dealerlink.in + \*.dealerlink.in SSL Active
- [ ] `curl -I https://app.dealerlink.in/api/health` returns 200 + valid cert
- [ ] `curl -I https://test.dealerlink.in/api/health` returns 200 (wildcard cert covers it)

#### Application

- [ ] Operator login page renders at https://app.dealerlink.in
- [ ] Operator login with temp password works
- [ ] Forced redirect to /change-password (per C.1)
- [ ] Password change succeeds, lands on operator dashboard
- [ ] Reserved word "app" rejected as tenant slug (or DEV.73 logged if not implemented)

#### Cost + Operational

- [ ] DO billing shows ~$54/month expected resources
- [ ] /production-secrets.txt exists locally, gitignored
- [ ] docs/PRODUCTION_ENV.md created
- [ ] PROJECT_PLAN.md D.0 ✅
- [ ] STAGE_D_HANDOFF.md D.0 ✅

---

## Stage D Day D.1 — Production Secrets + Resend + Observability (Friday May 29)

_Will be added when D.0 closes. Resend domain verification + DKIM + SPF (can take 24-72 hours, must start morning). Production Sentry project + BetterStack source + Axiom dataset. Wire all production env vars from placeholders to real values._

## Stage D Day D.2 — F-1 + F-3 + DEV.64 (Saturday May 30)

_Will be added when D.1 closes. Next.js upgrade to ≥14.2.35 (full regression pass). Login rate limit + account lockout. app.yaml → live spec sync workflow improvement._

## Stage D Day D.3 — Production Smoke + Pilot Dry Run (Sunday May 31)

_Will be added when D.2 closes. Provision a test tenant on production, run full critical-path E2E, exercise PDF generation + email send (real Resend) + observability. Document pilot tenant creation procedure for Stage E._

---

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts added at close of Stage D._
