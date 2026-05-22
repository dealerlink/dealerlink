# Stage C — Validation Prompts

Stage C runs from May 21 to May 27, 2026 (6 working days + 1 buffer absorbed by C.0 sprawl). Goal: validate the Stage B build is production-ready, deploy staging environment, close the two known feature gaps (force-password-change, state normalization), security + performance audit, and prepare for Stage D production deploy.

**Pilot target:** Production live Wednesday, June 3, 2026.
**Staging available to pilot customer:** Monday, May 25, 2026 (after C.2 wraps).

## Schedule

| Stage C Day   | Date               | Focus                                                           | Status      |
| ------------- | ------------------ | --------------------------------------------------------------- | ----------- |
| C.0           | Thu-Fri May 21-22  | DO staging deploy + DNS + SSL + DEV.63 architectural correction | ✅ Done     |
| Doc hygiene   | Sat May 23 morning | STAGE_C_HANDOFF evolution, ADR-013, CLAUDE.md cleanup           | ✅ Done     |
| **C.1**       | **Sat May 23**     | **Force-password-change build (closes DEV.56)**                 | **Current** |
| C.2           | Sun May 24         | State code normalization (closes DEV.33)                        | ⏳          |
| C.3           | Mon May 25         | Pilot staging handoff + UX walkthrough                          | ⏳          |
| C.4           | Tue May 26         | Security audit (RLS + roles + secrets)                          | ⏳          |
| C.5           | Wed May 27         | Performance testing + Stage D handoff                           | ⏳          |
| Stage D start | Thu May 28         | Production environment provisioning                             | —           |

---

## Stage C Day C.0 — Staging Deploy (✅ Complete — May 21-22, 2026)

Retrospective: this day was originally scoped as a single day. It ran into roughly 1.5 calendar days due to surfacing latent bugs that local Docker development could not have caught.

**Commits:** 10189ab → 55350fb (and follow-up fixes)

**What shipped:**

- DO Managed Postgres provisioned in BLR1 (PG 16, ~$15/month)
- DO App Platform with web (basic-xs) + workers (basic-xxs, custom Dockerfile) — total ~$30/month
- Cloudflare DNS (gray-cloud, DNS-only)
- Let's Encrypt SSL on apex + demo.staging + sample.staging subdomains
- staging.dealerlink.in fully reachable with all routes working
- All 4 PDF paths functional (quotation, PI, payment receipt, dispatch note)
- Critical-path E2E (27 steps) passes against staging in 48.6s

**Deviations logged (DEV.57-67):**

- DEV.57: managed-PG role ALTER
- DEV.58-59: pg-boss TLS chain
- DEV.60: apex-domain hardcoding
- DEV.61: connection-pool caps
- DEV.62: db client created a new pool on every access in production
- DEV.63: PDF rendering architectural correction — moved from web subprocess to pg-boss queue per CLAUDE.md §7 line 336 (now promoted to ADR-013)
- DEV.64: .do/app.yaml ↔ deployed-spec sync workflow gap
- DEV.65: corepack signature check failure → switched to npm install -g pnpm
- DEV.66: cold-start timeout adjusted to 120s
- DEV.67: idle-recycle widened to 45 minutes; worker sizing flagged for Stage D

**Key learnings carried forward:**

- Staging environment surfaces bugs that local dev cannot
- DO App Platform monorepo + pnpm requires deliberate buildpack handling
- Spec drift (repo vs live) needs a sync workflow in Stage D
- Worker instance sizing is a Stage D data-driven decision based on real PDF load

---

## Doc Hygiene Pass (✅ Complete — May 23, 2026)

Brief mid-stream pass after C.0 to align docs with reality.

**Commits:** ad21d3a → 1078826

**What shipped:**

- `docs/STAGE_C_HANDOFF.md` evolved with "Stage C Progress (Living)" + "Carried-Forward To Stage D" sections
- `CLAUDE.md` line 151 (hosting) clarified + "Last reviewed" stamp added
- `DECISIONS.md` ADR-013 added (Puppeteer queue isolation as permanent structural constraint, promotes DEV.63)
- `PROJECT_PLAN.md` changelog entry for 2026-05-23

---

## Stage C Day C.1 — Force-Password-Change (Current — Saturday May 23)

**Goal:** Build the force-password-change flow per CLAUDE.md §6 and ADR-010. New users (operator-created tenant admins, admin-created sales/accounts/dispatch users) must change their temporary password before accessing the app. Closes DEV.56.

**Estimated time:** 3-4 hours

**Deliverable:** New users created with `must_change_password=true` are redirected to `/change-password` on every request until they set a new password. Existing seed users have the flag false (already changed). Operator-onboarding spec from Stage B Day 18 updated to verify the new flow.

### Prompt for Claude Code

````
You are implementing Stage C Day C.1 of the Dealerlink build. Stage C Day C.0 (staging deploy + DEV.63 architectural correction) completed on 2026-05-22. Doc hygiene pass completed on 2026-05-23. Today closes DEV.56 (carried forward from Stage B Day 18): the force-password-change flow that CLAUDE.md §6 describes but no route ships for.

PRELIMINARY:
P.1. `pnpm preflight` confirms 17 green checks.
P.2. Read CLAUDE.md §6 (multi-party logic + auth) — focus on the force-password-change spec. Confirm the rule is documented even if not implemented.
P.3. Read DECISIONS.md ADR-010 (temp-pwd flow) — establishes the contract.
P.4. Read DEVIATIONS.md DEV.56 — the gap this day closes.
P.5. Read apps/web/middleware.ts (or wherever route-level middleware lives) — today's flow plugs into this.
P.6. Read apps/web/lib/auth/ (Lucia integration from Day 2) — password update API.
P.7. Read apps/web/tests/e2e/operator-onboarding.spec.ts — Day 18's spec that documented the current behavior; today's flow makes that spec's assertion true.
P.8. Read packages/db/src/schema/users.ts — confirm `must_change_password` boolean field exists. If not, today adds it via migration.

PRIMARY REFERENCES:
1. CLAUDE.md §6 (force-password-change spec)
2. ADR-010 (temp-pwd flow contract)
3. apps/web/middleware.ts (route-level guards)
4. apps/web/app/(auth)/login/page.tsx (existing login flow — this is the pattern to follow)
5. Day 4 operator-onboarding logic (sets initial temp passwords)
6. Day 2 Lucia integration (session + password APIs)

==========================================================
TRACK A — FORCE-PASSWORD-CHANGE (CHUNKED — 4 chunks)
==========================================================

CHUNK C1a — Schema + state setup
---------------------------------

A1.1. Audit current users schema:
   - Check if `must_change_password` column exists on users table
   - If yes: skip migration; confirm default value
   - If no: add via new migration:
     ```
     ALTER TABLE users
       ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
     ```
   - Index not needed (boolean, low cardinality, only checked at session middleware)

A1.2. Update seed scripts:
   - Existing seeded users (admin@demo.test, sales@demo.test, etc.) have `must_change_password=false` (they've "already changed" their password)
   - This preserves test backwards compatibility — no E2E specs need to adapt

A1.3. Update Day 4 operator-onboarding action:
   - When operator creates a new tenant's admin user, set `must_change_password=true` AND generate the temporary password
   - Log the temp password to email_delivery_log (queued for Day 14's pg-boss handler to actually email)
   - Audit log entry captures: tenant created, admin user created with temp password

A1.4. Update Day 3+ admin-user-creation actions:
   - When tenant admin creates a sales/accounts/dispatch user, set `must_change_password=true` AND generate temp password
   - Same email log pattern
   - This applies to all tenant-admin-level user creation flows

A1.5. Update existing tenant admins manually:
   - Add to packages/db/src/seeds/index.ts: existing seeded admins explicitly set `must_change_password=false`
   - This is intentional — they're the test users that scripts depend on

A1.6. Generate migration via Drizzle. Verify migration applies cleanly to local DB.

A1.7. Verify locally: pnpm preflight green, pnpm typecheck green.

COMMIT C1a: `feat(auth): chunk a — must_change_password schema + seed updates`

CHUNK C1b — Route + form + server action
---------------------------------

A2.1. Create app/(auth)/change-password/page.tsx:
   - Auth required (Lucia session must exist; user must be logged in)
   - Display form: current password, new password, confirm new password
   - Note: "current password" is the temporary one they were emailed
   - Submit calls changePassword server action

A2.2. Create apps/web/lib/auth/change-password.ts server action:
   - Input validation via Zod: current password, new password (≥8 chars, must include at least 1 letter + 1 digit OR be ≥16 chars — flexible policy), confirm password matches
   - Verify current password via Lucia
   - On success: update Lucia password + set `must_change_password=false` atomically
   - On failure (wrong current password OR new password too weak): return structured error
   - After success: redirect to /dashboard (tenant) or /admin (operator) based on user role
   - Audit log entry captures: user changed password (no password values)
   - Trigger Axiom event: user.password_changed

A2.3. Update middleware to check `must_change_password`:
   - In apps/web/middleware.ts (or wherever route-level middleware exists)
   - After session resolution, if `user.must_change_password === true`:
     - If request path is /change-password OR /logout: allow through
     - If request path is anything else: redirect to /change-password
   - This is the "force" mechanism — they can't escape until the flag clears

A2.4. Update login flow to flag-clear redirect:
   - On successful login, if `must_change_password=true`: redirect to /change-password instead of /dashboard
   - This is the entry point for new users

A2.5. UI polish per the design system:
   - Empty state should never appear (the page only renders when user has a valid session)
   - Loading state on form submit
   - Error state with clear validation messages
   - Password strength indicator on the new password field (optional but nice)
   - "What is this?" tooltip explaining why they're here
   - "Logout" link visible at bottom (the only escape route besides changing password)

A2.6. Add tests:
   - Unit: changePassword action validates inputs, updates password, clears flag
   - Integration: middleware redirects when flag is true, allows through after flag clears
   - Integration: login redirects to /change-password when flag is true
   - All cases: wrong current password, weak new password, password mismatch

COMMIT C1b: `feat(auth): chunk b — change-password route + middleware enforcement`

CHUNK C1c — Operator-onboarding spec update + manual flow check
---------------------------------

A3.1. Update apps/web/tests/e2e/operator-onboarding.spec.ts (the Stage B Day 18 spec that documented the gap):
   - Original spec asserted "force-password-change route doesn't exist; new users land on /dashboard"
   - Update to assert the actual behavior:
     - Login as new admin user with temp password
     - Verify redirect to /change-password (not /dashboard)
     - Fill the form with new password
     - Submit
     - Verify redirect to /dashboard (now successful)
     - Verify subsequent login lands on /dashboard directly (flag is now false)
   - This spec now passes with the real flow; the comment about "gap" is removed

A3.2. Add a fresh verify-day-c1.spec.ts:
   - Login as a fresh user with must_change_password=true (seeded via a setup step)
   - Verify forced redirect to /change-password from any route
   - Submit password change form successfully
   - Verify access to /dashboard
   - Logout, login with new password (not the temp one) — should work
   - Logout, login with OLD temp password — should fail

A3.3. Manual check (run against local dev DB):
   - Run a setup script that creates a test user with must_change_password=true
   - Login as that user → should land on /change-password
   - Try to navigate to /dashboard manually → should redirect back to /change-password
   - Fill form, submit → should land on /dashboard
   - Logout, login again with new password → should succeed and land on /dashboard

A3.4. Verify staging-compatible:
   - Push to main triggers staging redeploy
   - On staging: create a fresh user via the operator-onboarding flow
   - Verify the full force-password-change flow works on staging.dealerlink.in

COMMIT C1c: `feat(auth): chunk c — operator-onboarding spec + verify-day-c1 spec`

CHUNK C1d — Documentation + DEV.56 closure + closeout
---------------------------------

A4.1. Update CLAUDE.md §6:
   - The force-password-change spec was already documented; now reference the actual implementation:
     - Add to §6: "**Implementation:** see `apps/web/app/(auth)/change-password/`. Middleware at `apps/web/middleware.ts` enforces the redirect. Closed by Stage C Day C.1 (DEV.56)."
   - Update the "Last reviewed" stamp at the top of CLAUDE.md to 2026-05-23

A4.2. Update DEVIATIONS.md:
   - Mark DEV.56 as ✅ Closed by Stage C Day C.1 (2026-05-23)
   - Add closure note: "Force-password-change flow implemented per CLAUDE.md §6 + ADR-010. Operator-onboarding spec from Day 18 updated to verify the new behavior."

A4.3. Update docs/STAGE_C_HANDOFF.md:
   - Mark C.1 as ✅ in the "Stage C Progress (Living)" section
   - Update DEV.56 status in the Carried-Forward section from "in progress — C.1" to "✅ Closed — C.1"

A4.4. Update docs/WORKFLOWS.md:
   - Add a section: "First Login Experience for New Users"
   - Step-by-step: operator creates tenant → tenant admin receives email with temp password → first login forces password change → access dashboard
   - Same flow for tenant-admin-created users

A4.5. Update docs/RUNBOOKS.md:
   - Add runbook entry: "User Forgot Their New Password"
     - Operator (or tenant admin for their tenant) can reset by setting must_change_password=true + generating a new temp password
   - Add runbook entry: "Disabling Force-Password-Change for Testing"
     - Set must_change_password=false directly in DB for the user (dev only; never in production)

A4.6. Closeout per template:
   - pnpm preflight green
   - pnpm typecheck, pnpm lint, pnpm test (new tests pass), pnpm verify (53/53 or 54/54 with the new verify-day-c1 spec)
   - PROJECT_PLAN.md mark C.1 ✅ with today's date + brief notes
   - PROJECT_PLAN.md changelog entry for 2026-05-23
   - Final commit: `feat(auth): Stage C Day C.1 complete — force-password-change closes DEV.56`
   - Push to main (auto-deploys to staging)

A4.7. Post-deploy verification:
   - Verify staging build succeeds
   - Verify staging.dealerlink.in still works
   - Manual smoke: login on staging with existing seeded user (must_change_password=false) → lands on /dashboard normally

COMMIT C1d: as above

==========================================================
GUARDRAILS (STAGE C DAY C.1)
==========================================================

- The `must_change_password` flag is a one-way trapdoor: starts true for new users, becomes false on successful password change. Never re-set to true except via explicit admin/operator action (the "reset password" flow in RUNBOOKS).

- The middleware redirect logic must ALLOW /change-password and /logout. Otherwise users with the flag set can never reach the change-password form (infinite redirect).

- The middleware redirect logic must check AFTER session resolution. If session is null, fall through to the normal login redirect — don't redirect to /change-password before login.

- Password change requires the user to provide the CURRENT password (the temp one). This prevents an attacker with session hijacking from setting a new password without knowing the temp.

- All password operations go through Lucia's password API. Do NOT hash passwords manually. Do NOT store passwords in any state other than Lucia's argon2-hashed form.

- Audit log entry on password change does NOT include any password value. Just "user X changed password at time T."

- Existing seeded users have must_change_password=false. Their behavior is unchanged. All Day 1-18 E2E specs should continue to pass without modification.

- Trigger Axiom event user.password_changed on success (per Day 17 taxonomy).

- The change-password page is the ONLY page accessible (besides /logout) when the flag is true. This is the "force" in force-password-change.

WHEN DONE:
- Print summary, 4 chunk commits
- Confirm: DEV.56 ✅ closed
- Confirm: operator-onboarding spec from Day 18 now passes the assertion (instead of documenting the gap)
- Confirm: verify-day-c1 spec passes
- Confirm: pnpm verify 54/54 (53 prior + 1 new)
- Confirm: existing seed users still login normally to /dashboard
- Confirm: staging redeploy succeeded after push
- Tell me Stage C Day C.1 is complete and Day C.2 (state normalization, DEV.33 closure) is next
````

### Verification checklist (for the human operator after Claude Code completes)

#### Schema + flag

- [ ] `must_change_password` column exists on users table with proper default
- [ ] Existing seeded users have flag=false
- [ ] New users created via operator-onboarding or admin-user-creation have flag=true

#### Flow

- [ ] Login as user with flag=true → forced to /change-password
- [ ] Try to navigate to /dashboard while flag=true → redirected back to /change-password
- [ ] Submit password change → flag clears, redirects to /dashboard
- [ ] Logout and login with new password → succeeds, lands on /dashboard
- [ ] Logout and login with old temp password → fails (password no longer valid)

#### Audit + observability

- [ ] Audit log shows password change events (no password values)
- [ ] Axiom event `user.password_changed` fires on success

#### Backwards compatibility

- [ ] Existing seed users still login normally to /dashboard
- [ ] All Day 1-18 E2E specs continue to pass without modification

#### Staging verification

- [ ] After push, staging redeploy succeeds
- [ ] Existing user (admin@demo.test) can still login to staging normally
- [ ] (Manual) Create a fresh user via operator-onboarding on staging → verify force-password-change works

#### Documentation

- [ ] CLAUDE.md §6 references the implementation
- [ ] CLAUDE.md "Last reviewed" stamp updated
- [ ] DEVIATIONS.md DEV.56 marked ✅ closed
- [ ] STAGE_C_HANDOFF.md C.1 marked ✅
- [ ] WORKFLOWS.md adds "First Login Experience for New Users"
- [ ] RUNBOOKS.md adds password reset runbook

#### Quality gates

- [ ] `pnpm preflight` 11/11 green
- [ ] `pnpm verify` 54/54
- [ ] All other gates green
- [ ] PROJECT_PLAN.md C.1 ✅

---

## Stage C Day C.2 — State Code Normalization (Sunday May 24)

_Will be added when C.1 is complete. Closes DEV.33; normalizes state storage from full names ("Maharashtra") to 2-letter codes ("MH") per CLAUDE.md §5. Tax engine validation: every order recomputes to the same totals under new format. Migration touches tenant_settings, dealers, quotations, performa_invoices, orders, dispatches._

## Stage C Day C.3 — Pilot Staging Handoff + UX Walkthrough (Monday May 25)

_Will be added when C.2 is complete. Provide staging credentials to pilot customer with onboarding guide. Operator (you) does 2-hour walkthrough first, captures findings to docs/UX_FINDINGS.md. Pilot evaluates over the day, captures their findings. Both feed into C.4-C.5._

## Stage C Day C.4 — Security Audit (Tuesday May 26)

_Will be added when C.3 is complete. RLS verification across all tenant-scoped tables, role enforcement audit, secrets inventory, OWASP top-10 checklist for public-facing routes, Sentry PII scrubbing verification, audit log completeness verification._

## Stage C Day C.5 — Performance Testing + Stage D Handoff (Wednesday May 27)

_Will be added when C.4 is complete. Load test against staging (PDF generation, concurrent dispatches, payment allocations, pg-boss queue depth), worker instance sizing decision per DEV.67, final docs/STAGE_D_HANDOFF.md generated._

---

## Stage D — Production Deployment (May 28 - May 31)

_Detailed prompts added at the close of Stage C. Stage D provisions production environment (separate DO project, larger instance sizes, real Resend domain + DKIM, production observability DSNs, backup configuration)._

## Stage E — Pilot Launch (June 1 - June 3)

_Detailed prompts added at the close of Stage D. Provision pilot tenant in production, training session prep, final dry run, go-live Wednesday June 3._
