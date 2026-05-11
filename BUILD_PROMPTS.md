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

**Goal:** Operators can create, configure, and manage tenants end-to-end via the admin app. By the end of Day 4, an operator can onboard a brand-new tenant in under 2 minutes — no SQL, no CLI, no manual steps. This is the first day the system can onboard a real customer.

**Estimated time:** 4–5 hours of Claude Code work + ~30 min of your verification

**Deliverable:** A working `admin.dealerlink.in` admin app with: create tenant, edit tenant settings, manage tenant users, regenerate inbound email tokens. Tested end-to-end with Playwright.

### Prompt for Claude Code

```
You are implementing Day 4 of the Dealerlink build. Day 3 shipped successfully — tenant middleware, action wrappers, audit pipeline, operator impersonation, 45 tests passing across 8 tables. Today we build out the operator-facing admin app so a brand-new tenant can be onboarded without touching SQL.

PRIMARY REFERENCES:
1. CLAUDE.md (especially §10 auth/roles, §16 tenant configuration surface, §19 standards)
2. DECISIONS.md (ADR-002 internal admin app, ADR-007 branding upload spec, ADR-009 Zod at boundary)
3. Day 3 commit — review tenantAction/operatorAction patterns; today's mutations all use operatorAction
4. docs/Distribyte.html and docs/screens-extra.jsx — visual reference for form styling, table density, and the operator's admin look. Admin uses the same design system as the tenant app but with subtle distinction (e.g., a "Platform" badge or different sidebar header).

DAY 4 SCOPE:

Phase 1 — Create tenant flow
1. Create app/admin/tenants/new/page.tsx — a form with these fields per CLAUDE.md §16:
   - Tenant identity:
     - slug (text, lowercase alphanumeric + hyphens, 3-32 chars, must be unique) — live validation with debounced check against DB
     - legal_name (text, required, max 255)
     - display_name (text, required, max 100)
   - Compliance:
     - gstin (text, validated against GSTIN format + checksum) — use isValidGSTIN() from lib/format/
     - pan (text, auto-derived from GSTIN positions 3-12 but editable)
     - state (dropdown, all 28 Indian states + 8 UTs, required — used for tax CGST/SGST vs IGST decision)
   - Registered address:
     - address_line1, address_line2, city, pincode (6 digits), state (dropdown — same list, may differ from compliance state)
   - Bank details (for invoice footer):
     - bank_account_name, bank_account_number, bank_ifsc, bank_branch
   - Initial admin user:
     - admin_email (validated email)
     - admin_full_name
     - Password is NOT collected; a temporary password is generated and emailed
   - Branding (deferred to settings page; not on create form to keep it focused)

2. Form validation via react-hook-form + Zod. Submit button disabled until valid.
3. Visual treatment: match the design system. Two-column layout for the form fields (section headings: "Identity", "Compliance", "Address", "Bank", "Initial Admin"). Sticky "Create tenant" button at the bottom right.

Phase 2 — createTenant Server Action
4. Create apps/web/lib/actions/admin/create-tenant.ts using operatorAction() wrapper from Day 3:
   - Input: Zod schema mirroring the form
   - Steps inside a single transaction (operatorAction doesn't auto-wrap in withTenant because there's no tenant yet):
     a. Validate slug doesn't exist (case-insensitive)
     b. Generate UUID for tenant
     c. Insert tenants row (id, slug, legal_name, display_name, status='active')
     d. Generate inbound email token (32 hex chars via crypto.randomBytes)
     e. Insert tenant_settings row with all fields from form + defaults from CLAUDE.md §16 (default_currency='INR', default_locale='en-IN', fiscal_year_start=4, default_quote_validity=30, default_credit_period=30, low_stock_threshold=5, inbound_email_token, empty doc_prefixes JSONB starting with {QT:'QT', PI:'PI', INV:'INV', ORD:'ORD', PAY:'PAY', DSP:'DSP'})
     f. Generate temporary password (12 chars, mix of upper/lower/digit/special)
     g. Hash password with @node-rs/argon2
     h. Insert admin user with role='admin', tenant_id=new tenant id, must_change_password=true (add this column to users schema if missing)
     i. Enqueue a pg-boss job 'send-tenant-welcome-email' with: tenant info, admin email, temporary password, login URL
     j. Write audit_log entry manually (operatorAction doesn't auto-audit since no tenant context — capture as platform-level event)
     k. Return { tenantId, slug, adminEmail, loginUrl }
   - On success, redirect operator to /admin/tenants/[id] with a success toast showing the credentials
5. Error handling per CLAUDE.md §19.1: discriminated union result. Frontend shows specific error message for VALIDATION (field errors), CONFLICT (slug taken), INTERNAL (generic, with retry button).

Phase 3 — Welcome email job
6. Create apps/workers/src/jobs/send-tenant-welcome-email.ts:
   - Renders a React Email template with: tenant display_name, admin name, login URL (https://<slug>.dealerlink.in/login in prod, http://localhost:3000/login?tenant=<slug> in dev), temporary credentials, instructions to change password on first login
   - Sends via Resend
   - Logs to email_delivery_log (table created in Day 4 if not present; otherwise add it now per CLAUDE.md §6 — id, tenant_id (nullable for platform emails), recipient, subject, status, provider_message_id, sent_at)
   - Retries up to 3 times on failure
7. Create the React Email template at apps/web/components/emails/TenantWelcomeEmail.tsx using @react-email/components. Match the design system tokens (paper background, ink text, accent button).

Phase 4 — Tenant detail / edit settings page
8. Enhance app/admin/tenants/[id]/page.tsx (created in Day 3 as read-only view) to:
   - Show all current tenant_settings fields organized in sections
   - Each section has an "Edit" button that opens an inline edit form (not a modal — keep it dense like the prototype)
   - Sections: Identity (slug — DANGER ZONE, can rename but warn about URL changes), Compliance (GSTIN, PAN, state), Address, Bank, Branding (logo upload), Document prefixes (JSONB editor with friendly UI), Defaults (quote validity, credit period, low-stock threshold, default T&Cs textarea)
9. For logo upload (per ADR-007):
   - Accept PNG, SVG, JPG up to 1 MB
   - Recommend 400×120 px
   - Upload directly to DO Spaces if DO Spaces env vars are configured; otherwise store as base64 in tenant_settings.logo_url with a note "Configure DO_SPACES_* env vars for production storage" (this lets dev work without DO Spaces)
   - Sanitize SVGs with DOMPurify before storage to prevent XSS
   - Show preview before save
10. Each edit action uses operatorAction() with a Zod schema for the specific section being edited. Audit_log captures the change.

Phase 5 — Tenant users management
11. Create app/admin/tenants/[id]/users/page.tsx:
   - Lists all users for the tenant (table with name, email, role, status, last login)
   - "Add user" button -> form for: full_name, email, role (admin/sales/accounts/dispatch — no operator), password (temporary, will be emailed) auto-generated
   - Per-row actions: Edit (name, role, status), Deactivate (sets status='inactive'), Reset password (generates new temp password, emails it)
12. Server Actions for: createTenantUser, updateTenantUser, deactivateTenantUser, resetTenantUserPassword. All use operatorAction() but with explicit tenant_id parameter; the action does the equivalent of withTenant() manually since we're acting on a tenant from outside its context.
13. Reset password flow: invalidate all existing sessions for that user (DELETE FROM sessions WHERE user_id=...), generate new temp password, set must_change_password=true, send email.

Phase 6 — Regenerate inbound email token
14. On the tenant detail page, add a "Regenerate inbound email token" button with strong warning:
    - "This will change <slug>+<oldtoken>@mail.dealerlink.in to <slug>+<newtoken>@mail.dealerlink.in. Existing BCC instructions need updating. The old address will continue to work for 7 days then expire."
15. Server Action regenerateInboundToken(tenantId):
    - Generates new token
    - Updates tenant_settings.inbound_email_token
    - Records the OLD token in a new table inbound_token_history (tenant_id, token, retired_at, expires_at = now() + 7 days)
    - The inbound webhook handler (built in Day 14) checks this history for grace-period matches
16. Schema: create inbound_token_history table with RLS, audit trigger, and standard columns

Phase 7 — Operator UX polish
17. Sidebar in /admin layout shows: Dashboard, Tenants, Operators (Phase 2), Platform Settings (stub for now)
18. /admin/dashboard shows platform metrics: total tenants, active tenants, tenants created this month, total users across all tenants, recent provisioning activity
19. Each metric is a card with the same dense KPI style as the tenant dashboard prototype
20. Add a "Platform" badge next to the brand mark in admin sidebar to make it visually distinct from tenant workspaces

Phase 8 — Tests
21. Unit tests for createTenant() Server Action:
    - Valid input creates tenant + admin user + queues email
    - Duplicate slug returns CONFLICT
    - Invalid GSTIN returns VALIDATION
    - Invalid pincode returns VALIDATION
    - Transaction rolls back if any step fails (test by mocking a failure in step h)
22. Playwright E2E test apps/web/tests/e2e/operator-onboarding.spec.ts:
    - Log in as operator@dealerlink.test
    - Click "New tenant", fill form for "Test Distributors" with slug "test", real-looking GSTIN, MH state, etc.
    - Submit
    - Verify redirect to tenant detail page
    - Verify credentials shown on screen
    - In a second browser context, navigate to http://localhost:3000/login?tenant=test
    - Log in with the credentials shown
    - Verify dashboard loads with "Test Distributors" in sidebar
    - Verify audit_log has entries for tenant creation
    - Clean up: delete the test tenant via SQL teardown
23. Run all existing tests — they should still pass with the new schema columns

Phase 9 — Documentation
24. Update CLAUDE.md §16 if any tenant_settings columns were added during Day 4 (e.g., must_change_password on users)
25. Update DECISIONS.md with ADR-010 if any meaningful decisions were made (e.g., temporary password length, must-change-password flow)
26. Add a brief "Onboarding a new tenant" runbook to CLAUDE.md or a new docs/RUNBOOKS.md file — operator-facing instructions on using the new admin app

Phase 10 — Verification
27. pnpm typecheck, pnpm lint, pnpm build, pnpm test — all green
28. Manual smoke test:
    - Log in as operator
    - Create a tenant called "Smoke Test Co" with slug "smoke"
    - Verify credentials are shown
    - Verify email job ran (check pg-boss state table or email_delivery_log)
    - In dev, the email won't actually send unless RESEND_FROM_EMAIL is verified; verify the job was enqueued and email content is correct
    - Open localhost:3000/login?tenant=smoke
    - Log in with credentials -> "Smoke Test Co" dashboard
    - Log out, log back in as operator
    - Click impersonate Smoke Test Co -> banner appears
    - Exit impersonation, edit Smoke Test Co's GSTIN -> verify audit_log captured the change
    - Add a user to Smoke Test Co -> verify
    - Regenerate inbound token -> verify history row created
    - Clean up: delete test tenant (operator action for this is fine too — add it to the detail page with strong confirmation)
29. Commit with: feat(admin): day 4 — tenant provisioning admin app, user management, token rotation

GUARDRAILS:
- All admin mutations use operatorAction(), NEVER tenantAction() (operators don't have a tenant context)
- DO NOT auto-login operators into newly created tenants — always send the email and let the admin user log in normally
- Temporary passwords MUST be force-rotated on first login (must_change_password flag)
- Slug renames are dangerous — show a clear warning; document the cascading effects in the warning text
- Logo upload sanitizes SVGs (XSS risk)
- DO Spaces credentials are not yet configured in .env.local (per the project plan, deferred to Stage D) — fall back to base64 storage in dev with a clear warning logged once at startup
- Email sending in dev: if RESEND_FROM_EMAIL is the default sandbox (onboarding@resend.dev), emails go to a Resend sandbox inbox — that's fine for dev verification, just log the message ID

WHEN DONE:
- Print a summary of what shipped
- Print the deviations from spec with reasons
- Confirm the Playwright E2E test passes
- Confirm operator can onboard a tenant in <2 minutes
- Suggest the commit message
```

### Verification checklist for you (after Claude Code finishes)

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` all green
- [ ] Log in as `operator@dealerlink.test` → land on `/admin`
- [ ] Sidebar shows "Platform" badge to distinguish from tenant workspace
- [ ] `/admin/dashboard` shows platform-level metrics (total tenants, active tenants, etc.)
- [ ] Click "New tenant" → form loads with all required sections
- [ ] Slug validation works live (try "demo" → shows "already taken")
- [ ] GSTIN validation works (try invalid GSTIN → error)
- [ ] Submit valid form → redirects to tenant detail with credentials visible
- [ ] Welcome email job is in pg-boss queue (check via `docker compose exec postgres psql -U dealerlink -d dealerlink_dev -c "SELECT name, state FROM pgboss.job WHERE name = 'send-tenant-welcome-email' ORDER BY createdon DESC LIMIT 5;"`)
- [ ] Open `localhost:3000/login?tenant=<new-slug>` → tenant-specific login screen
- [ ] Log in with temp credentials → forced to change password
- [ ] After password change → dashboard with new tenant name in sidebar
- [ ] Back as operator → `/admin/tenants/[id]/users` → add a sales user → verify in DB
- [ ] Regenerate inbound token → confirm warning shown, history row created
- [ ] Edit tenant GSTIN → audit_log row created with before/after diff
- [ ] Logo upload (PNG and SVG) → preview shows, save persists
- [ ] Try uploading SVG with `<script>` tag → script is stripped (DOMPurify working)
- [ ] Playwright E2E `operator-onboarding.spec.ts` passes
- [ ] Stopwatch test: can you (manually) create a tenant in under 2 minutes? If not, where's the friction?

### Update PROJECT_PLAN.md after Day 4

Mark **B.4** as ✅, add today's date, append to changelog:

```markdown
| YYYY-MM-DD | B.4 Day 4 complete — operator admin app, tenant CRUD, user management, inbound token rotation, welcome email | — |
```

---

## Day 5 — Dealer Master + Product Catalog + Inventory Schema

_Will be added when Day 4 is complete. Day 5 ships the first three business modules — Dealer Master CRUD, Product Catalog, and the Inventory schema (procurement happens Day 6). This is where the system starts to do real distributor work._

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
