# Stage D Handoff — Dealerlink Production Deployment

> **Audience.** Whoever picks up Stage D (Production Infrastructure) on Thursday
> morning — possibly a fresh Claude Code session or a human — **without having
> lived through Stage C.** This document is a self-contained runbook: it states
> what to build, at what size, in what order, and why. Where a number or a
> decision came from a Stage C measurement, the source is cited so it can be
> re-checked, not taken on faith.
>
> **Companion documents (read as needed, not required up front):**
> `docs/STAGE_C_HANDOFF.md` (what Stage C delivered), `docs/SECURITY_AUDIT.md`
> (the 9 findings; F-1/F-3 are carried here), `DEVIATIONS.md` (DEV.57–72 — the
> staging deploy + Stage C learnings), `DECISIONS.md` (ADR-013 PDF queue
> isolation), `docs/DEPLOYMENT.md` (the `doctl` spec-apply runbook),
> `docs/STAGING_ENV.md` (the staging reference this mirrors),
> `scripts/load-test/FINDINGS.md` + `findings-pdf.md` (the C.5 performance data
> behind every sizing number here), `.do/app.yaml` (the staging spec to clone).

> **Status at handoff:** Stage C is complete (C.0–C.5). Staging is live, validated,
> security-audited, and load-tested. **No code feature work remains for the
> pilot.** Stage D is infrastructure + hardening only.

---

## 1. Production Deployment Overview

**Goal.** A production environment ready for the pilot customer to go live on
**Wednesday, June 3, 2026.**

**Scope (in).** A _dedicated_ DO project (separate from staging), production-sized
infrastructure, real third-party service credentials (Sentry / Better Stack /
Axiom / Resend), production DNS + SSL, backups, and the two security hardening
items deferred from C.4 (F-1, F-3).

**Scope (out).** No features. No refactors. No schema changes beyond what
migrations already encode. The product is feature-complete (Stage B, 18/18) and
validated (Stage C). Stage D changes _where and how_ it runs, not _what it does._

**Why a separate environment, not a staging promotion.** Staging is the
validated reference and the pilot's preview; it must stay stable and unchanged
through Stage D (see §11). Production is stood up alongside it using the same
spec shape (`.do/app.yaml`) with production sizing + real secrets.

---

## 2. Production Environment Spec

DO project: **dedicated** (e.g. `dealerlink-prod`), **region BLR1** (same as
staging — India-first, data residency).

### 2.1 The sizing decision package (data-driven from C.5)

C.5 load-tested staging and produced concrete numbers (`scripts/load-test/`).
The three sizing changes below are a **single coherent package** — they are
coupled and **must move together.** Bumping only one fixes one bottleneck while
leaving its coupled partner in place (see the §10 risk note).

| Component             | Staging (now)                            | **Production**             | Δ cost/mo | Driver                                                     |
| --------------------- | ---------------------------------------- | -------------------------- | --------- | ---------------------------------------------------------- |
| **Workers**           | `basic-xxs` (512 MB)                     | **`basic-xs` (1 GB)**      | **+$7**   | C5b: 512 MB OOM-restarted ≥2× under PDF rendering (DEV.67) |
| **Web `DB_POOL_MAX`** | `2` (config)                             | **`10`** (config)          | **$0**    | C5a/C5c: pool=2 serializes reads + PDF requests (DEV.61)   |
| **DB**                | Basic 1 GB (`db-s-1vcpu-1gb`, ~25 conns) | **Basic 2 GB (~50 conns)** | **+$15**  | Headroom to actually raise `DB_POOL_MAX` (DEV.61)          |

**Net delta: ~+$22/month → total production ≈ $52/month** (web `basic-xs` ~$12 +
workers `basic-xs` ~$12 + DB Basic 2 GB ~$30), **plus ~$5/month DO Spaces** for
file storage (new in production, DEV.16/R.15). _Confirm exact figures against
current DO pricing at provisioning — these are 2025-era estimates._

**Why all three move together (the coupling, proven in C5b):**

- The web action holds a DB pool connection open while it polls
  `generated_documents` for the rendered PDF (ADR-013 / DEV.63). With
  `DB_POOL_MAX=2`, only 2 PDF requests are ever in-flight; a burst queues behind
  them. So a bigger **worker** alone can't clear a burst — the **web pool** caps
  concurrency first.
- But raising `DB_POOL_MAX` to 10 means up to 10 concurrent connections from web
  **+** the workers' own pools **+** pg-boss — which **exceeds the Basic 1 GB
  tier's ~25-connection ceiling** once both components scale. So the pool bump
  _requires_ the **DB** tier bump to ~50 connections.
- And a bigger worker is what makes 10 concurrent renders actually _survive_
  without OOM. **Three changes, one outcome: reliable concurrent PDF generation.**

### 2.2 Component spec

- **Web:** `basic-xs` (1 GB), `instance_count: 1`, Node buildpack (unchanged from
  staging). C5a/C5c showed the web tier is comfortable for pilot load — 5
  concurrent users 0 errors; 10 concurrent dashboard users 0 errors. Keep
  `basic-xs`. Set `DB_POOL_MAX=10`, `DB_ADMIN_POOL_MAX=5`, `PGBOSS_POOL_MAX=2`
  (up from the staging 2/2/1 caps now that the DB tier allows it).
- **Workers:** **`basic-xs` (1 GB)**, `instance_count: 1`, custom Dockerfile
  (`apps/workers/Dockerfile`, Chromium runtime libs — unchanged, ADR-013/DEV.63).
  This is the **DEV.67 worker-sizing decision, now resolved by data.** Keep the
  eager-warm (DEV.66) and the 45-min idle-recycle (DEV.67); with 1 GB the cold
  launch and recycle behaviour are unchanged but the OOM headroom is doubled.
  Consider lowering `PDF_RENDER_TIMEOUT_MS` from 120 s back toward ~60 s once a
  production smoke confirms cold launches are fast on the roomier box.
- **DB:** DO Managed Postgres **Basic 2 GB**, PG 16, BLR1, `production: true`
  (attach an out-of-band-provisioned cluster, as staging does). Daily automated
  backups + PITR (see §7).
  - **Upgrade trigger to Pro (4 GB, ~100 connections):** sustained connection
    count **>40** OR memory **>80%** in DO Monitoring. Don't pre-buy Pro for the
    pilot; Basic 2 GB has ample headroom for one pilot tenant. Revisit if the
    pilot scales or more tenants onboard.

> **No connection pooler for launch.** A PgBouncer transaction-mode pool breaks
> pg-boss (LISTEN/NOTIFY + advisory locks) — DEV.61. The Basic 2 GB tier's ~50
> connections + the `DB_POOL_MAX=10` cap is sufficient for the pilot without a
> pooler. Revisit only if the Pro trigger fires and connections are still tight.

### 2.3 Domain

Recommend **`app.dealerlink.in`** for the app (operator login at the apex,
tenants at `<slug>.app.dealerlink.in`). Operator to confirm vs the naked
`dealerlink.in` apex. DNS via Cloudflare (gray-cloud DNS-only, same pattern as
staging); SSL via Let's Encrypt through DO. See §6 for the full DNS/SSL plan.

---

## 3. Production Secrets Provisioning Checklist

All real values live **only** in `C:\Users\rohit\.dealerlink\production-secrets.txt`
(gitignored, outside the repo) and are injected into the running app via
`doctl apps update --spec` (DEV.64 — see §11 and `docs/DEPLOYMENT.md`). The
committed spec ships `type: SECRET` envs with **no `value:`**. **Never commit a
real secret.**

| Secret                                              | Source / how to obtain                                                                                        | Format                            | Scope                  | Rotation                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                                      | DO Managed Postgres prod → app role (`dealerlink_app`, RLS-enforced) connection string                        | `postgres://…?sslmode=require`    | web + workers RUN_TIME | On DB credential rotation                                           |
| `DATABASE_DIRECT_URL`                               | DO Managed Postgres prod → superuser (`doadmin`) — Lucia + pg-boss + migrations                               | `postgres://…?sslmode=require`    | web + workers RUN_TIME | On DB credential rotation                                           |
| `SESSION_SECRET`                                    | Generate fresh: `openssl rand -base64 32`                                                                     | 32-byte base64                    | web + workers RUN_TIME | Rotating invalidates all sessions — do at a maintenance window only |
| `RESEND_API_KEY`                                    | Resend dashboard → API Keys (after domain verify, §8/D.1)                                                     | `re_…`                            | web + workers RUN_TIME | Per Resend policy; revoke staging key separately                    |
| `RESEND_INBOUND_WEBHOOK_SECRET`                     | Resend → inbound webhook endpoint → Svix signing secret. Generate fresh; **never** expose via `NEXT_PUBLIC_*` | `whsec_…`                         | web RUN_TIME           | On webhook re-creation                                              |
| `SENTRY_DSN`                                        | New **production** Sentry projects `dealerlink-web` + `dealerlink-workers` → DSN                              | URL                               | web + workers          | Project-scoped; rarely                                              |
| `NEXT_PUBLIC_SENTRY_DSN`                            | Browser DSN (public by design)                                                                                | URL                               | web RUN_AND_BUILD_TIME | —                                                                   |
| `BETTERSTACK_SOURCE_TOKEN`                          | New **production** Better Stack source → token                                                                | token                             | web + workers RUN_TIME | Per Better Stack                                                    |
| `AXIOM_TOKEN` + `AXIOM_DATASET`                     | New **production** Axiom dataset (e.g. `dealerlink-prod-events`) → API token                                  | token + dataset name              | web + workers RUN_TIME | Per Axiom                                                           |
| `DO_SPACES_KEY` / `_SECRET` / `_BUCKET` / `_REGION` | DO Spaces → `dealerlink-prod` bucket (BLR1) + access keys (R.15 / DEV.16 — first real use in prod)            | keys + `dealerlink-prod` + `blr1` | web + workers RUN_TIME | Per DO key policy                                                   |
| `NEXT_PUBLIC_APP_URL`                               | `https://app.dealerlink.in` (or chosen domain)                                                                | URL                               | web RUN_AND_BUILD_TIME | —                                                                   |
| `NEXT_PUBLIC_APP_DOMAIN`                            | `app.dealerlink.in` (apex for tenant routing, DEV.60)                                                         | host                              | web RUN_AND_BUILD_TIME | —                                                                   |
| `SENTRY_RELEASE`                                    | Git SHA at deploy (also surfaces as `/health` `version`)                                                      | SHA                               | build                  | Per deploy                                                          |

> **F-7 (security audit) closes here.** On staging these observability +
> outbound-email secrets are intentionally blank (services no-op). Production
> **must** populate them all. Verify post-deploy: `/api/health` `resend` check
> should report `ok` (not `skipped`), and a test error should reach Sentry.

---

## 4. Resolved Stage C Findings to Address in Stage D

### 4.1 Sizing findings (resolved by the §2 decision package)

- **DEV.61 — DB connection-pool cap.** Staging caps `DB_POOL_MAX=2` to live within
  the Basic 1 GB tier's 25 connections. **Production change:** raise to `10` on
  the Basic 2 GB tier (§2). Validated in C5c: pool=2 holds 10 concurrent users
  with 0 errors but ~1.2 s p50; raising it flattens that.
- **DEV.67 — worker instance sizing.** Was explicitly left "for the data-driven
  call in C.5." **Resolved:** **`basic-xs` (1 GB).** C5b showed the 512 MB
  `basic-xxs` OOM-restarted ≥2× during PDF rendering (clean kill, no crash log =
  OOM fingerprint), even once during _sequential_ renders.
- **NEW C.5 finding — concurrent PDF burst overwhelms `basic-xxs`.** A
  10-concurrent render burst failed 4/10, 1/10, 7/10 across three reps (120 s
  timeouts), correlated with the worker restarts. **This is the core rationale
  for the coupled `basic-xs` + `DB_POOL_MAX` + DB-tier package.** Single and
  sequential renders are excellent (cold 5.5 s, warm 2.4–3.5 s) — the pilot's
  ≤10-PDFs/hour load is unaffected; the burst ceiling is the production concern.
  Full analysis: `scripts/load-test/findings-pdf.md`.

### 4.2 Security findings carried from C.4 (`docs/SECURITY_AUDIT.md`)

- **F-1 (High) — upgrade Next.js to ≥14.2.35** (clears CVE-2025-29927
  middleware-bypass + the Server-Component DoS/SSRF advisories). **Today
  mitigated** because auth is in the layouts, not middleware (DEV.68) — but it is
  the **#1 pre-production must-do.**
  - _Approach:_ its **own PR**, full `pnpm verify` regression pass + the
    critical-path E2E green before merge. Ship it as the **first commit of Stage
    D** so the rest of the deploy runs on the patched framework. Pin a minimum
    Next version. _Effort: ~3–4 h incl. testing._
- **F-3 (Medium) — login rate-limit + account lockout.** `login()` has neither
  today; the `checkRateLimit` primitive already exists (wired to `/health`) but
  is not called on login.
  - _Approach:_ wire `checkRateLimit({ scope: 'login', key: ip+email })` into
    `login()` (`apps/web/lib/auth/actions.ts`) + a soft lockout. **Recommended
    thresholds: 5 attempts / 15-min window, then a 30-min lockout** (surfaced via
    `auth_events`). _Effort: ~2 h._
- _(Also carry, lower priority — Stage D if time, else accept:)_ **F-4**
  drizzle-orm ≥0.45.2 (hygiene, not exploitable); **F-9** logo content-type/SVG
  validation before DO Spaces goes live. **F-2** (HTTP security headers) was
  already fixed in C.4 (`8c205ad`).

### 4.3 Process finding

- **DEV.64 — `.do/app.yaml` ↔ deployed-spec sync.** The repo spec is documentation;
  the live spec is what deploys. Today the apply is a manual
  `doctl apps update --spec` (merged into the live spec to preserve secrets) — it
  is brittle and easy to forget.
  - **Decision needed before the first production deploy.** Option A: DO's GitHub
    Action for spec sync. Option B: a custom post-push CI step. Either makes repo
    and live spec un-divergeable. Pick one in D.0.

---

## 5. Production Deployment — Day-by-Day Plan

Stage D has **4 days for ~3 days of work** — the buffer is deliberate (§10).

| Day            | Date           | Work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D.0**        | **Thu May 28** | Stand up the dedicated DO project + App Platform app (web + workers) from a cloned `.do/app.yaml` with production sizing (§2). Provision DO Managed Postgres **Basic 2 GB** (BLR1) out-of-band; run the staging-bootstrap scripts (DEV.58) + migrations against it. Provision DO Spaces `dealerlink-prod`. **Decide + wire the DEV.64 spec-sync mechanism.** First deploy to the DO-provided `*.ondigitalocean.app` URL; `/api/health` green. **Test the deploy pipeline before trusting it.** |
| **D.1**        | **Fri May 29** | Production secrets (§3): create prod Sentry/Better Stack/Axiom projects, **verify `dealerlink.in` in Resend + DKIM/SPF/DMARC** (start this _first_ — DNS propagation 24–72 h, §10), wire the inbound webhook + signing secret. Inject all secrets via `doctl`. Confirm `/health` `resend` = `ok` and observability is live (test event reaches Sentry/Axiom).                                                                                                                                  |
| **D.2**        | **Sat May 30** | **F-1** (Next.js ≥14.2.35 in its own PR + full regression) → merge as the first prod-running change. **F-3** (login rate-limit + lockout). Confirm the DEV.64 sync workflow holds. Re-run `pnpm verify` + critical-path E2E on the patched build.                                                                                                                                                                                                                                              |
| **D.3**        | **Sun May 31** | Production DNS cutover to `app.dealerlink.in` + wildcard SSL (§6). Production smoke test: provision 1 throwaway test tenant, run the critical-path manually (or point the load-test harness at prod for a _single_ baseline pass — not a stress run). Pilot dry-run. Backup/restore rehearsal (§7). Final validation.                                                                                                                                                                          |
| **Buffer**     | Jun 1–2        | Slack for DNS/Resend propagation, any smoke-test fixes. **Pilot tenant provisioning is Stage E / D.? — June 1 (§9), not earlier.**                                                                                                                                                                                                                                                                                                                                                             |
| **Pilot live** | **Wed Jun 3**  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

## 6. Production Domain + DNS Plan

- **App domain:** **`app.dealerlink.in`** (recommended). The apex of this host
  serves the **operator** login; tenants resolve at `<slug>.app.dealerlink.in`
  (set `NEXT_PUBLIC_APP_DOMAIN=app.dealerlink.in` — it is inlined into the Edge
  middleware bundle at build time, DEV.60). No `api.` subdomain is needed — there
  is no separate API (reads are Server Components, writes are Server Actions).
- **Pilot tenant:** `<pilot-slug>.app.dealerlink.in` (decide the slug _with_ the
  customer — §9).
- **DNS:** Cloudflare, **gray-cloud (DNS-only)** for the app records, same pattern
  as staging. Print the exact records for the operator to add manually (the
  operator owns the Cloudflare zone — they apply DNS by hand, per the infra
  workflow; Claude does not use `wrangler`).
- **SSL — the one real upgrade vs staging.** Staging _enumerates_ each tenant
  subdomain for an HTTP-01 cert (no wildcard, because DNS is on Cloudflare and DO
  needs DNS-01 for wildcards). Production needs a **true wildcard**
  `*.app.dealerlink.in` strategy so new tenant subdomains work without editing the
  spec each time. Two options (decide in D.3):
  - **A — Cloudflare origin cert + proxied (orange-cloud):** Cloudflare terminates
    TLS with a wildcard edge cert; DO uses a Cloudflare origin cert. Cleanest for
    wildcards.
  - **B — DO-managed DNS:** move the zone (or a delegated subdomain) to DO so DO
    can do DNS-01 wildcard issuance. Heavier; conflicts with the "Cloudflare is
    manual / operator-owned" workflow.
  - _Recommendation:_ A (Cloudflare proxied origin cert) — keeps the zone on
    Cloudflare and gives a real wildcard. Validate that proxying doesn't break the
    Edge middleware host resolution (`NEXT_PUBLIC_APP_DOMAIN`) or the Resend
    inbound webhook path.

---

## 7. Backup + Recovery Strategy

- **Automated backups:** DO Managed Postgres includes **daily backups** — confirm
  enabled with **≥7-day retention** for production (the managed tier default).
- **Point-in-time recovery (PITR):** enable for production (Basic 2 GB supports
  it). This is the real-data safety net the pilot needs.
- **Pre-migration manual backup:** before **every** Stage D (and later) schema
  migration, take a `pg_dump` to local. The migrations are idempotent and
  hand-reviewed, but a real-data environment warrants a fast rollback.
- **Test the restore — at least once in Stage D (D.3).** Restore a backup (or
  PITR snapshot) to a _fresh_ DB and verify it boots + `/health` is green +
  tenant data is intact. An untested backup is not a backup.
- **Targets:** document explicit **RTO ≤ 1 hour** (time to restore service) and
  **RPO ≤ 24 hours** (daily backup) / **≤ few minutes** with PITR. State these so
  the pilot's expectations are set.

---

## 8. Observability — Production Configuration

All three SDKs degrade to no-ops without credentials (Day 17 contract); §3
populates them. Production config:

- **Sentry:** production projects `dealerlink-web` + `dealerlink-workers`. Errors
  at **100 %** sample, performance tracing at **~10 %** sample (cost control). The
  `beforeSend` PII scrubber is already wired and was verified clean in the C.4
  audit (email→hash, GSTIN/PAN/card/phone→redacted) — no change needed.
- **Better Stack:** production source + the uptime monitor on
  `https://app.dealerlink.in/api/health` (60 s, 3-strike, expects 200 — see
  `docs/DEPLOYMENT.md`). Alert on error-rate spike + uptime drop.
- **Axiom:** production dataset (e.g. `dealerlink-prod-events`), 30-day retention,
  structured logs.
- **DO Monitoring:** enable built-in alerts — \*\*CPU > 80 %, memory > 80 %, disk
  > 80 %** on each component. The **memory alert on workers is the canary for the
  > C5b OOM concern** — if `basic-xs` ever trends >80 % under real PDF load, that's
  > the signal to revisit sizing. Also watch DB **connection count > 40\*\* (the §2.2
  > Pro-tier upgrade trigger).
- **Specific alert thresholds beyond the above are a Stage D deployment-time call**
  (tune as the prod baseline emerges) — not pre-decided here.

---

## 9. Pilot Tenant Provisioning (Stage E preview — do NOT do in Stage D)

This happens **Day E.1 (June 1)**, by the **operator**, via the admin app — _not_
during Stage D infrastructure work.

- Operator runs the onboarding flow (`docs/RUNBOOKS.md` R1) for the **real pilot
  company**: legal name, GSTIN, registered address, bank details, default T&C —
  all real values entered through Settings (the product is tenant-agnostic;
  nothing is hardcoded, CLAUDE.md §8).
- First admin user with the pilot's **real email**; they go through the
  **force-password-change** flow on first login (C.1 / DEV.56).
- The pilot tenant gets `<pilot-slug>.app.dealerlink.in`.
- **Pre-load: empty.** No seed. The pilot enters their own real dealers /
  products / inventory. (Production has no seed — only staging does.)
- **Security constraint (F-8):** the pilot's real credentials must **never** be
  committed to the repo (unlike the throwaway `password123` staging seed).

---

## 10. Risk Register

| Risk                                                               | Severity            | Mitigation                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A production-shape bug not surfaced by staging**                 | High                | The 4-day Stage D + 3-day Stage E buffer; D.0 tests the deploy pipeline before trusting it; D.3 production smoke + dry-run.                                                                                                                                                               |
| **Partial sizing fix** — applying only one of the three §2 changes | **High (coupling)** | The worker / web-pool / DB-tier changes are **coupled** (§2.1). Bumping only the worker leaves the pool=2 serialization; bumping only the pool exhausts the Basic 1 GB DB connections; bumping only the DB does nothing alone. **Apply all three together or none.** C5b is the evidence. |
| **Resend domain verification delay**                               | Medium              | DKIM/SPF/DMARC propagation is 24–72 h. **Start Resend + DNS on D.1 morning**, well before June 3.                                                                                                                                                                                         |
| **PDF cold-start / worker pressure on production**                 | Medium → Low        | Resolved by `basic-xs` (§2). DO memory alert >80 % on workers is the canary (§8). Pilot PDF load (≤10/hr sequential) is well within budget per C5b.                                                                                                                                       |
| **F-1 Next.js upgrade introduces a regression**                    | Low                 | Dedicated PR, full `pnpm verify` + critical-path E2E before merge (D.2).                                                                                                                                                                                                                  |
| **Wildcard SSL strategy churn**                                    | Medium              | Decide option A (Cloudflare proxied origin cert) early (D.3); validate Edge host-resolution + webhook path don't break under proxy.                                                                                                                                                       |
| **DNS propagation for `app.dealerlink.in`**                        | Medium              | Start DNS early; Cloudflare propagation is usually fast but allow buffer (Jun 1–2).                                                                                                                                                                                                       |

---

## 11. What NOT to Do in Stage D

- ❌ **Don't add features.** Phase 1 is feature-complete. Anything new is Phase 2.
- ❌ **Don't refactor.** No "improvements" to working code. Stage D is infra +
  the two named security fixes (F-1, F-3) only.
- ❌ **Don't change the staging environment.** It is the validated reference and
  the pilot's preview — keep it stable and unchanged.
- ❌ **Don't skip the F-1 Next.js upgrade.** It was deferred from C.4 _specifically_
  for Stage D. Ship it as the first commit.
- ❌ **Don't deploy to production without testing the deploy pipeline first** (D.0).
- ❌ **Don't edit `.do/app.yaml` and assume it deployed** — DO stores its own spec
  copy; apply via `doctl apps update --spec` merged into the live spec to preserve
  secrets (DEV.64 / `docs/DEPLOYMENT.md`). Wire the sync mechanism so this can't be
  forgotten.
- ❌ **Don't apply the three §2 sizing changes piecemeal** — they are coupled (§10).
- ❌ **Don't commit any real production secret** (§3 / F-8).
- ❌ **Don't run a load _stress_ test against production** — a single baseline pass
  is fine for the D.3 smoke; do not OOM the production worker the way C5b did to
  staging.

---

_Prepared 2026-05-27 (Stage C Day C.5) from the C.5 load-test data
(`scripts/load-test/`), the C.4 security audit, and the C.0–C.3 staging
learnings. This is the authoritative Stage D starting point; `docs/DEPLOYMENT.md`
is the living runbook as Stage D proceeds._
