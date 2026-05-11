# BUILD_PROMPTS.md — Claude Code Daily Build Prompts

> **Purpose:** Day-by-day prompts for Claude Code during Stage B (the 3.5-week build). Each day is a focused session with a clear deliverable.
>
> **How to use:**
>
> 1. Open Claude Code in your `dealerlink` repo
> 2. Confirm `CLAUDE.md` is at the repo root (Claude Code reads it automatically)
> 3. Copy-paste the day's prompt below into Claude Code
> 4. Stay near the keyboard for the first ~30 minutes — Claude Code may ask clarifying questions
> 5. After the deliverable is done, **update `PROJECT_PLAN.md`** to tick the day's task and add the date
>
> **Companion files:**
>
> - `CLAUDE.md` — implementation guide (Claude Code's primary reference)
> - `DECISIONS.md` — locked decisions
> - `PROJECT_PLAN.md` — task tracker
> - `SETUP.md` — local dev setup

---

## Day 1 — Repo Scaffold + Design System Foundation

**Goal:** Get a Next.js app running at `localhost:3000` with the Dealerlink design tokens, fonts, and base layout (Sidebar + Topbar + Shell). At end of day, you should be able to navigate the empty shell and see the design system in place.

**Estimated time:** 4–6 hours of Claude Code work + ~1 hour of your review

**Deliverable:** A running Next.js app with no functional features but the complete visual foundation, ready for Day 2 to add auth.

### Prompt for Claude Code

```
You are implementing Day 1 of the Dealerlink build per the day-by-day plan in CLAUDE.md §17.

PRIMARY REFERENCES (read in order, do not skip):
1. CLAUDE.md — your authoritative implementation guide (especially §0 brand naming, §3 tech stack, §4 project structure, §5 design system, §19 engineering standards)
2. DECISIONS.md — the 8 ADRs that locked our architecture
3. docs/Distribyte.html — the visual prototype to match pixel-perfectly (note: this file says "Distribyte" but the product is "Dealerlink" per CLAUDE.md §0; silently use Dealerlink in all output)
4. docs/screens-extra.jsx and docs/tweaks-panel.jsx — additional prototype screens
5. docs/dealerlink-architecture-v4.html — architecture overview

DAY 1 SCOPE:

Phase 1 — Monorepo scaffold
1. Initialize pnpm workspace at the repo root with workspaces: apps/web, apps/workers, packages/db, packages/schemas, packages/tax, packages/design-tokens
2. Create root package.json with pnpm version 9 enforced via "packageManager" field
3. Create pnpm-workspace.yaml listing the workspaces
4. Add .npmrc with: shamefully-hoist=false, strict-peer-dependencies=true
5. Set up TypeScript with strict mode + noUncheckedIndexedAccess + exactOptionalPropertyTypes (per CLAUDE.md §19.1)
6. Set up ESLint (with import/order rule, no-floating-promises, no-explicit-any as error)
7. Set up Prettier with 2-space indent, single quotes, no semicolons (or semicolons — match shadcn/ui defaults, your call but be consistent)
8. Set up Husky + lint-staged for pre-commit hooks (run lint + typecheck on staged files)
9. Add .vscode/settings.json (format on save, ESLint auto-fix) and .vscode/extensions.json (recommended extensions per SETUP.md)

Phase 2 — Next.js app scaffold
10. In apps/web, scaffold a Next.js 14 App Router app with TypeScript
11. Install Tailwind v3 and configure it
12. Install shadcn/ui with the "new-york" style (most aligned with the prototype's editorial aesthetic). Initialize with `pnpm dlx shadcn-ui@latest init` and configure it to use the design tokens from packages/design-tokens
13. Set up next/font for Inter and IBM Plex Mono (per CLAUDE.md §4 typography rules)
14. Create app/globals.css with the CSS variables from CLAUDE.md §4 (--ink, --paper, --line, --accent, etc.)
15. Configure Tailwind to use the CSS variables (theme.extend.colors maps to var(--ink) etc.)
16. Create a tailwind.config.ts that registers the custom font families and applies font-feature-settings: "tnum", "zero" to the .mono class

Phase 3 — Base layout (no auth yet)
17. Create the App Shell at apps/web/components/shell/:
    - Sidebar.tsx — 232px wide, with the navigation items from the prototype (Dashboard, Pipeline, Dealers, Catalog, Inventory, Quotations, Orders, Payments, Dispatch, Reports, Settings)
    - Topbar.tsx — with placeholder for tenant name, search, user menu (no functionality yet)
    - Shell.tsx — wraps Sidebar + Topbar + main content area
18. Create app/(app)/layout.tsx that uses Shell
19. Create placeholder pages for each navigation item (just the route + a heading like "Pipeline (coming soon)") in apps/web/app/(app)/<route>/page.tsx
20. Match the prototype's hairline borders, paper background, and dense layout from docs/Distribyte.html. NO drop shadows on cards, NO rounded-2xl. Use box-shadow: inset 0 0 0 1px var(--line) for cards. 6px corner radius.

Phase 4 — Design system primitives
21. Create packages/design-tokens with:
    - tokens.css (the CSS variables)
    - tailwind-preset.ts (the Tailwind preset that exports color/font/spacing tokens)
22. Restyle key shadcn/ui components to match the prototype: Button, Input, Badge, Card. Add a "StatusPill" component with 6 status variants (em/am/ro/in/mu/ink) per CLAUDE.md §4
23. Create apps/web/lib/format/index.ts with a formatINR(value, options) utility that auto-scales to lakh/crore at the right thresholds (per CLAUDE.md §4 typography rules and the prototype's display style)

Phase 5 — Verification
24. Run `pnpm dev` from apps/web. Verify the app loads at localhost:3000 with the sidebar visible, fonts rendering, and design tokens applied
25. Verify `pnpm typecheck` and `pnpm lint` both pass with zero errors/warnings
26. Make an initial commit: `feat(scaffold): day 1 — monorepo, design system, base layout`

GUARDRAILS:
- Follow CLAUDE.md §14 ("What NOT to Do") strictly. No Zustand. No Recharts. No Instrument Serif.
- The prototype files say "Distribyte" — silently use "Dealerlink" everywhere
- Do NOT scaffold auth, database, or any business logic today. Day 2 handles auth.
- Do NOT use mock data beyond placeholder strings. Real data comes with the database in Day 2.
- If any decision is ambiguous, default to the locked answer in DECISIONS.md or CLAUDE.md. Don't ask me unless truly blocked.

WHEN DONE:
- Print a summary of what was created
- List any deviations from the plan with reasons
- Tell me what to verify visually before moving to Day 2
- Suggest the commit message for the work
```

### Verification checklist for you (after Claude Code finishes)

- [ ] `pnpm dev` starts without errors at http://localhost:3000
- [ ] Sidebar shows all 11 navigation items in the right order (Dashboard, Pipeline, Dealers, Catalog, Inventory, Quotations, Orders, Payments, Dispatch, Reports, Settings)
- [ ] Sidebar is exactly 232px wide
- [ ] Background is warm paper (#F7F7F4), not white
- [ ] Borders are hairline (1px), not shadows
- [ ] Inter font loads (UI text) and IBM Plex Mono loads (try inspecting any number)
- [ ] Clicking each navigation item routes to the right placeholder page
- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] Browser console has no errors
- [ ] Compare side-by-side to `docs/Distribyte.html` opened in another tab — the shell layout should match closely

### Update PROJECT_PLAN.md after Day 1

Mark `B.1` as ✅, add today's date, and append to the changelog:

```markdown
| YYYY-MM-DD | B.1 Day 1 complete — monorepo scaffold, design tokens, base layout running at localhost:3000 | — |
```

---

## Day 2 — Auth + Database Foundation

**Goal:** Drizzle schema for tenant/user/role + Lucia auth wired up + the login screen rendering and accepting credentials. By end of day, you should be able to run `pnpm db:migrate && pnpm db:seed` and log in with a seeded admin user.

**Estimated time:** 5–7 hours of Claude Code work + ~1 hour of your review

**Deliverable:** A working auth flow. Login form posts → validates → creates session → redirects to dashboard. Logout clears session. Protected routes redirect to login.

### Prompt for Claude Code

```
You are implementing Day 2 of the Dealerlink build. Day 1 shipped successfully (commit d364ad7) — monorepo, design tokens, base layout, 11 placeholder routes. Now we add the data layer and authentication.

PRIMARY REFERENCES (read in order):
1. CLAUDE.md (especially §3 stack, §5 data model, §6 logging surface, §10 auth & roles, §16 locked decisions, §19 standards)
2. DECISIONS.md (ADR-001 subdomain routing, ADR-002 admin app, ADR-008 brand)
3. docs/screens-extra.jsx — login screen with Aurora theme is the visual target
4. docs/Distribyte.html — for sidebar tenant slug display reference

DAY 2 SCOPE:

Phase 1 — Drizzle setup in packages/db
1. Add dependencies: drizzle-orm, drizzle-kit, pg, @types/pg, postgres (use the postgres-js driver, not node-postgres, for better Drizzle ergonomics)
2. Create drizzle.config.ts at the package root, pointing schema to ./src/schema/index.ts and migrations to ./migrations/
3. Create src/client.ts that exports a typed Drizzle client. Use a singleton pattern with connection pooling (max 10 connections in dev). Read DATABASE_URL from env.
4. Create src/schema/index.ts as a barrel re-exporting all schema files (this is the one allowed exception to the no-barrel-files rule per CLAUDE.md §19.1, since drizzle-kit needs a single entry point)
5. Add scripts to packages/db/package.json: db:generate, db:migrate, db:rollback, db:seed, db:studio. Wire pnpm root scripts to delegate to this package.

Phase 2 — Core schema (per CLAUDE.md §5 and §16)
6. Create these schema files in packages/db/src/schema/:
   - tenant.ts — tenants table (id, slug, legal_name, display_name, status, created_at)
   - tenant-settings.ts — tenant_settings table with all 19 columns from CLAUDE.md §16's "Tenant Configuration Surface" table (gstin, pan, address_*, state, bank_*, logo_url, primary_color, doc_prefixes JSONB, fiscal_year_start, default_currency, default_locale, default_quote_validity, default_terms, default_credit_period, low_stock_threshold, inbound_email_token, notification_prefs JSONB)
   - user.ts — users table (id, tenant_id, email, password_hash, role enum, full_name, status, created_at). Role enum: 'admin' | 'sales' | 'accounts' | 'dispatch' | 'operator'. Note: 'operator' is the platform-level role for tenant provisioning per ADR-002.
   - session.ts — sessions table (id, user_id, expires_at, created_at) — Lucia-compatible
   - document-counter.ts — document_counters table (tenant_id, doc_type, fiscal_year, last_value) for per-tenant document numbering per CLAUDE.md §5
   - audit-log.ts — audit_log table per CLAUDE.md §6 schema (id, tenant_id, entity_type, entity_id, action, before, after, changed_by, changed_at, ip, user_agent)
   - auth-events.ts — auth_events table per CLAUDE.md §6 (id, tenant_id, user_id, event_type, ip, user_agent, success, created_at)
7. Use camelCase in TypeScript, snake_case in DB (Drizzle's mapping config)
8. Add indexes on (tenant_id, *) for every tenant-scoped table
9. Add UNIQUE constraints: tenants.slug global, users(tenant_id, email), document_counters(tenant_id, doc_type, fiscal_year)

Phase 3 — Row-Level Security
10. Create packages/db/src/rls/ with one SQL file per table that needs RLS (every tenant-scoped table)
11. Each RLS file:
    - ALTER TABLE <name> ENABLE ROW LEVEL SECURITY
    - CREATE POLICY tenant_isolation USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
    - The 'true' second arg makes current_setting return null instead of erroring when unset (important for migrations)
12. RLS does NOT apply to tenants table itself (operators need cross-tenant access) or sessions table (looked up by id, not tenant)
13. Create a Drizzle migration that runs all RLS SQL files at the end of the migration sequence
14. Create packages/db/src/with-tenant.ts — a transaction wrapper that:
    - Opens a transaction
    - Sets app.tenant_id via SET LOCAL
    - Runs the callback
    - Commits or rolls back
    - Type signature: withTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T>

Phase 4 — Audit log triggers
15. Create packages/db/src/triggers/audit-log.sql with a generic trigger function that captures old/new row data into the audit_log table for INSERT/UPDATE/DELETE
16. Apply the trigger to the entities listed in CLAUDE.md §6: orders, payments, dispatches, inventory_items (these tables won't exist until Day 5 — write the trigger function now and apply it then)
17. For Day 2: apply the trigger to tenants and users so we can verify the audit pipeline works end-to-end
18. The trigger uses current_setting('app.user_id', true) and current_setting('app.tenant_id', true) to populate changed_by and tenant_id

Phase 5 — Lucia auth integration
19. Add dependencies: lucia, @lucia-auth/adapter-drizzle, @node-rs/argon2 (faster than argon2 npm package)
20. Create apps/web/lib/auth/lucia.ts:
    - Configure Lucia with the Drizzle adapter pointing to users + sessions tables
    - Session cookie: httpOnly, secure (in prod), sameSite 'lax', path '/', name 'dealerlink_session'
    - Session lifetime: 30 days, sliding (refresh on activity)
    - Password hashing via @node-rs/argon2 with sane defaults
21. Create apps/web/lib/auth/middleware.ts that:
    - Reads the session cookie
    - Validates session via Lucia
    - Sets request context: { user, session, tenantId } available to Server Components and Server Actions
    - Writes auth_events row on session validation if it's been more than 24 hours since last write (don't spam the table)
22. Create apps/web/lib/auth/actions.ts with Server Actions:
    - login(email, password) — validates with Zod, looks up user, verifies password, creates session, returns redirect path. Writes auth_events row regardless of success/failure.
    - logout() — invalidates session, clears cookie, redirects to /login
    - All actions wrapped in withTenant() once user's tenant is identified
23. Create apps/web/lib/auth/require-role.ts:
    - requireRole(allowedRoles[]): a function called at the top of every protected Server Action / tRPC procedure
    - Throws AppError('FORBIDDEN') if user role isn't in allowedRoles
24. Create apps/web/lib/errors.ts with the AppError class per CLAUDE.md §19.1 (codes: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION, CONFLICT, RATE_LIMITED, INTERNAL)

Phase 6 — Login screen (Aurora theme)
25. Match docs/screens-extra.jsx login screen with Aurora theme:
    - Two-column layout: left side illustration (Aurora SVG), right side login form
    - Form fields: email, password, "Remember me" checkbox, submit button (primary indigo)
    - Below form: "Forgot password?" link (just an href="#" for Day 2; functionality is Day 16)
    - Brand mark + "Dealerlink" wordmark above form
    - Subtle italic Inter for the welcome text ("Welcome back. Sign in to continue.")
    - All form inputs: hairline border, 6px radius, focus state with accent color
26. Wire form to login() Server Action via react-hook-form + Zod
27. On successful login: redirect based on role:
    - operator → /admin (admin app, even though it's a stub today)
    - all other roles → /dashboard
28. On failure: show error message inline (not a toast; design uses inline form errors)
29. The login screen lives at app/(auth)/login/page.tsx and uses a separate (auth) route group with no Shell wrapper
30. Show subdomain detection: if the request comes to <slug>.dealerlink.in, look up tenant by slug and display "Sign in to <tenant.display_name>" above the form. For localhost dev, accept ?tenant=<slug> query param. If no tenant resolved, show generic "Sign in to Dealerlink".

Phase 7 — Seed script
31. Create packages/db/src/seeds/index.ts that:
    - Truncates all tables (in correct FK order)
    - Inserts 2 tenants per CLAUDE.md §13: "Demo Solar Distributors" (Maharashtra, slug 'demo') and "Sample Industrial Co" (Karnataka, slug 'sample')
    - For each tenant, inserts tenant_settings with realistic Indian distributor defaults (real GSTIN format, sample bank details)
    - Creates 4 users per tenant: admin@<slug>.test, sales@<slug>.test, accounts@<slug>.test, dispatch@<slug>.test, all with password "password123" (development only — log a warning)
    - Creates 1 operator user: operator@dealerlink.test (no tenant_id)
    - Prints credentials at end with a clear warning that these are dev-only
32. Wire pnpm db:seed to run this script

Phase 8 — Dashboard placeholder upgrade
33. Update app/(app)/dashboard/page.tsx to:
    - Read the current user + tenant from auth middleware
    - Display "Good morning, <full_name>" with italic Inter for "morning"/afternoon/evening based on time of day (matches prototype's editorial style)
    - Show tenant display_name in sidebar (replace placeholder)
    - Add a Logout button in the user menu (Topbar right side)
34. Add similar tenant context display to all (app) routes' shell

Phase 9 — Pre-commit hook fix (carried over from Day 1)
35. Per Day 1's deviation #2 and #3: fix the pnpm strict isolation issue with parserOptions.project so ESLint can run in pre-commit. Likely fix: add a tsconfig.eslint.json at root that includes all workspace files, and reference it in .eslintrc.js. Verify pnpm lint runs from root and pre-commit hook fires it on staged files.

Phase 10 — tailwind-preset type fix (carried over from Day 1)
36. Per Day 1's deviation #5: replace Record<string, any> in packages/design-tokens/src/tailwind-preset.ts with Partial<Config> from 'tailwindcss'. Add tailwindcss as a devDependency of packages/design-tokens.

Phase 11 — Verification
37. Run pnpm db:migrate from root — should apply all migrations including RLS policies
38. Run pnpm db:seed — should create 9 users (4 + 4 + 1 operator) and print credentials
39. Run pnpm dev (apps/web) and pnpm dev:workers in separate terminals (workers can be a no-op for now)
40. Visit http://localhost:3000?tenant=demo — should show "Sign in to Demo Solar Distributors" Aurora login screen
41. Log in as admin@demo.test / password123 — should redirect to /dashboard with greeting "Good morning, <name>"
42. Verify auth_events table has 1+ rows after login
43. Verify audit_log table has rows from the seed (tenants and users created)
44. Click logout in user menu — should redirect to /login
45. Try accessing /dashboard while logged out — should redirect to /login
46. Run pnpm typecheck, pnpm lint, pnpm build — all must pass with zero errors
47. RLS isolation smoke test: in psql, set app.tenant_id to demo's UUID, then SELECT FROM users — should only return demo's users. Switch to sample's UUID — should only return sample's users. Document the test in packages/db/tests/rls.test.ts (using testcontainers-postgres if practical, otherwise a manual smoke script).
48. Commit with message: feat(auth): day 2 — drizzle schema, RLS, lucia auth, login screen

GUARDRAILS:
- Do NOT skip RLS tests. Cross-tenant isolation is the highest-stakes correctness issue in Phase 1.
- Do NOT use any in TypeScript anywhere outside generated code.
- Do NOT log raw passwords, password hashes, session IDs, or full email bodies anywhere — Sentry, Axiom, or console.
- If a migration fails partway through, drop the dev database (docker compose down -v && docker compose up -d) and reapply from scratch. Don't try to patch a broken migration state.
- If Lucia v3's API differs from what's in CLAUDE.md (Lucia evolves quickly), follow Lucia's current docs and document the deviation.

WHEN DONE:
- Print a summary of what was created
- List any deviations from spec with reasons
- Print the seeded credentials again so I can copy-paste them for testing
- Tell me what to verify visually before Day 3
- Suggest the commit message
```

### Verification checklist for you (after Claude Code finishes)

- [ ] `pnpm db:migrate` succeeds; check `\dt` in psql shows tenants, tenant_settings, users, sessions, document_counters, audit_log, auth_events
- [ ] `pnpm db:seed` succeeds and prints 9 user credentials
- [ ] Visit http://localhost:3000?tenant=demo → Aurora login screen appears
- [ ] Sidebar shows "Demo Solar Distributors" instead of placeholder
- [ ] Login with admin@demo.test / password123 → dashboard with greeting
- [ ] Greeting uses italic Inter on the time-of-day word ("morning"/"afternoon"/"evening")
- [ ] Logout works; redirected back to login
- [ ] Direct visit to /dashboard while logged out → redirected to /login
- [ ] Login with wrong password → inline error, NOT a generic 500
- [ ] In Sentry dashboard, no errors fired during normal flow
- [ ] In Axiom (if log piping is wired), see structured login event
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` all green
- [ ] Pre-commit hook now runs ESLint (not just Prettier)
- [ ] RLS test in `packages/db/tests/rls.test.ts` passes — Tenant A cannot see Tenant B's users

### Update PROJECT_PLAN.md after Day 2

Mark **B.2** as ✅, add today's date, and append to the changelog:

```markdown
| YYYY-MM-DD | B.2 Day 2 complete — Drizzle schema + RLS + Lucia auth + login screen + seed script | — |
```

Also tick off **R.5** and **R.6** from the Risks register if the carried-over deviations were resolved.

---

## Day 3 — RLS Hardening + Tenant Middleware + Audit Pipeline

**Goal:** Lock the multi-tenancy contract. By end of day, every Server Action and tRPC procedure runs inside a guaranteed tenant context, audit logs capture all relevant changes, and the operator → tenant impersonation flow is testable.

**Estimated time:** 4–6 hours of Claude Code work + ~1 hour of your verification

**Deliverable:** Production-ready multi-tenancy. Cross-tenant access is impossible by construction. Every business module added from Day 5+ inherits this for free.

### Prompt for Claude Code

```
You are implementing Day 3 of the Dealerlink build. Day 2 shipped successfully (commit 81613de) — Drizzle schema, RLS, Lucia auth, login screen, seed with 9 users, dashboard greeting. Today we harden the multi-tenancy story before any business modules arrive Day 5+.

PRIMARY REFERENCES:
1. CLAUDE.md (especially §5 data model, §6 logging surface, §10 auth, §11 critical workflows, §19 standards)
2. DECISIONS.md (ADR-001 subdomain routing, ADR-002 admin app with operator role)
3. Day 2 commit 81613de — review what shipped before extending it

DAY 3 SCOPE:

Phase 1 — Tenant resolution middleware (production-grade)
1. Audit apps/web/lib/tenant/resolve.ts (created in Day 2) and harden it. Resolution rules:
   - Production: <slug>.dealerlink.in -> slug
   - Production: app.dealerlink.in -> no tenant (operator routes only)
   - Production: admin.dealerlink.in -> no tenant (operator routes only)
   - Local dev: localhost?tenant=<slug> -> slug
   - Local dev: localhost (no query param) -> no tenant (login screen shows generic Dealerlink branding)
2. Create apps/web/middleware.ts (Next.js Edge middleware) that:
   - Runs on every request to (app)/* and admin/* routes
   - Reads the host/query param via resolve.ts
   - Sets a request header X-Tenant-Slug for downstream Server Components
   - For (app)/* routes: if no tenant resolved, redirect to login
   - For admin/* routes: if request is not from admin subdomain (or ?admin=true in dev), redirect to login
   - Bypasses static assets, _next, api/health
3. Create apps/web/lib/tenant/context.ts:
   - getTenantContext() — cached per request, returns { tenant, settings } or throws NotFoundError
   - getCurrentUser() — cached per request, returns the Lucia user or throws UnauthorizedError
   - Both use Next.js's cache() from 'react' for request-scoped memoization
4. Add Zod validation at the Lucia boundary (resolves R.8 from PROJECT_PLAN.md):
   - In apps/web/lib/auth/lucia.ts, define a Zod schema for DatabaseUserAttributes that matches the Drizzle users table shape
   - getUserAttributes parses the row through Zod; on parse failure, throws a loud error with the actual shape received
   - This converts silent undefined-field bugs into immediate startup errors

Phase 2 — withTenant() transaction wrapper hardening
5. Audit packages/db/src/with-tenant.ts (created in Day 2). Ensure:
   - It opens a transaction
   - Sets BOTH app.tenant_id AND app.user_id (the latter for audit triggers per CLAUDE.md §6)
   - Rolls back on error
   - Has proper TypeScript inference so the callback receives a typed transaction client
6. Add an explicit unit test for withTenant():
   - Setting and reading current_setting('app.tenant_id')
   - Verifying RLS actually filters when set vs unset
   - Confirming session variables don't leak between transactions

Phase 3 — Server Action wrapper for guaranteed tenant context
7. Create apps/web/lib/actions/wrap.ts with two higher-order functions:
   - tenantAction(allowedRoles, fn) — wraps a Server Action with: auth check, role check, tenant context, withTenant transaction, Zod input validation, error normalization to AppError union type
   - operatorAction(fn) — same but for the operator role (no tenant_id is set; only platform-level actions)
8. Migrate the existing login/logout actions from Day 2 to use these wrappers where applicable
9. Document the wrap pattern in CLAUDE.md §10 with a code example (append to the existing auth section, don't rewrite)

Phase 4 — Audit pipeline completeness
10. Audit packages/db/src/triggers/audit-log.sql (created in Day 2). Ensure:
    - Trigger handles INSERT (before=null, after=NEW), UPDATE (before=OLD, after=NEW), DELETE (before=OLD, after=null)
    - Sensitive fields are redacted in the log (password_hash, session tokens, inbound_email_token)
    - tenant_id is pulled from current_setting('app.tenant_id', true), with NULL allowed for operator-level changes
    - changed_by is pulled from current_setting('app.user_id', true)
    - ip and user_agent are populated from a separate set of session variables (app.request_ip, app.request_ua) — these will be set by tenantAction wrapper
11. Apply the audit trigger to tenants and users tables (these are the only data tables that exist today). Other business tables get triggered on Day 5 when they're added.
12. Write integration tests in packages/db/tests/audit.test.ts:
    - INSERT a user -> audit_log has a row with action=insert, before=null, after=user row
    - UPDATE a user -> audit_log has action=update with both before and after diffs
    - DELETE a user -> audit_log has action=delete with before=user row, after=null
    - Verify password_hash is redacted in all three cases

Phase 5 — Access log middleware for sensitive routes
13. Per CLAUDE.md §6 logging surface, create apps/web/lib/audit/access-log.ts with a recordAccess(entityType, entityId, action) helper that writes to access_log table
14. Create packages/db/src/schema/access-log.ts (didn't exist in Day 2):
    - id, tenant_id, user_id, entity_type, entity_id, action ('view' | 'export' | 'download'), ip, user_agent, accessed_at
    - Index on (tenant_id, entity_type, entity_id) and (tenant_id, user_id, accessed_at)
    - RLS policy: tenant_isolation
15. Generate and run the migration
16. The actual logging hooks get attached to dealer/payment/dispatch views starting Day 5 — Day 3 only sets up the infrastructure

Phase 6 — Operator → tenant impersonation flow
17. Per ADR-002, operators provision tenants. To debug tenant issues, operators may need a controlled impersonation flow.
18. Add to the admin app (app/admin/tenants/[id]/page.tsx):
    - View a tenant's details
    - "Enter tenant workspace" button -> sets a special operator_impersonation cookie + redirects to <slug>.dealerlink.in (or ?tenant=<slug> in dev)
    - All access while impersonating is logged to access_log with action='operator_impersonation_view'
    - A banner at the top of (app)/* routes shows "Operator impersonating tenant X — Exit impersonation" when active
    - Operators cannot perform mutations while impersonating (read-only); enforce via tenantAction guard
19. Add tests in apps/web/tests/impersonation.test.ts covering: enter, view, attempted mutation blocked, exit

Phase 7 — RLS isolation test expansion
20. Expand packages/db/tests/rls.test.ts (created in Day 2) to cover every table that has RLS:
    - tenants (no RLS — operators have access)
    - users (RLS on tenant_id)
    - tenant_settings (RLS on tenant_id)
    - sessions (no RLS — looked up by id)
    - document_counters (RLS on tenant_id)
    - audit_log (RLS on tenant_id)
    - auth_events (RLS on tenant_id)
    - access_log (RLS on tenant_id)
21. Each test:
    - Sets app.tenant_id to tenant A
    - Inserts a row
    - Switches to tenant B
    - Confirms SELECT returns zero rows
    - Confirms UPDATE/DELETE silently affect zero rows
22. Add this test to CI as a required check (resolves R.9 from PROJECT_PLAN.md)

Phase 8 — Health endpoint enrichment
23. Update apps/web/app/api/health/route.ts (created in Day 1 as a stub) to actually check:
    - DB connection (SELECT 1)
    - DB query latency (in ms)
    - Schema migrations are at the latest version
    - Audit trigger is installed (check pg_trigger)
    - RLS is enabled on the expected tables
24. Return JSON per CLAUDE.md §6 health endpoint contract
25. Add a rate limiter (60 req/min per IP) using a Postgres-backed rate_limit table — this gets used by login too in a later day

Phase 9 — Documentation
26. Update CLAUDE.md §10 to reflect the tenantAction/operatorAction pattern with a concrete code example
27. Add a new short section to CLAUDE.md §11 documenting the operator impersonation flow
28. Update DECISIONS.md with a new ADR-009 recording the Zod-at-Lucia-boundary decision (this addresses R.8)

Phase 10 — Verification
29. Run pnpm typecheck, pnpm lint, pnpm build — all green
30. Run pnpm test from root — all unit + integration tests pass
31. Run the manual flow:
    - Visit localhost:3000 (no tenant) -> generic login screen
    - Visit localhost:3000?tenant=demo -> "Sign in to Demo Solar Distributors"
    - Log in as admin@demo.test -> dashboard
    - Log in as operator@dealerlink.test -> /admin
    - From /admin, click "Enter tenant workspace" for Demo Solar -> redirected with impersonation banner showing
    - Try to perform a mutation while impersonating -> blocked with friendly error
    - Click "Exit impersonation" -> back to /admin
32. Query the audit_log to confirm rows accumulated during testing
33. Commit with message: feat(tenancy): day 3 — middleware, action wrappers, audit pipeline, impersonation

GUARDRAILS:
- Do NOT skip RLS tests. Every table with tenant_id needs an isolation test.
- Do NOT widen permissions in the operator impersonation flow. Read-only is non-negotiable for Phase 1.
- Do NOT log sensitive fields in audit (password_hash, tokens). Redact at the trigger layer.
- If Next.js Edge middleware can't access Drizzle (it can't on Edge runtime), put the middleware on Node runtime explicitly via `export const runtime = 'nodejs'` in middleware.ts
- If Lucia v3's Zod-at-getUserAttributes approach isn't idiomatic, use a different validation point — the goal is to never silently expose undefined attributes again

WHEN DONE:
- Print a summary of what was created
- List any deviations from spec with reasons
- Print which tables now have RLS isolation tests passing
- Tell me what to verify visually
- Suggest the commit message
```

### Verification checklist for you (after Claude Code finishes)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all green
- [ ] Visit `localhost:3000` (no tenant param) → generic login, no tenant branding
- [ ] Visit `localhost:3000?tenant=demo` → "Sign in to Demo Solar Distributors"
- [ ] Visit `localhost:3000?tenant=nonexistent` → graceful error or generic login, NOT a crash
- [ ] Log in as `operator@dealerlink.test / password123` → lands on `/admin`
- [ ] `/admin/tenants` shows both seeded tenants
- [ ] Click "Enter tenant workspace" → impersonation banner shows at top of dashboard
- [ ] Try a mutation while impersonating → blocked with friendly error
- [ ] "Exit impersonation" → back to `/admin`
- [ ] Query: `docker compose exec postgres psql -U dealerlink -d dealerlink_dev -c "SELECT entity_type, action, count(*) FROM audit_log GROUP BY 1,2;"` shows audit rows accumulating
- [ ] Query: `SELECT entity_type, action, count(*) FROM access_log GROUP BY 1,2;` shows operator impersonation views logged
- [ ] `/api/health` returns richer JSON with db latency, migration version, RLS check
- [ ] All RLS isolation tests pass (one test per table — `pnpm test packages/db/tests/rls.test.ts`)
- [ ] Password hash never appears in any audit_log row (verify with: `SELECT before, after FROM audit_log WHERE entity_type = 'user' LIMIT 5;` — passwords should be redacted)

### Update PROJECT_PLAN.md after Day 3

Mark **B.3** as ✅, add today's date, append to changelog:

```markdown
| YYYY-MM-DD | B.3 Day 3 complete — tenant middleware, action wrappers, audit pipeline hardening, operator impersonation, RLS tests on all tables | — |
```

Resolve **R.8** and **R.9** if Zod-at-boundary and CI-required-RLS-test were both shipped.

---

## Day 4 — Tenant Provisioning Admin App

_Will be added when Day 3 is complete. Day 4 fleshes out the operator-only admin app: create tenant form, edit settings, list users, regenerate inbound email tokens._

---

## How to Use This File Going Forward

After each day's work:

1. **You** verify the deliverable against the checklist
2. **You** update `PROJECT_PLAN.md` to tick the task and add the date
3. **You** ask me to add the next day's prompt to this file (I'll write it informed by what just happened)
4. **You** commit the day's work with a Conventional Commit message
5. **You** start the next day's session with a fresh Claude Code context

This rhythm keeps each day clean, verifiable, and recoverable if something needs to be redone.

---

_Last updated: May 2026 · Day 1 prompt only · subsequent days added progressively_
