# Stage C — Validation Prompts

Stage C runs from May 21 to May 27, 2026 (6 working days + 1 buffer). Goal: validate the Stage B build is production-ready, deploy staging environment, close the two known feature gaps (force-password-change, state normalization), security + performance audit, and prepare for Stage D production deploy.

Pilot target: **Production live June 3, 2026.** Staging available to pilot customer **May 24, 2026.**

## Stage C Day 1 — DO Staging Deploy (Thursday May 21)

**Goal:** Provision DigitalOcean App Platform with the Dealerlink app, connected DO Managed Postgres, working Cloudflare DNS for `staging.dealerlink.in`, and SSL. By end of day, a public staging URL exists where the app responds with `/health` showing all green.

**Estimated time:** 4–5 hours

**Deliverable:** `https://staging.dealerlink.in` reachable via HTTPS, login page renders, /health returns 200 with all checks green, app auto-deploys on push to `main` branch.

### Prompt for Claude Code

```
You are implementing Stage C Day 1 of the Dealerlink build. Stage B closed on tag stage-b-complete (commit 55064c1) — 18 days of feature work shipped, tagged, pushed. Today begins Stage C validation: deploy the app to DigitalOcean App Platform staging environment, wire Cloudflare DNS, enable SSL, verify the full smoke flow works against a real database.

CONTEXT:
- DO account: created, region preference BLR1 (Bangalore)
- Domain: dealerlink.in registered at Hostinger, DNS migrated to Cloudflare (in progress; nameservers updated)
- Pilot customer: real, waiting for staging access by Sunday May 24
- Production target: Wednesday June 3

PRELIMINARY:
P.1. `pnpm preflight` confirms 17 green checks against local dev DB. Note: today's work is mostly infrastructure provisioning + configuration; minimal code changes.
P.2. Read CLAUDE.md §3 (stack) and docs/DEPLOYMENT.md (the Stage D doc that today partially executes for staging).
P.3. Read docs/COSTS.md — confirm staging fits the $30-40/month staging budget.
P.4. Read .env.example — every var here needs a value in DO App Platform.
P.5. Read PROJECT_PLAN.md Stage A.10 closure notes — RESEND_INBOUND_WEBHOOK_SECRET was generated Day 14.

PRIMARY REFERENCES:
1. https://docs.digitalocean.com/products/app-platform/quickstart/ — App Platform quickstart
2. https://docs.digitalocean.com/products/databases/postgresql/ — Managed Postgres setup
3. https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/ — Cloudflare DNS setup
4. apps/web/playwright.config.ts — already has webServer config; that pattern adapts to staging
5. CLAUDE.md §3 — locked stack decisions (DO App Platform, DO Managed Postgres, Bangalore region)

==========================================================
TRACK A — STAGING DEPLOY (CHUNKED — 4 chunks)
==========================================================

CHUNK C1a — DO Managed Postgres + secrets generation
---------------------------------

A1.1. Provision DO Managed Postgres (smallest tier — Basic, 1GB RAM, 1 vCPU, 10GB storage, ~$15/month):
   - Region: BLR1 (Bangalore)
   - Postgres version: 16 (match local dev)
   - Database name: dealerlink_staging
   - User: dealerlink (auto-generated password)
   - Note the connection string — needed for App Platform env vars

A1.2. Configure DB-side requirements:
   - Connect via psql (DO provides the connection string with sslmode=require)
   - Run extension setup: CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION pg_trgm; CREATE EXTENSION btree_gin;
   - Verify extensions match what /api/health checks for

A1.3. Apply migrations to staging DB:
   - From local: DATABASE_URL=<do-connection-string> pnpm --filter @dealerlink/db db:migrate
   - Confirm all 14 migrations apply (0000 through 0013)
   - Run seed: DATABASE_URL=<do-connection-string> pnpm --filter @dealerlink/db db:seed

A1.4. Generate staging secrets — produce values for:
   - LUCIA_SESSION_SECRET — 32 bytes base64
   - RESEND_INBOUND_WEBHOOK_SECRET — already generated in .env.local; reuse OR regenerate for staging (RECOMMEND: regenerate, different env should have different secrets)
   - SENTRY_DSN — placeholder for now; can be filled when Sentry project created
   - BETTERSTACK_SOURCE_TOKEN — placeholder for now
   - AXIOM_TOKEN, AXIOM_DATASET — placeholder for now
   - RESEND_API_KEY — placeholder; production Resend account setup deferred to Stage D
   - DATABASE_URL — from A1.1
   - NEXT_PUBLIC_APP_URL — https://staging.dealerlink.in
   - NODE_ENV — production
   - TZ — Asia/Kolkata

A1.5. Document the staging secrets in a SECURE local file (NOT committed):
   - Create /staging-secrets.txt (gitignored)
   - Contains: all generated values for staging
   - This is the source of truth for what's in DO App Platform env vars

A1.6. Update .gitignore to add /staging-secrets.txt explicitly.

A1.7. Generate apps/workers Sentry DSN placeholder differently if needed (workers and web can share or split — for staging, share is fine).

COMMIT C1a: `chore(staging): provision DO Postgres + apply migrations + generate secrets`

CHUNK C1b — DO App Platform spec + first deploy
---------------------------------

A2.1. Create `.do/app.yaml` — DO App Platform spec file (declarative deploy config):
   - Two components:
     - web: apps/web (Next.js)
       - Source: github repo, branch main
       - Build command: pnpm install --frozen-lockfile && pnpm --filter web build
       - Run command: pnpm --filter web start
       - HTTP port: 3000
       - Instance size: basic-xs ($5/month for staging — bumping in production)
       - Instance count: 1
       - Health check: /api/health on port 3000, 30-second interval
     - workers: apps/workers (pg-boss worker process)
       - Source: same repo
       - Build command: pnpm install --frozen-lockfile && pnpm --filter workers build
       - Run command: pnpm --filter workers start
       - No HTTP port (background worker)
       - Instance size: basic-xxs ($5/month for staging)
       - Instance count: 1
   - Database link to the managed Postgres from C1a
   - Env vars (referencing secrets that will be added in DO UI):
     - DATABASE_URL: ${dealerlink-staging.DATABASE_URL}  (DO auto-injects)
     - All other env vars from A1.4

A2.2. Create the app on DO:
   - From DO dashboard OR via `doctl apps create --spec .do/app.yaml`
   - DO auto-discovers the GitHub repo connection (user must authorize once)
   - Initial deploy takes ~5-10 min

A2.3. Add env vars in DO UI:
   - Each secret from A1.4 added as SECRET type (encrypted at rest)
   - DATABASE_URL auto-populated from DB link
   - Verify via `doctl apps spec get <app-id>` that all expected vars are configured

A2.4. Trigger first deploy:
   - DO auto-deploys on push to main; or manual via dashboard
   - Watch deploy logs for build errors
   - If build fails: address each error, push fix, redeploy

A2.5. First success criteria:
   - Build completes
   - Both web + workers components show "Active" status
   - /api/health endpoint reachable at the auto-generated DO URL (e.g., https://dealerlink-xxxxx.ondigitalocean.app/api/health)
   - Returns 200 with all checks green

A2.6. Save the DO App ID and auto-generated URL in /staging-secrets.txt for reference.

COMMIT C1b: `chore(staging): DO App Platform spec + first successful deploy`

CHUNK C1c — Cloudflare DNS + SSL for staging.dealerlink.in
---------------------------------

A3.1. Confirm Cloudflare DNS migration is complete:
   - Visit https://www.whatsmydns.net/#NS/dealerlink.in
   - All locations show Cloudflare nameservers
   - Cloudflare dashboard shows "Site is active"
   - If not complete yet, PAUSE this chunk and wait. Don't proceed.

A3.2. Add DNS records in Cloudflare for staging:
   - Record 1: CNAME `staging` → DO app URL (the one from A2.6, without https://)
     - Proxy status: DNS only (gray cloud) — DO handles its own TLS termination; Cloudflare proxying breaks SSL handshake
   - Record 2: CNAME `*.staging` → DO app URL
     - Same proxy: DNS only
     - This enables tenant subdomains: demo.staging.dealerlink.in, sample.staging.dealerlink.in, etc.

A3.3. In DO App Platform, add custom domain:
   - Settings → Domains → Add domain
   - Add: staging.dealerlink.in
   - DO will request DNS verification (already satisfied by A3.2 CNAME)
   - Add wildcard: *.staging.dealerlink.in
   - DO auto-provisions Let's Encrypt SSL certs (takes ~5-15 minutes)

A3.4. Verify SSL provisioning:
   - Wait for DO to show "SSL Active" on both domains
   - Test: `curl -I https://staging.dealerlink.in/api/health` — expect 200 + valid cert
   - Test: `curl -I https://demo.staging.dealerlink.in/api/health` — expect 200 (wildcard cert covers it)

A3.5. Update DO App Platform env vars:
   - NEXT_PUBLIC_APP_URL → https://staging.dealerlink.in (was placeholder before)
   - Trigger redeploy so the change takes effect

A3.6. Smoke test:
   - Visit https://staging.dealerlink.in in browser
   - Login page renders
   - Login as admin@demo.test → redirects to https://demo.staging.dealerlink.in/dashboard
   - Dashboard loads with seeded data (demo tenant)
   - Logout, login as sales@demo.test on sample.staging.dealerlink.in (subdomain switch) — confirm tenant isolation
   - Check /api/health on both subdomains — all green

COMMIT C1c: `chore(staging): Cloudflare DNS + SSL for staging.dealerlink.in`

CHUNK C1d — Smoke test + monitoring + closeout
---------------------------------

A4.1. Run the critical-path E2E spec against staging:
   - Adapt apps/web/tests/e2e/critical-path.spec.ts with a staging URL config
   - Run: `BASE_URL=https://staging.dealerlink.in pnpm --filter web exec playwright test critical-path.spec.ts`
   - All 27 steps should pass
   - If any step fails on staging but passes locally, that's environmental — investigate

A4.2. Verify observability is partial-working (Stage D will complete it):
   - /health returns granular component status (not just 200)
   - Database check passes (latency reported)
   - Resend check shows status='skipped' (no API key yet — that's expected for staging)
   - Queue check shows depth=0 (or whatever pg-boss reports)

A4.3. Document the staging environment:
   - Create docs/STAGING_ENV.md
   - Includes: staging URL, available tenants (demo, sample), seeded credentials, how to reset staging DB if needed, who has access
   - DO NOT include actual secrets — those stay in /staging-secrets.txt locally

A4.4. Add Cloudflare-side basic security:
   - Enable "Always Use HTTPS" (Cloudflare redirects http → https before reaching DO)
   - Enable "Automatic HTTPS Rewrites"
   - DO NOT enable "Auto Minify" — it can break SSR
   - Set SSL/TLS mode to "Full (strict)" — requires DO's SSL cert which is valid

A4.5. Set DO billing alerts (operational hygiene):
   - DO dashboard → Billing → Notifications
   - Alert at $50/month, $100/month
   - These match the Stage 0 plan

A4.6. Closeout:
   - pnpm preflight still green (local dev unchanged)
   - Mark C.1 ✅ in PROJECT_PLAN.md (Stage C section — create if missing)
   - Final commit: `chore(staging): Stage C Day 1 complete — staging.dealerlink.in live`
   - Push to main (triggers auto-deploy to staging — no-op if already current)

COMMIT C1d: as above

==========================================================
GUARDRAILS (STAGE C DAY 1)
==========================================================

- Secrets NEVER committed. /staging-secrets.txt is gitignored. DO App Platform env vars are the source of truth for the running app.
- DNS proxying through Cloudflare is OFF for the staging records (gray cloud). DO handles TLS termination; Cloudflare proxying breaks SSL handshake with DO's app domains.
- DO App Platform auto-deploys on push to main. Be intentional about pushing — every push triggers a deploy.
- Migrations apply to staging DB via the same drizzle commands as dev. No special staging migration path — same code, different DATABASE_URL.
- Seed data on staging is the same as dev (demo + sample tenants with test users). Pilot customer's real tenant gets provisioned in Stage E, NOT today.
- Health check interval is 30 seconds. If /health is slow (>5s), DO will mark unhealthy and may restart. Verify /health is fast before promoting to production traffic.
- The app.yaml file IS source of truth for deploy spec. Manual UI changes drift; always update app.yaml + push.

WHEN DONE:
- Print summary, 4 chunk commits
- Confirm: https://staging.dealerlink.in/api/health returns 200 with all green
- Confirm: critical-path E2E passes against staging URL
- Confirm: tenant subdomain routing works (demo.staging.dealerlink.in vs sample.staging.dealerlink.in show different data)
- Confirm: DO billing alerts set
- Tell me Stage C Day 1 is complete and we're ready to share staging URL with pilot customer
```

### Verification checklist

#### Infrastructure

- [ ] DO Managed Postgres running, 14 migrations applied, seed data loaded
- [ ] DO App Platform shows web + workers both Active (green)
- [ ] /api/health on the DO auto-URL returns 200 with all checks green
- [ ] Build + deploy pipeline working (push to main triggers redeploy)

#### Domain + SSL

- [ ] Cloudflare DNS shows `staging` and `*.staging` CNAME records
- [ ] DO App Platform shows custom domains as SSL Active
- [ ] `curl -I https://staging.dealerlink.in` returns 200 with valid cert
- [ ] `curl -I https://demo.staging.dealerlink.in` returns 200 (wildcard works)

#### Application

- [ ] Login page renders at staging URL
- [ ] Login as admin@demo.test → redirects to demo subdomain dashboard
- [ ] Login as admin@sample.test → redirects to sample subdomain dashboard (tenant isolation)
- [ ] Critical-path E2E passes against staging

#### Operational

- [ ] DO billing alerts at $50, $100
- [ ] /staging-secrets.txt exists locally, gitignored
- [ ] docs/STAGING_ENV.md documents the env for team reference
- [ ] PROJECT_PLAN.md C.1 ✅

---

## Stage C Day 2 — Force-Password-Change Build (Friday May 22)

_Will be added when C.1 is complete. Builds the force-password-change route + flow per ADR-010 and CLAUDE.md §6 spec; closes DEV.56 carried-forward gap._

## Stage C Day 3 — State Code Normalization (Saturday May 23)

_Will be added when C.2 is complete. Closes DEV.33; normalizes state storage from full names to 2-letter codes per CLAUDE.md §5._

## Stage C Day 4 — Pilot Staging Handoff + UX Walkthrough (Sunday May 24)

_Will be added when C.3 is complete. Pilot customer gets staging credentials; user does 2-hour walkthrough; collect findings._

## Stage C Day 5 — Security Audit (Monday May 25)

_Will be added when C.4 is complete. RLS verification across all tables, role enforcement audit, secrets inventory, OWASP checklist for the public-facing routes._

## Stage C Day 6 — Performance Testing + Stage D Handoff (Tuesday May 26)

_Will be added when C.5 is complete. Load test against staging (PDF generation, concurrent dispatches, payment allocations); pg-boss queue depth under load; final Stage D handoff doc._

---

## Stage D — Production Deployment (May 28 - May 31)

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts will be added at the close of each preceding stage._
