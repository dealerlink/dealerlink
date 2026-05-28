# Stage D — Production Deployment Prompts

Stage D runs from May 26 to May 31, 2026 (started 2 days ahead of original plan). Pilot live target: Wednesday, June 3, 2026.

## Schedule

| Day            | Date       | Focus                                                          | Status      |
| -------------- | ---------- | -------------------------------------------------------------- | ----------- |
| D.0            | May 26     | Production environment provisioning + DB + initial deploy      | ✅ Done     |
| D.1            | May 27     | Production secrets + Resend + observability                    | ✅ Done     |
| D.1 follow-up  | May 27     | Axiom region fix + Sentry workers verify + BetterStack docs    | ✅ Done     |
| DNS diagnostic | May 28     | DNS architecture documented + D.3 wildcard plan                | ✅ Done     |
| **D.2**        | **May 28** | **F-1 (Next.js upgrade) + F-3 (rate limit) + DEV.64 + DEV.73** | **Current** |
| D.3            | May 29     | Wildcard SSL + Production smoke + pilot dry run                | ⏳          |
| Buffer         | May 30-31  | 2 days of slack                                                | —           |
| Stage E start  | Jun 1      | Pilot tenant provisioning                                      | —           |

## Locked Decisions (carried forward from D.0)

- Production domain: `app.dealerlink.in` + tenant subdomains `<tenant>.dealerlink.in`
- SSL: DO-managed (gray-cloud Cloudflare → DO's Cloudflare-fronted edge → DO origin)
- Sizing: web basic-xs + workers basic-xs + DB Basic 2 GB = ~$54/mo
- Reserved slugs: `app`, `www`, `api`, `admin`, `blog`, `docs`, `status`, `mail`, `staging` (enforcement in D.2 per DEV.73)

---

## Retrospectives — D.0 through DNS Diagnostic

### D.0 — Production Environment (✅ May 26)

**Commits:** a53ffd9 → 47d70339

DO project `dealerlink-production` (5ca8a796), Managed Postgres Basic 2 GB BLR1, App Platform web+workers basic-xs, dual-role RLS, operator seeded, Cloudflare DNS gray-cloud, SSL on app.dealerlink.in, DB firewall locked. /api/health 200 green.

### D.1 — Production Observability + Email (✅ May 27)

**Commits:** 0d2a34c → 61bedc0

Resend prod key wired (sending-only scope), Sentry web+workers prod projects (tracesSampleRate 0.1), BetterStack + Axiom wired, DEV.74 health-check patch for restricted_api_key. Single doctl apps update for secret swap.

### D.1 Follow-up (✅ May 27)

**Commits:** ced11d7 → 063e2ea

- DEV.75: Axiom region mismatch (dataset in EU, token in US) → recreated in US, hardened client with `onError→logger.warn`
- DEV.76: BetterStack frequency 3min (free tier), monitor location → Asia/Singapore
- DEV.77: Sentry workers verified via temporary THROW_ON_PURPOSE diagnostic endpoint (then removed)
- Sentry workers project confirmed receiving PII-clean errors

### DNS Architecture Diagnostic (✅ May 28)

**Commits:** 5fbffc0

- DEV.78: DNS for \*.dealerlink.in routes through DO's Cloudflare integration (not ours)
- STAGE_D_HANDOFF.md §6 rewritten with verified architecture
- D.3 wildcard SSL plan: DO supports native wildcards → Option A (~30-45 min) is the path
- No pre-D.3 operator action required
- Cert issuer corrected from "Let's Encrypt" to "Google Trust Services WE1"
- Staging does NOT have wildcard SSL (per-tenant single-domain certs); production gets wildcard in D.3

---

## Stage D Day D.2 — F-1 + F-3 + DEV.64 + DEV.73 (Current — Thursday May 28)

**Goal:** Ship 4 substantial work items in priority order: framework upgrade, security hardening, infrastructure improvement, and feature gap closure.

**This is the longest day of Stage D.** Expect a full focused day.

**Estimated time:** 6-8 hours total

- F-1 (Next.js upgrade): 3-4 hours including full regression
- F-3 (Login rate limit): 1-2 hours
- DEV.64 (Spec sync workflow): 1-2 hours
- DEV.73 (Reserved slugs): 30-45 min

**Order matters:** F-1 first because framework upgrade affects everything. F-3 second (auth changes belong on top of upgraded Next.js). DEV.64 third (infrastructure improvement, independent surface). DEV.73 fourth (small, validation-only, end-of-day work).

**Critical:** Each item ships as its own commit. Don't batch. If any item surfaces unexpected issues, surface and discuss before continuing — don't carry hidden risk into later items.

### Prompt for Claude Code

````
You are implementing Stage D Day D.2 of the Dealerlink build. Production environment is live at app.dealerlink.in (D.0-D.1 complete; DNS architecture documented). Today closes 4 deferred items in priority order:

PART 1 (3-4 hours): F-1 — Next.js upgrade to ≥14.2.35 (CVE-2025-29927)
PART 2 (1-2 hours): F-3 — Login rate limit + account lockout
PART 3 (1-2 hours): DEV.64 — app.yaml ↔ live spec sync workflow
PART 4 (30-45 min): DEV.73 — Reserved tenant slug rejection

Each part is independent. Each commits separately. If any part surfaces unexpected issues, STOP and surface before continuing.

PRELIMINARY:
P.1. `pnpm preflight` confirms green.
P.2. Read SECURITY_AUDIT.md F-1 + F-3 sections (the original audit findings from C.4)
P.3. Read DEVIATIONS.md DEV.64 + DEV.73 entries
P.4. Read STAGE_D_HANDOFF.md §4 (resolved-findings-to-address) and §6 (DNS architecture context)
P.5. Read package.json — current Next.js version (14.2.18)
P.6. Read apps/web/lib/security/rate-limit.ts (or equivalent — the existing checkRateLimit primitive used on /api/health)
P.7. Read apps/web/lib/auth/login.ts — the action F-3 modifies
P.8. Read .do/app.production.yaml — current production spec

PRIMARY REFERENCES:
1. SECURITY_AUDIT.md F-1, F-3
2. CVE-2025-29927 details (Next.js middleware authorization bypass)
3. Existing checkRateLimit primitive (already proven working on /api/health)
4. CLAUDE.md §6 (auth + login flow)

==========================================================
PART 1 — F-1 NEXT.JS UPGRADE (PRIORITY 1, 3-4 HOURS)
==========================================================

Background:
- CVE-2025-29927 is a critical middleware authorization bypass in Next.js <14.2.25
- Architecturally mitigated in our app (we don't use middleware for auth per DEV.68 — auth is in layouts + actions + RLS)
- Still must upgrade to ≥14.2.35 for production hygiene
- Framework bump needs full regression pass; this is why C.4 deferred it to Stage D

CHUNK D2a — Next.js upgrade prep + version bump
---------------------------------

A1.1. Pre-upgrade snapshot:
   - Git status clean
   - All gates green (preflight + typecheck + lint + test + verify)
   - Tag pre-upgrade state: `git tag d2-pre-nextjs-upgrade` (local only, for rollback reference)

A1.2. Identify all Next.js-related packages to upgrade:
   - next (currently 14.2.18 → ≥14.2.35; recommend latest 14.x stable for security patches)
   - eslint-config-next (match next version)
   - @next/* packages if any
   - Check if @sentry/nextjs has a minimum Next.js version requirement
   - Document which version to upgrade to (latest 14.2.x, NOT 15.x — that's a major upgrade with breaking changes)

A1.3. Upgrade Next.js:
   - `pnpm --filter web add next@^14.2.35 eslint-config-next@^14.2.35`
   - This updates the workspace package
   - DO NOT upgrade to Next.js 15.x — major version with breaking changes; out of scope for pilot

A1.4. First verification — pnpm install:
   - Run `pnpm install --frozen-lockfile` (should fail because we just changed dep)
   - Run `pnpm install` (regenerates lock file)
   - Verify no peer dep warnings or errors
   - Document the new lock file changes briefly

A1.5. Pre-build smoke:
   - `pnpm --filter web typecheck` — must pass with new Next.js version
   - `pnpm --filter web lint` — must pass
   - `pnpm --filter web build` — must succeed
   - If any step fails: debug + document the failure; don't proceed until clean

COMMIT D2a: `chore(deps): upgrade Next.js 14.2.18 → 14.2.35 (CVE-2025-29927)`

CHUNK D2b — Regression test pass
---------------------------------

A2.1. Run full local test suite:
   - `pnpm test` — all unit tests (expect 465+ passing as of D.1)
   - `pnpm verify` — all E2E specs (expect 57/57 as of D.1)
   - All must pass; document any new failures
   - If Playwright hangs, kill orphan processes from a separate shell (the documented pattern)

A2.2. Specific smoke checks for Next.js upgrade impact:
   - Server Actions still work (login, change-password, quotation create)
   - RSC streaming still works (dashboard, list pages render with data)
   - Image optimization still works (logo on PDF templates if any)
   - Sentry integration still works (`@sentry/nextjs` is sensitive to Next.js version)
   - Middleware behavior unchanged (we don't use it for auth, but it exists)

A2.3. Local smoke check against dev DB:
   - `pnpm dev` starts cleanly
   - Login flow works
   - Force-password-change flow works (C.1 closure)
   - State display works (C.2 closure)
   - PDF generation works (queue-based per ADR-013)
   - Reports load

A2.4. Push to main → triggers staging auto-deploy:
   - Wait for staging deploy ACTIVE
   - Run critical-path E2E against staging: `PLAYWRIGHT_BASE_URL=https://demo.staging.dealerlink.in pnpm --filter web exec playwright test critical-path --project=chromium`
   - All 27 steps must pass on staging with the upgraded Next.js
   - If anything fails on staging that passes locally: investigate before continuing

A2.5. Production deploy (via doctl spec update per DEV.64 pattern):
   - Production spec doesn't need changes for Next.js upgrade — version is in package.json, not in spec
   - But the production app needs to redeploy to pull the new package.json
   - Trigger production redeploy: `doctl apps create-deployment <prod-app-id>`
   - OR: push triggers staging redeploy; production redeploy is manual (per DEV.64 — DEV.64 is PART 3's work)
   - For today: explicitly trigger production deploy after staging verification
   - Wait for production deploy ACTIVE
   - Verify /api/health on app.dealerlink.in still green

A2.6. Production smoke:
   - Login as operator
   - Navigate dashboard, settings
   - Verify no Sentry errors during the smoke
   - Confirm Next.js version in production: `curl -I https://app.dealerlink.in | grep -i x-powered-by` or via /api/health if it exposes version

A2.7. Document upgrade in DEVIATIONS.md:
   - Mark F-1 as ✅ CLOSED
   - Reference commit SHA
   - Note: full regression passed (465 unit + 57 verify + critical-path on staging + smoke on production)

COMMIT D2b: `test(prod): F-1 Next.js upgrade verified — full regression pass + production deploy`

==========================================================
PART 2 — F-3 LOGIN RATE LIMIT + LOCKOUT (PRIORITY 2, 1-2 HOURS)
==========================================================

Background:
- F-3 was deferred from C.4 for production: bounded for pilot (≤5 trusted users), but must-fix before pilot scales
- The checkRateLimit primitive already exists from /api/health work; F-3 extends it to login()
- Recommended thresholds: 5 attempts / 15-min window, then 30-min lockout

CHUNK D2c — Extend rate-limit primitive + apply to login
---------------------------------

A3.1. Review existing checkRateLimit primitive:
   - Confirm its API and current usage on /api/health
   - Verify it's pluggable (different keys, windows, max attempts per use case)
   - If primitive needs extension, document what changes

A3.2. Add login rate limit:
   - In apps/web/lib/auth/login.ts (or equivalent login action)
   - Key: `login:<email>` (per-email, not per-IP — better signal for B2B SaaS)
   - Window: 15 minutes
   - Max attempts: 5
   - After 5 failed attempts in 15 min: return rate-limit error WITHOUT revealing whether email exists (preserves non-enumerable login errors)
   - Successful login: reset the counter for that email

A3.3. Add account lockout:
   - Separate from rate limit (which is short-term)
   - After cumulative 10 failed attempts across any windows: 30-min lockout
   - Lockout is tracked in DB (users.lockout_until timestamp column — add if not present via migration)
   - Lockout duration: 30 min
   - After lockout expires, counter resets
   - Operator can manually clear lockout via admin action (runbook entry needed)

A3.4. Schema migration if needed:
   - If users.lockout_until doesn't exist: add via Drizzle migration
   - Column: TIMESTAMP NULL, no default
   - Audit log trigger continues to fire on user updates (no special handling needed)

A3.5. Update login action logic:
   - Check rate limit BEFORE password verification (prevents timing attacks on rate-limit logic)
   - Check lockout status before password verification
   - On failed attempt: increment counter; if 5+ in window → return rate limit error; if 10+ cumulative → set lockout_until
   - On success: clear counter, clear lockout_until
   - All paths return generic "Invalid email or password" — never reveal lockout/rate-limit status to clients (security through obscurity at the user-facing message level)

A3.6. Add tests:
   - Unit: 5 successful logins don't trigger rate limit
   - Unit: 5 failed attempts in 15 min → 6th returns rate limit error
   - Unit: 10 cumulative failures → lockout set; even correct password rejected during lockout
   - Unit: lockout expires after 30 min, counter resets
   - Integration: rate limit error message matches "Invalid email or password" (non-enumerable)

A3.7. Runbook entry:
   - Add to RUNBOOKS.md: "Operator: clear user lockout"
   - SQL command (operator-only): `UPDATE users SET lockout_until = NULL WHERE email = '<email>';`
   - When to use: legitimate user locked out after typo attempts; operator manually clears

A3.8. Test locally then push:
   - pnpm test (all new tests pass)
   - pnpm typecheck + lint
   - Push to main → staging auto-deploy
   - Test on staging: deliberately fail login 5 times, verify rate-limit message
   - Production deploy: `doctl apps create-deployment <prod-app-id>` (manual trigger per DEV.64)

A3.9. Mark F-3 ✅ CLOSED in SECURITY_AUDIT.md and DEVIATIONS.md.

COMMIT D2c: `feat(security): F-3 login rate-limit + account lockout`

==========================================================
PART 3 — DEV.64 APP.YAML ↔ LIVE SPEC SYNC WORKFLOW (PRIORITY 3, 1-2 HOURS)
==========================================================

Background:
- DEV.64 documented the brittleness: editing .do/app.yaml doesn't auto-deploy; requires `doctl apps update --spec`
- We've been doing it manually throughout Stage D
- D.2 establishes a sustainable workflow

CHUNK D2d — Spec sync automation
---------------------------------

A4.1. Decide automation approach:
   - Option A: GitHub Action that detects .do/app.production.yaml changes + runs doctl apps update --spec
     - Pros: fully automated; same as code-deploy pipeline
     - Cons: requires DO API token in GitHub secrets (rotatable)
   - Option B: Pre-commit hook or push hook locally that runs doctl apps update --spec when production spec changes
     - Pros: no GitHub secrets
     - Cons: depends on operator's local environment
   - Option C: Document a tight manual workflow (script + checklist)
     - Pros: simplest; no automation overhead
     - Cons: still manual, just less error-prone

   Recommend Option A for production-grade sustainability. Operator confirmation before proceeding.

A4.2. If Option A (GitHub Action):
   - Create .github/workflows/sync-prod-spec.yml
   - Trigger: push to main with changes to .do/app.production.yaml
   - Step: `doctl apps update <prod-app-id> --spec .do/app.production.yaml`
   - Requires GitHub repository secret: DO_API_TOKEN
   - Operator must add the secret in GitHub settings
   - First run after merge: confirm it works by making a no-op spec edit + watching the workflow

A4.3. If Option B or C: implement and document.

A4.4. Update documentation:
   - DEPLOYMENT.md: document the sync workflow
   - STAGE_D_HANDOFF.md: mark DEV.64 ✅ closed
   - Add to RUNBOOKS.md: "How to deploy a production spec change"

A4.5. Verify workflow on a test edit:
   - Make a small, safe spec edit (e.g., comment update in .do/app.production.yaml)
   - Push to main
   - Verify the workflow triggers and the deployment succeeds
   - Confirm production /api/health still green

COMMIT D2d: `feat(infra): DEV.64 app.yaml → live spec sync workflow`

==========================================================
PART 4 — DEV.73 RESERVED SLUG REJECTION (PRIORITY 4, 30-45 MIN)
==========================================================

Background:
- DEV.73 surfaced in D.0: tenant creation doesn't reject reserved slugs (app, www, admin, etc.)
- Routing already reserves them so it's not a security risk
- But pilot tenant slug in Stage E shouldn't conflict — add validation now

CHUNK D2e — Reserved slug enforcement
---------------------------------

A5.1. Define the canonical reserved slug list in code:
   - Create or update packages/schemas/src/reserved-slugs.ts:
     ```
     export const RESERVED_SLUGS = new Set([
       'app', 'www', 'api', 'admin', 'blog',
       'docs', 'status', 'mail', 'staging',
       'support', 'help', 'mail', 'smtp', 'pop',
       'ftp', 'cdn', 'media', 'static'
     ]);
     ```
   - Single source of truth; don't duplicate elsewhere

A5.2. Add validation to tenant creation Zod schema:
   - In packages/schemas/src/tenant.ts (or wherever tenant slug is validated)
   - Add custom refinement: `.refine(slug => !RESERVED_SLUGS.has(slug.toLowerCase()), { message: "This slug is reserved and cannot be used" })`
   - Add to slug format validation: must be lowercase, alphanumeric + dash, 3-50 chars
   - Case-insensitive check (test "App", "APP", "app" all rejected)

A5.3. Update operator-onboarding action to use the validated schema:
   - Confirm the tenant creation flow uses the new schema
   - If somewhere bypasses Zod, fix to use it

A5.4. Add tests:
   - Unit: each reserved slug rejected
   - Unit: case variations rejected (App, APP, aPp)
   - Unit: valid slugs accepted (acme, demo-company, solar-1)
   - Integration: tenant creation rejects "app", returns clear error

A5.5. Local test + staging + production:
   - pnpm test passes
   - Push to main → staging deploy
   - Production deploy via doctl (or now via DEV.64 automation if D.2d completed)

A5.6. Mark DEV.73 ✅ CLOSED in DEVIATIONS.md.

COMMIT D2e: `feat(tenants): DEV.73 reject reserved slugs at tenant creation`

==========================================================
CHUNK D2f — Day closeout
==========================================================

A6.1. Verify all gates green:
   - pnpm preflight
   - pnpm typecheck, lint, test, verify
   - Production /api/health all green
   - Sentry shows no new errors from D.2 changes

A6.2. Update SECURITY_AUDIT.md:
   - F-1 ✅ CLOSED (reference commit)
   - F-3 ✅ CLOSED (reference commit)
   - Remaining: F-2 already closed in C.4; F-4 through F-9 deferred to post-pilot
   - Update overall posture: "Remaining findings are post-pilot improvements; no pilot-blockers"

A6.3. Update STAGE_D_HANDOFF.md:
   - Mark D.2 ✅ in Stage D Progress section
   - All 4 items ✅: F-1, F-3, DEV.64, DEV.73
   - D.3 cleared to start

A6.4. Update PROJECT_PLAN.md:
   - D.2 ✅ with date 2026-05-28
   - All 4 items checked off in carried-forward section

A6.5. Final commit:
   - `feat(stage-d): Day D.2 complete — Next.js upgrade + rate limit + spec sync + reserved slugs`
   - Push to main

GUARDRAILS (D.2):
- Each PART commits separately. Don't batch a framework upgrade with auth changes with infrastructure changes — that's 4 distinct review surfaces.
- F-1 (Next.js upgrade) MUST pass full regression before proceeding. If any test fails, STOP — surface to operator before continuing.
- F-3 (rate limit + lockout) MUST NOT change the user-facing error message. "Invalid email or password" for ALL failure paths (preserves non-enumerable behavior per C.4 audit).
- DEV.64 automation needs operator confirmation on which option (A/B/C) before proceeding. Don't assume.
- DEV.73 reserved-slug list is in code, not config. Future additions are code commits, intentional.
- Don't upgrade to Next.js 15.x — major version, breaking changes, out of scope.
- Don't rotate any production secrets today (operator hasn't requested; would invalidate Sentry/Resend/etc. wired in D.1).
- Each PART has a manual smoke check on production after deploy. Don't skip — production behaves differently than local.

WHEN DONE:
- Print summary: F-1 ✅, F-3 ✅, DEV.64 ✅, DEV.73 ✅
- Confirm: 5 chunk commits + closeout commit (6 total)
- Confirm: /api/health on production all green
- Confirm: Critical-path E2E passes on staging after Next.js upgrade
- Confirm: F-3 rate limit + lockout verified by deliberate failed-login attempts on staging
- Confirm: DEV.64 spec sync workflow chose option (A/B/C) and verified working
- Confirm: DEV.73 reserved slug "app" rejected on staging
- Tell me D.2 is complete and Day D.3 (wildcard SSL + production smoke + pilot dry run) is next
````

### Verification checklist (operator)

#### F-1 (Next.js upgrade)

- [ ] package.json shows next ≥14.2.35
- [ ] pnpm test passes (465+)
- [ ] pnpm verify passes (57/57)
- [ ] Critical-path E2E passes on staging
- [ ] Production redeploy completes; /api/health green
- [ ] Manual smoke on production — login + dashboard + state display + PDF + reports all work

#### F-3 (Rate limit + lockout)

- [ ] users.lockout_until column exists (if added)
- [ ] 5 failed logins in 15 min → 6th rejected with "Invalid email or password"
- [ ] 10 cumulative failures → user locked out
- [ ] After 30 min lockout expires, login works
- [ ] Operator can manually clear lockout per runbook

#### DEV.64 (Spec sync)

- [ ] Workflow chosen (A/B/C) and documented
- [ ] Test edit triggered automated deploy (if A)
- [ ] DEPLOYMENT.md + RUNBOOKS.md updated

#### DEV.73 (Reserved slugs)

- [ ] Tenant creation rejects "app", "www", "admin"
- [ ] Case variations rejected (App, APP)
- [ ] Valid slugs accepted (acme, solar-1)

#### Closeout

- [ ] SECURITY_AUDIT.md F-1 + F-3 marked ✅
- [ ] STAGE_D_HANDOFF.md D.2 ✅
- [ ] PROJECT_PLAN.md D.2 ✅
- [ ] All gates green

---

## Stage D Day D.3 — Wildcard SSL + Production Smoke + Pilot Dry Run (Friday May 29)

_Will be added when D.2 closes. Per STAGE_D_HANDOFF.md §6 D.3 plan: Option A (DO native wildcards, ~30-45 min). Then full critical-path E2E on production. Then pilot tenant creation procedure documented for Stage E._

---

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts added at close of Stage D._
