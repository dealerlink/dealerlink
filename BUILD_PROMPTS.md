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

**Goal:** Ship the first three business modules. By end of day, tenant users (Admin, Sales, Accounts, Dispatch) can manage dealers and products through real CRUD UIs. The inventory schema is in place but procurement and serial-level operations come on Day 6.

This is the **first day Claude Code touches the tenantAction() contract for real business logic** — every subsequent business module follows the patterns set today.

**Estimated time:** 6–7 hours of Claude Code work + ~1 hour of your verification

**Deliverable:** Working Dealer Master and Product Catalog pages. Both with list, detail, create, edit, deactivate flows. Inventory schema migrated and ready for Day 6.

### Prompt for Claude Code

```
You are implementing Day 5 of the Dealerlink build. Days 1–4 shipped successfully (foundation, auth, tenancy, operator admin). Now the system starts doing real distributor work.

PRIMARY REFERENCES:
1. CLAUDE.md (especially §3 stack, §5 data model, §10 auth & roles, §11 critical workflows, §13 sample data, §19 standards)
2. BRD §2 (Dealer Master), §3 (Product Catalog), §4 (Inventory data model)
3. docs/Distribyte.html — visual prototype for Dealers (table density, status pills, filter chips), Catalog (card grid for products)
4. docs/screens-extra.jsx — Inventory screen reference (for tomorrow's Day 6, but informs the schema today)
5. Day 4 commit 62c568b — review the tenant detail page structure; reuse those patterns for dealer detail / product detail

DAY 5 SCOPE:

Phase 1 — Dealer Master schema
1. Create packages/db/src/schema/dealer.ts with fields per BRD §2:
   - id, tenant_id, standard audit columns (created_at, created_by, updated_at, updated_by)
   - Identity: dealer_code (auto-generated, format DL-<6 digit zero-padded sequence per tenant), legal_name, display_name, contact_person, phone, alt_phone, email, alt_email
   - Address: address_line1, address_line2, city, state, pincode, country (default 'IN')
   - Compliance: gstin, pan
   - Classification: type ('retailer' | 'wholesaler' | 'installer' | 'epc' | 'other'), category ('A' | 'B' | 'C'), risk_level ('low' | 'medium' | 'high')
   - Commercial terms: credit_limit (decimal 12,2, nullable), credit_period_days (integer, default from tenant_settings), discount_percent (decimal 5,2, default 0)
   - Status: status ('active' | 'inactive' | 'on_hold'), inactivated_at, inactivated_reason
   - Misc: notes (text), tags (text[], for free-form labels)
2. Indexes:
   - PRIMARY KEY (id)
   - UNIQUE (tenant_id, dealer_code)
   - UNIQUE (tenant_id, gstin) WHERE gstin IS NOT NULL (partial unique — GSTIN optional)
   - Index on (tenant_id, status) for list queries
   - Index on (tenant_id, lower(legal_name) text_pattern_ops) and (tenant_id, gstin) for search (use pg_trgm)
   - GIN index on (tenant_id, tags) for tag-based filtering
3. RLS policy: tenant_isolation
4. Apply audit trigger
5. Document counter row needs to exist for 'dealer' doc_type — add to seed and to tenant creation
6. Generate Drizzle migration; verify the migration runs cleanly

Phase 2 — Product Catalog schema
7. Create packages/db/src/schema/product.ts with fields per BRD §3:
   - id, tenant_id, standard audit columns
   - Identity: sku (tenant-unique, manually entered), name, description, manufacturer (text, e.g., 'Premier Energies'), model (text)
   - Tax: hsn_code (text, required, must be valid HSN format), gst_rate (decimal 5,2 — 5.00, 12.00, 18.00, 28.00 per BRD)
   - Classification: category (text — e.g., 'Solar Panel', 'Inverter', 'Battery'), subcategory (text — e.g., 'TOPCon', 'Bifacial', 'Mono PERC')
   - Specs (JSONB for vertical-specific fields per CLAUDE.md §16 extensibility): { wattage: 540, voltage: 41.2, cells: 144, warranty_years: 25, ... }
   - Pricing: mrp (decimal 12,2), default_purchase_price (decimal 12,2, nullable), default_selling_price (decimal 12,2, nullable)
   - Inventory hints: requires_serial (boolean, default true for solar panels; false for accessories), unit_of_measure (text, default 'Nos')
   - Status: status ('active' | 'inactive' | 'discontinued')
8. Indexes: UNIQUE (tenant_id, sku), index on (tenant_id, status, category), pg_trgm index on name + manufacturer + model
9. RLS, audit trigger
10. Generate migration

Phase 3 — Inventory schema (data model only; procurement is Day 6)
11. Create packages/db/src/schema/inventory.ts per BRD §4 and CLAUDE.md §11:
    - inventory_items table:
      - id, tenant_id, standard audit columns
      - product_id (FK), serial_number (text, required IF product.requires_serial, can be NULL for non-serialized items)
      - status enum: 'in_stock' | 'reserved' | 'dispatched' | 'delivered' | 'returned' | 'damaged' | 'lost'
      - location: warehouse_code (text), bin (text, optional)
      - procurement: procurement_id (FK to procurements table — created in Day 6 stub today), procurement_date, purchase_price (decimal 12,2)
      - reservation: reserved_for_order_id (FK to orders, nullable — orders table doesn't exist yet, FK deferred)
      - reserved_for_dealer_id (FK to dealers, nullable)
      - reserved_at (timestamp, nullable)
      - dispatch: dispatched_at, dispatch_id (FK to dispatches, deferred)
      - delivery: delivered_at, delivered_to (text, recipient name)
      - flags: warranty_start_date, warranty_end_date, notes
    - UNIQUE constraint: (tenant_id, serial_number) WHERE serial_number IS NOT NULL (per CLAUDE.md §5)
    - Indexes: (tenant_id, status, product_id), (tenant_id, product_id, status), pg_trgm on serial_number
12. Create the procurements table stub (will be fleshed out Day 6):
    - id, tenant_id, audit columns
    - procurement_date, supplier_name (text — manufacturer name for now; can become a relation in Phase 2), invoice_number, invoice_date, total_amount
    - status enum: 'draft' | 'confirmed' | 'received'
13. RLS on both tables
14. Audit trigger on inventory_items (NOT on procurements yet — apply when finalized in Day 6)
15. Generate migration

Phase 4 — Dealer Master CRUD
16. Create apps/web/lib/actions/dealers/ with tenantAction()-wrapped Server Actions:
    - createDealer (admin, sales)
    - updateDealer (admin, sales — but credit_limit + credit_period_days + discount_percent require admin)
    - deactivateDealer (admin only) — sets status='inactive', inactivated_at=now(), captures reason
    - reactivateDealer (admin only)
    - bulkImportDealers (admin only) — CSV upload, validates each row, atomic transaction, returns per-row results
17. Create tRPC procedures for queries:
    - listDealers — paginated, filterable (status, type, category, risk_level, state, tags), searchable (legal_name, gstin, dealer_code via pg_trgm)
    - getDealerById — includes recent activity (created/updated audit entries)
    - searchDealers — for typeahead use in other modules (returns id, display_name, gstin, state, status)
18. Dealer list page at app/(app)/dealers/page.tsx:
    - Match prototype's dense table (56px row height)
    - Columns: code, name + gstin, type, category, risk pill, credit limit, credit period, status pill, last activity
    - Toolbar: search bar (debounced 250ms), filter chips, "+ New dealer" button (visible to admin + sales)
    - Pagination: 50 per page with virtualized scrolling (TanStack Virtual) for performance with large dealer lists
    - Empty state with illustration matching design tokens
    - Row click navigates to detail page
19. Dealer detail page at app/(app)/dealers/[id]/page.tsx:
    - Hero section: dealer code (mono), legal name, status pill, action buttons (Edit, Deactivate)
    - Tabs (or sections): Overview (all fields), Commercial Terms, Activity (audit log entries for this dealer — uses access_log + audit_log), Notes
    - Inline-edit pattern from Day 4 (section-by-section editing)
    - "Access logged" indicator since viewing a dealer writes to access_log
20. Dealer create page at app/(app)/dealers/new/page.tsx:
    - Multi-section form (Identity, Contact, Address, Compliance, Classification, Commercial Terms)
    - Live GSTIN validation
    - State dropdown with full Indian state list
    - PAN auto-derive from GSTIN
    - Submit → redirect to detail page

Phase 5 — Product Catalog CRUD
21. Server Actions in apps/web/lib/actions/products/:
    - createProduct (admin only — products are commercially sensitive)
    - updateProduct (admin only)
    - deactivateProduct, reactivateProduct, discontinueProduct (admin only)
    - bulkImportProducts (admin only) — CSV upload
22. tRPC procedures:
    - listProducts — paginated, filterable (status, category, subcategory, manufacturer)
    - getProductById — includes inventory summary (in_stock count, reserved count) when inventory data exists
    - searchProducts — typeahead for quotations/orders
23. Product list page at app/(app)/catalog/page.tsx:
    - Match prototype: card grid view (NOT a table) per design — each product card shows: image placeholder, name + manufacturer, SKU (mono), HSN + GST chip, MRP (mono, tabular figures), status pill
    - Toggle between Grid view and Table view (user preference, stored in localStorage)
    - Toolbar: search, filter chips (category, manufacturer, status), "+ New product" (admin only)
24. Product detail page at app/(app)/catalog/[id]/page.tsx:
    - Same inline-edit pattern
    - Specs section renders the JSONB spec object with sensible labels (use a helper to convert keys: wattage → "Wattage (W)", warranty_years → "Warranty (years)")
    - "Allowed in inventory" toggle (the requires_serial flag, with explanation)
    - Inventory summary card (placeholder, will populate Day 6+)
25. Product create page:
    - SKU validation (tenant-unique, no whitespace)
    - HSN format validation (4-8 digits)
    - GST rate dropdown (5/12/18/28 only per BRD)
    - Specs editor: friendly JSONB UI — start with common fields based on category (when category is "Solar Panel", auto-suggest wattage/voltage/cells/warranty fields)

Phase 6 — Seed data expansion
26. Update packages/db/src/seeds/ to add per CLAUDE.md §13:
    - 3 manufacturers worth of products: Premier Energies (panels 400W-650W TOPCon + Bifacial), Adani Solar (panels Mono PERC), Vikram Solar (panels Bifacial). ~20 product SKUs total per tenant.
    - 20 dealers per tenant, spread across:
      - States: MH, AS, KA, TN, GJ, UP, RJ (mix of intra-state and inter-state vs each tenant's home state)
      - Types: 10 retailer, 5 wholesaler, 3 installer, 2 EPC
      - Categories: 5 A-category (large), 10 B-category, 5 C-category
      - Risk levels: 3 high, 5 medium, 12 low
      - Realistic Indian names (use a curated list, not Faker's English-only names)
      - Real GSTIN format with valid checksums
      - ~50% have credit terms set, rest don't
27. Re-run pnpm db:seed and verify counts

Phase 7 — Bulk import
28. Both dealer and product bulk import use the same pattern:
    - CSV upload via a dedicated page (/dealers/import, /catalog/import)
    - Show CSV template download link
    - Parse client-side with PapaParse, show preview (first 10 rows)
    - On confirm, send rows server-side in batches of 100
    - Server processes in a single transaction; partial failure rolls back entire import (atomic)
    - Returns per-row result: ok / error with message
    - Display results in a result table with "Download error report" CSV
29. Validation per row uses the same Zod schema as the single-create form; reuse the schemas

Phase 8 — Activity (audit) view
30. Each dealer and product detail page has an "Activity" tab that lists audit_log entries for that entity (filtered by tenant_id + entity_type + entity_id)
31. Format: timestamp (mono), user name + role badge, action (created/updated/deactivated), changed fields (collapsible diff for updates)
32. Limited to last 50 entries; "View full history" link for more (Day 16 polish)

Phase 9 — Tests
33. Unit tests for Server Actions: createDealer, updateDealer with role checks, bulkImportDealers (success + partial failure rollback)
34. Same for products
35. Integration tests verifying RLS still holds: tenant A's dealers cannot be seen by tenant B
36. Integration test for dealer search using pg_trgm — verify fuzzy match works
37. CSV import test with a fixture CSV (10 dealers, 1 with bad GSTIN) — verify atomic rollback
38. All previous tests still pass

Phase 10 — Documentation
39. Update CLAUDE.md if any new patterns emerged (likely: the JSONB specs editor pattern, the bulk-import pattern)
40. Add 2 new runbooks to docs/RUNBOOKS.md: "Bulk importing dealers from a legacy system" and "Updating product GST rates after a tax change"

Phase 11 — Verification
41. pnpm typecheck, pnpm lint, pnpm build, pnpm test — all green
42. Manual smoke test as admin@demo.test:
    - /dealers shows 20 dealers from seed; filter by category B shows ~10
    - Search "Solar" in dealer list → results within 250ms debounce
    - Click a dealer → detail page with all sections, audit tab shows the seed creation
    - Edit credit_limit on a dealer → verify audit_log entry + access_log entry written
    - Try editing credit_limit as sales@demo.test → blocked with friendly error (role enforcement)
    - /catalog shows 20 products as a grid; toggle to table view
    - Search "TOPCon" → filters to panels with that subcategory
    - Create new product with realistic specs → appears in list
    - Try creating product as sales@demo.test → blocked
    - Bulk import 5 dealers from a CSV (use the downloaded template) → results show 5 successes
    - Bulk import a CSV with 1 invalid GSTIN → entire batch rolls back; error report shows the offending row
43. Verify across two tenants: log in to demo, create dealer; log in to sample, confirm no demo dealers visible
44. Commit with: feat(modules): day 5 — dealer master + product catalog + inventory schema

GUARDRAILS:
- All mutations use tenantAction() — never bypass with raw db calls
- Role checks: products are admin-only, dealers allow sales for most edits except commercial terms
- All money columns use decimal(12,2) — NEVER float for currency (per CLAUDE.md §19)
- HSN codes must validate (4-8 digits, numeric only)
- GST rates are restricted to {5, 12, 18, 28} — enforce with a check constraint AND a Zod enum
- Dealer code generation must be atomic and tenant-scoped (use the document_counters mechanism from Day 2's schema)
- Bulk imports are atomic (entire transaction or nothing) — do NOT allow partial imports in Phase 1
- The inventory schema must accommodate the Day 6 procurement flow; review CLAUDE.md §11 and BRD §4 before finalizing the columns

WHEN DONE:
- Print a summary
- List deviations with reasons
- Print test counts: total tests, new tests added today
- Confirm role-based access enforced server-side (not just UI)
- Suggest the commit message
```

### Verification checklist for you (after Claude Code finishes)

- [ ] All quality gates pass: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`
- [ ] `/dealers` shows ~20 dealers per tenant in a dense table
- [ ] Dealer search returns results in <300ms even on slow connection
- [ ] Dealer detail page opens with all sections + activity tab populated
- [ ] Edit a dealer's credit limit as admin → success; as sales → blocked
- [ ] `/catalog` shows ~20 products in card grid; toggle to table works
- [ ] Product detail shows specs (e.g., "Wattage (W): 540")
- [ ] Create product as admin → success; as sales → blocked
- [ ] Bulk import 5 dealers from CSV → all 5 land
- [ ] Bulk import a CSV with 1 bad row → entire import rolls back
- [ ] Switch to sample tenant → demo's dealers/products are not visible (RLS)
- [ ] audit_log has rows for each create/update; access_log has rows for each detail view

### Update PROJECT_PLAN.md after Day 5

Mark **B.5** as ✅, add today's date, append to changelog:

```markdown
| YYYY-MM-DD | B.5 Day 5 complete — dealer master + product catalog + inventory schema; first business modules using tenantAction contract | — |
```

This closes **Week 1**. You'll have all foundation work done + 2 business modules running on top of it.

---

## Day 6 — Inventory Procurement + Serial Entry + Status Transitions + Daily Automation Setup

**Goal:** Ship the inventory module's working core — bulk procurement intake, per-serial entry, status state machine, inventory dashboard. Additionally, establish the daily automation patterns (preflight script, verify specs, auto-housekeeping, deviation log) that every subsequent day will inherit.

**Estimated time:** 6–7 hours (5–6h for inventory, ~1h for automation setup)

**Deliverable:** A fully working inventory module + a reusable daily automation kit that reduces your per-day housekeeping from ~20 min to ~5 min.

### Prompt for Claude Code

```
You are implementing Day 6 of the Dealerlink build. Day 5 shipped successfully (commit <SHA>) — dealer master + product catalog + inventory schema, 112 tests passing.

Today has THREE tracks:
A. INVENTORY MODULE (main deliverable, ~5h work)
B. DAILY AUTOMATION KIT (one-time setup, ~1h, all subsequent days inherit)
PRELIMINARY: LINT COVERAGE FIX (must run BEFORE A or B, ~20 min)

PRIMARY REFERENCES:
1. CLAUDE.md (especially §3 stack, §5 data model, §10 auth & roles, §11 critical workflows — inventory reservation flow, §19 standards)
2. BRD §4 (Inventory data model + procurement + status transitions)
3. docs/screens-extra.jsx — Inventory screen is the primary visual target. Density, status pills, serial display format, filter chips.
4. docs/Distribyte.html — for the procurement workflow visual treatment
5. Day 5 commit <SHA> — review the dealers/products patterns; today's inventory CRUD follows the same shape
6. PROJECT_PLAN.md — note R.5 (REOPENED — lint coverage gap), R.16 (TanStack Virtual needed today), R.17 (CSV per-row errors), R.18 (GSTIN empty-string check), R.19 (lint-strict in EOD verification)

==========================================================
PRELIMINARY — LINT COVERAGE FIX (MUST RUN FIRST)
==========================================================

PROBLEM: Day 5 closeout revealed `pnpm lint` only runs ESLint on `apps/web` (via `next lint`). The pre-commit hook (lint-staged) lints all staged files including `packages/*`. This caused 5 ESLint errors in `packages/db/*` to silently pass `pnpm lint` but fail the pre-commit hook.

This is unsafe: developers (and Claude Code) trust `pnpm lint` as the source of truth, but it's blind to most of the codebase.

R.5 was prematurely marked resolved on Day 2. Close it for real today.

PRE.1 — Audit current lint setup
PRE.1.1. Run `pnpm -r exec --workspace-concurrency=1 -- node -e "console.log(require('./package.json').name + ': ' + (require('./package.json').scripts?.lint ?? 'NO LINT SCRIPT'))"` and report which workspaces have a `lint` script vs which don't.
PRE.1.2. For every workspace without a `lint` script, identify whether it should have one (anything with .ts/.tsx/.js/.jsx source files should).

PRE.2 — Standardize ESLint config across workspaces
PRE.2.1. Verify the root .eslintrc.js (or .eslintrc.json or eslint.config.mjs depending on which is in use) extends sensibly across packages. The same parserOptions.project + import/order + no-unused-vars + no-explicit-any rules must apply uniformly.
PRE.2.2. If packages/* have their own .eslintrc files, ensure they extend the root config rather than duplicate it.
PRE.2.3. For Next.js's `next lint` (apps/web only), keep it — but ensure it uses the same ruleset as the rest of the repo (Next.js eslint config extends "next/core-web-vitals" but doesn't have to be in conflict with @typescript-eslint/* rules).

PRE.3 — Add `lint` scripts to every code-bearing workspace
PRE.3.1. Add to each `packages/*/package.json` that doesn't have it:
   "lint": "eslint --max-warnings=0 --no-error-on-unmatched-pattern ."
PRE.3.2. apps/web already has `next lint`. Either:
   (a) Keep apps/web on `next lint --max-warnings=0` (simpler, but parallel toolchain), OR
   (b) Switch apps/web to plain `eslint --max-warnings=0 .` (uniform, but loses next-specific rules)
   Recommendation: (a) — keep next lint for apps/web, plain eslint for packages/*. Document the split in BUILD_PROMPT_TEMPLATE.md so future devs aren't confused.

PRE.4 — Update root `pnpm lint` to be comprehensive
PRE.4.1. Verify root package.json's lint script: `"lint": "pnpm -r lint"`. The `-r` flag runs the script in every workspace that defines it. With PRE.3 above, this now means EVERY workspace runs lint.
PRE.4.2. Add a stricter root variant: `"lint:strict": "pnpm -r lint"` (same behavior; the name signals intent). Optional but nice for clarity.
PRE.4.3. Add `"lint:fix": "pnpm -r exec eslint --fix --no-error-on-unmatched-pattern ."` at root for the auto-fix path that works across workspaces.

PRE.5 — Verify the fix
PRE.5.1. Reintroduce one of Day 5's original unused imports as a test: temporarily add `import { boolean } from 'drizzle-orm/pg-core';` to packages/db/src/schema/dealer.ts (without using it).
PRE.5.2. Run `pnpm lint` from root. It MUST now fail with the unused-import error on packages/db. If it passes, the coverage is still incomplete — debug and fix.
PRE.5.3. Remove the temporary import. Confirm `pnpm lint` is green again.

PRE.6 — Update verification commands going forward
PRE.6.1. Every future day's prompt (and the Phase C8 verification today) must use `pnpm lint` AS-IS (now that it covers everything) — not workspace-specific variants. Document this in docs/BUILD_PROMPT_TEMPLATE.md.
PRE.6.2. The pre-commit hook command (`eslint --max-warnings=0 --no-error-on-unmatched-pattern`) is now identical to what `pnpm lint` runs per workspace. Confirm with: a deliberate error → `pnpm lint` fails AND pre-commit fails the same way.

PRE.7 — Close R.5 properly in PROJECT_PLAN.md
PRE.7.1. Update the R.5 row:
   ✅ Lint coverage gap resolved. `pnpm lint` now lints all workspaces uniformly (root → `pnpm -r lint` → each workspace's `lint` script → eslint --max-warnings=0). Pre-commit hook and dev-loop command are now identical in scope.
PRE.7.2. Add Day 6 entry to changelog noting R.5 truly closed.

PRE.8 — Commit the lint fix before starting inventory work
PRE.8.1. Run `pnpm lint` — must be green.
PRE.8.2. Stage and commit:
   git add -A
   git commit -m "fix(tooling): close R.5 — pnpm lint now covers all workspaces uniformly"
PRE.8.3. The pre-commit hook should pass cleanly. If not, investigate before proceeding to Track A.

ONLY AFTER PRE.8 SUCCEEDS, proceed to Track A and Track B below.

==========================================================
TRACK A — INVENTORY MODULE
==========================================================

Phase A1 — Address Day 5 carry-overs
A1.1. Fix R.18: Add DB CHECK constraint to dealers.gstin: `CHECK (gstin IS NULL OR gstin <> '')`. Generate migration. Update emptyToNull usage to remove the helper where the constraint now suffices.
A1.2. Address R.16: Add TanStack Virtual to apps/web. Refactor the dealer list and product list to use virtualization. Verify scroll performance with the seed data (20 rows) AND with a stress test (1000 rows seeded temporarily, then removed).
A1.3. Add ADR-011 to DECISIONS.md formalizing the "Server Components + typed query helpers" decision from Day 5 (no tRPC). Reference back to the rationale.
A1.4. Update CLAUDE.md §3 row for RPC to match what we actually use. (NOTE: this may already be done by the user during Day 5 closeout — check first; if updated, just verify accuracy.)

Phase A2 — Procurements schema completion
A2.1. The procurements table was stubbed in Day 5. Complete it now per BRD §4:
   - Already has: id, tenant_id, audit columns, procurement_date, supplier_name, invoice_number, invoice_date, total_amount, status
   - Add: invoice_attachment_url (text, nullable — DO Spaces URL or base64 fallback per ADR-007/Day 4 pattern), notes (text), procurement_number (auto-generated, format PROC-2026-0001 — use document_counters with fiscal year)
   - Add line items table procurement_items:
     - id, tenant_id, procurement_id (FK), product_id (FK), quantity (integer), unit_price (decimal 12,2), line_total (computed: quantity * unit_price)
     - RLS, audit trigger
   - Add status transitions: draft → confirmed → received. Each transition is a separate Server Action so audit trail captures who/when/why.
A2.2. Apply audit trigger to procurements and procurement_items.

Phase A3 — Procurement workflow
A3.1. Create app/(app)/inventory/procurements/page.tsx — list view with columns: procurement number (mono), date, supplier, items count, total amount (₹ formatted), status pill, action menu
A3.2. Create app/(app)/inventory/procurements/new/page.tsx:
   - Header: procurement date (default today), supplier dropdown (manufacturers from product table OR free text), invoice number, invoice date
   - Line items: add products with quantity + unit price. Each line shows the product name + SKU + HSN.
   - "Save as draft" button (admin + dispatch) and "Confirm and proceed to serial entry" button (admin + dispatch)
A3.3. Create app/(app)/inventory/procurements/[id]/serials/page.tsx — the serial entry workflow:
   - For each line item where product.requires_serial = true, show a section:
     - Heading: product name + SKU + expected quantity (e.g., "TOPCon 540W — 50 units expected")
     - Input pattern: paste-friendly textarea (one serial per line) + manual entry fallback
     - Live validation: format check (configurable per product, default any non-empty trimmed string), tenant-unique check (highlight duplicates within paste AND against existing inventory)
     - Counter: "47 of 50 entered" (mono, tabular figures)
     - Per-product "Mark all received" button (only enabled when counter matches expected)
   - For non-serialized products: just show a "Received: <quantity>" confirmation
   - Footer: "Finalize procurement" button (admin + dispatch) — only enabled when all serialized lines have full serial counts
A3.4. Server Actions:
   - createProcurement (admin + dispatch)
   - addProcurementLine, removeProcurementLine, updateProcurementLine (admin + dispatch)
   - confirmProcurement — locks editing of items, transitions status to 'confirmed'
   - submitSerials(procurementId, productId, serials[]) — validates uniqueness, inserts inventory_items rows with status='in_stock', links to procurement_id
   - finalizeProcurement — verifies all serials submitted, transitions to 'received'
A3.5. All inserts/updates use tenantAction() with appropriate role gates.

Phase A4 — Inventory list and detail
A4.1. Create app/(app)/inventory/page.tsx (main inventory view):
   - Match the prototype's dense grid: 56px row height, status pill per row
   - Columns: serial number (mono), product name + SKU, status pill, warehouse, procurement number (mono, click-through), procurement date, age (days since procurement), reserved-for (dealer name if reserved), notes
   - Filters: status (multi-select), product (typeahead), warehouse, age range, procurement (typeahead)
   - Search: serial number prefix match (pg_trgm)
   - Virtualization: TanStack Virtual since this list grows fast (500+ rows is the common case)
   - Bulk actions: "Mark as damaged", "Move to warehouse" (admin + dispatch)
A4.2. Create app/(app)/inventory/[id]/page.tsx (per-serial detail):
   - Hero: serial number (mono, large), product, status pill, current location
   - Timeline: full lifecycle — procured (date, procurement#) → reserved (if applicable, date, dealer, order) → dispatched (if applicable, date, dispatch#) → delivered (if applicable, date, recipient)
   - Action panel: status-appropriate actions (e.g., if in_stock: "Mark damaged", "Move warehouse"; if reserved: "Release reservation")
   - Audit log section: who changed what, when

Phase A5 — Inventory dashboard widgets
A5.1. Update app/(app)/dashboard/page.tsx to include inventory widgets per the prototype:
   - "In stock" KPI card (total + by product top 5)
   - "Reserved" KPI card
   - "Low stock alerts" — products with in_stock count below tenant_settings.low_stock_threshold
   - "Recent procurements" mini-list
A5.2. All numbers use IBM Plex Mono with tabular figures (per CLAUDE.md §4)

Phase A6 — Status transition guards
A6.1. Create packages/db/src/inventory/transitions.ts with explicit state machine:
   - Allowed transitions: in_stock → reserved, reserved → in_stock, reserved → dispatched, dispatched → delivered, in_stock → damaged, in_stock → lost, dispatched → returned, returned → in_stock (with admin override)
   - Forbidden transitions raise InvalidTransitionError with the source + target shown
A6.2. EVERY status change goes through the transition function — no raw UPDATE inventory_items SET status = X queries anywhere
A6.3. Transitions are inside withTenant() transactions with row-level locks (SELECT ... FOR UPDATE on the inventory_items row) per CLAUDE.md §11

Phase A7 — Tests for inventory
A7.1. Procurement creation, line item add/remove/update, serial submission with duplicates rejected, finalization gated on completeness
A7.2. State machine: every allowed transition tested, several forbidden transitions confirmed to raise
A7.3. Row-locking under concurrent reservation attempts (use a quick simulation: two parallel withTenant blocks trying to reserve the same serial — second should fail cleanly)
A7.4. RLS still holds for procurements + procurement_items + inventory_items across tenants
A7.5. Seed expansion: ~500 inventory_items across products per tenant (mix of statuses for demo purposes — about 60% in_stock, 30% reserved (linked to fake dealer_ids since orders don't exist yet), 10% mixed dispatched/delivered)

==========================================================
TRACK B — DAILY AUTOMATION KIT (one-time setup)
==========================================================

These five automations will be reused by every day from now through Day 18. Build them once, well.

Phase B1 — Pre-flight script
B1.1. Create scripts/preflight.ps1 (Windows) and scripts/preflight.sh (POSIX) that check:
   - Git working tree is clean (no uncommitted changes)
   - Local branch is in sync with origin (no unpushed commits, or warn if any)
   - Docker Desktop is running (docker info succeeds)
   - dealerlink-postgres container is "healthy"
   - Required Postgres extensions are loaded (uuid-ossp, pg_trgm, btree_gin)
   - .env.local exists and has non-placeholder values for SESSION_SECRET, RESEND_API_KEY, SENTRY_DSN
   - pnpm dev is NOT running (port 3000 free)
   - Node version is 20.x
   - pnpm version is 9.x
   - Latest migration is applied (pnpm db:migrate dry-run finds nothing pending)
B1.2. Output: structured report with ✅/⚠️/❌ per check. Exit code 0 if all green, 1 if any ❌.
B1.3. Make both scripts executable. Document in README.md and SETUP.md.
B1.4. Add `pnpm preflight` as a root package.json script that runs the OS-appropriate version.

Phase B2 — Daily verify specs
B2.1. Create apps/web/tests/e2e/ directory if not present. Install Playwright (`pnpm add -D @playwright/test` at workspace root; `pnpm exec playwright install chromium`).
B2.2. Create one verify spec per completed day so far:
   - verify-day-1.spec.ts: app shell renders, all 11 nav items present, /api/health returns ok
   - verify-day-2.spec.ts: login works for each role, dashboard greeting shows, logout works, RLS holds (smoke check)
   - verify-day-3.spec.ts: tenant resolution by ?tenant=demo, operator can impersonate, banner shows, impersonation read-only is enforced
   - verify-day-4.spec.ts: operator can create a tenant, credentials shown, new admin can log in
   - verify-day-5.spec.ts: dealer list loads with seed data, product list loads, role enforcement blocks sales from editing commercial terms
   - verify-day-6.spec.ts: procurement create → serial entry → finalize works, inventory list shows new serials, status transitions work
B2.3. Add `pnpm verify` script at root that runs ALL verify specs in order. Aborts on first failure (fail-fast).
B2.4. Add `pnpm verify:latest` that runs only the most recent day's spec (for fast feedback during a build day).
B2.5. Each future day's prompt will add its own verify spec. Establish this pattern clearly.

Phase B3 — Auto-commit and auto-push
B3.1. End of every Server Action / build phase doesn't auto-commit (too granular), but the END of each day's prompt should explicitly do the following:
   - git add -A
   - git commit -m "<conventional commit message>"
   - git push
B3.2. Add this as Phase 11 (or the final phase) of every future day's prompt template. Document the template in a new file: `docs/BUILD_PROMPT_TEMPLATE.md` so every future day's prompt has the same closing pattern.
B3.3. Today, after Day 6's work, perform the auto-commit + auto-push using:
   - Commit message: `feat(inventory): day 6 — procurement, serial entry, status transitions + daily automation kit`

Phase B4 — PROJECT_PLAN.md auto-update
B4.1. Every future day's prompt MUST conclude with these specific actions:
   a. Open PROJECT_PLAN.md
   b. Find the row for B.N (where N is the day number)
   c. Change status from ⏳ to ✅
   d. Add today's date in YYYY-MM-DD format
   e. Add a brief notes summary
   f. Append a new row to the Changelog section at the bottom with date, day summary, and commit SHA
B4.2. Today, do this for B.6 yourself after completing the work.
B4.3. This eliminates the manual housekeeping the user previously did. Add the requirement to docs/BUILD_PROMPT_TEMPLATE.md.

Phase B5 — DEVIATIONS.md auto-log
B5.1. Create /DEVIATIONS.md at repo root if it doesn't exist. Format:
```

# Build Deviations Log

Append-only record of deviations from the daily prompt spec.
Format: Day N — YYYY-MM-DD — DEV.NN — Title

## DEV.01 — Day 1 — strict-peer-dependencies disabled

**Date:** YYYY-MM-DD
**Spec said:** strict-peer-dependencies=true in .npmrc
**Built:** false + auto-install-peers=true
**Why:** Next.js 14 + React 18 peer-dep tree doesn't resolve under strict mode
**Impact:** None on functionality; standard pnpm + Next workaround
**Resolution:** None needed

## DEV.02 — Day 1 — ESLint not in pre-commit hook

... etc

```
B5.2. Back-fill from Days 1–5: read PROJECT_PLAN.md Risks register and the daily summaries to retroactively populate DEVIATIONS.md with every deviation logged so far. Use commit history if needed.
B5.3. Append today's Day 6 deviations as they happen.
B5.4. Future day prompts conclude with: "If any deviations from spec occurred, append to /DEVIATIONS.md with the format above."
B5.5. Document the requirement in docs/BUILD_PROMPT_TEMPLATE.md.

==========================================================
PHASE C — END OF DAY ROUTINE (one-time setup, executed today)
==========================================================

C1. Run pnpm preflight (verify your own setup script works)
C2. Run pnpm verify (all 6 day specs should pass — verify-day-6 is today's deliverable)
C3. Run pnpm typecheck, pnpm lint, pnpm build, pnpm test — all green
C4. Update PROJECT_PLAN.md: mark B.6 ✅, today's date, brief notes, changelog entry
C5. Append Day 6 deviations to DEVIATIONS.md
C6. Auto-commit: `git add -A && git commit -m "feat(inventory): day 6 — procurement, serial entry, status transitions + daily automation kit"`
C7. Auto-push: `git push`
C8. Print final summary including:
- Tests added today + total count
- Files added in Track A (inventory)
- Files added in Track B (automation kit)
- Deviations count appended to DEVIATIONS.md
- Commit SHA and confirmation it was pushed
- "Daily automation kit established — future days will use pnpm preflight, pnpm verify, and auto-housekeeping"

GUARDRAILS:
- All inventory state transitions go through transitions.ts — no raw UPDATE
- Serial number uniqueness enforced at DB level (tenant_id, serial_number) WHERE serial_number IS NOT NULL — verify the constraint exists
- Row locks on inventory_items during reservation/dispatch operations
- Procurement totals stay in decimal(12,2)
- The verify specs are end-to-end and use the actual Playwright runner, not unit-test mocks — they should catch real regressions
- DEVIATIONS.md is append-only — never edit historic entries; if a deviation gets resolved, append a "RESOLVED" note as a new entry referencing the original DEV.NN

WHEN DONE:
- Print the summary per Phase C8
- The user expects the auto-housekeeping to have run; confirm explicitly that PROJECT_PLAN.md and DEVIATIONS.md are updated
```

### Verification checklist for you (after Claude Code finishes)

#### Inventory module

- [ ] All quality gates pass
- [ ] `/inventory/procurements/new` accepts a procurement with line items
- [ ] Confirming a procurement opens the serial entry page
- [ ] Pasting 50 serials with one duplicate → duplicate highlighted, can't finalize until fixed
- [ ] Finalizing → 50 inventory_items rows created with status='in_stock'
- [ ] `/inventory` shows the new serials, virtualized scroll smooth
- [ ] Filter by status, by product → works
- [ ] Click a serial → detail page with timeline
- [ ] Try to manually UPDATE an inventory_item's status via SQL → constraint or trigger catches it (or at minimum, the transition function refuses)
- [ ] Dashboard shows the inventory widgets

#### Automation kit

- [ ] `pnpm preflight` runs and reports green
- [ ] `pnpm verify` runs all 6 day specs and they pass
- [ ] `pnpm verify:latest` runs only Day 6's spec
- [ ] DEVIATIONS.md exists at root, contains entries for Days 1–5 back-fill + Day 6's deviations
- [ ] PROJECT_PLAN.md B.6 is already marked ✅ with today's date and changelog entry — you don't have to do it manually
- [ ] Commit was pushed automatically (`git log -1` shows the Day 6 commit on origin)
- [ ] `docs/BUILD_PROMPT_TEMPLATE.md` exists with the daily template

---

## Day 7 — Sales Pipeline (9-stage Kanban with dnd-kit)

**Goal:** Ship the Sales Pipeline as a 9-stage kanban board. By end of day, sales users can create deals, drag them between stages, see hot/risk markers, and interact with the high-risk-dealer guard.

This is the **first day using the daily automation kit** established Day 6. Phases run cleaner because preflight + verify + auto-housekeeping are now standard.

**Estimated time:** 5–6 hours of Claude Code work + ~30 min of your verification

**Deliverable:** Working `/pipeline` page that visually matches the prototype, with drag-and-drop stage transitions, deal create/edit/close flows, and a stage state machine.

### Prompt for Claude Code

```
You are implementing Day 7 of the Dealerlink build. Day 6 shipped successfully (commit 8ea2fe4) — inventory module + daily automation kit. From today onward, every day uses pnpm preflight, pnpm verify, and the end-of-day routine in docs/BUILD_PROMPT_TEMPLATE.md.

PRELIMINARY (every day must do this):
P.1. Run `pnpm preflight` and confirm 9 green checks. If anything fails, stop and report.
P.2. Read docs/BUILD_PROMPT_TEMPLATE.md — your standing closeout pattern.
P.3. Skim DEVIATIONS.md to know what's been parked.

PRIMARY REFERENCES:
1. CLAUDE.md (especially §3 stack — dnd-kit is locked for kanban, §10 auth & roles, §11 critical workflows — stage progression rules, §19 standards)
2. BRD §3 (Sales Pipeline — 9 stages, transition rules, automatic vs manual triggers, high-risk dealer guard)
3. docs/Distribyte.html — Pipeline screen is the primary visual reference. Note the column widths, deal card density, hot/risk markers, stage headers with counts and value summaries.
4. docs/screens-extra.jsx — additional pipeline interactions
5. Day 6 commit 8ea2fe4 — inventory state machine in packages/db/src/inventory/transitions.ts is the pattern for state machines; pipeline transitions follow the same shape

DAY 7 SCOPE:

Phase 1 — Pipeline schema
1.1. Create packages/db/src/schema/deal.ts per BRD §3:
   - id, tenant_id, standard audit columns
   - deal_code (auto-generated, format DEAL-2026-0001 — use document_counters with fiscal year)
   - title (text, required) — e.g., "Acme Corp 100kW rooftop solar"
   - dealer_id (FK to dealers, required)
   - assigned_to (FK to users, required — the sales person who owns the deal)
   - stage (enum: 'qualification' | 'needs_analysis' | 'quotation_sent' | 'negotiation' | 'verbal_commit' | 'po_pending' | 'payment_pending' | 'ready_for_dispatch' | 'closed' — matches BRD §3.4 stage numbers 1-9)
   - status: 'open' | 'won' | 'lost' (when stage='closed', status must be 'won' or 'lost' — never 'open')
   - estimated_value (decimal 12,2, nullable) — running estimate; gets nailed down when quotation is generated
   - probability_percent (integer 0-100, nullable) — sales confidence
   - expected_close_date (date, nullable)
   - source (enum: 'inbound' | 'outbound' | 'referral' | 'repeat_business' | 'other')
   - lost_reason (text, nullable — required if status='lost', stored as enum: 'price' | 'competitor' | 'timing' | 'no_budget' | 'other' + free-text)
   - notes (text)
   - hot (boolean, default false — sales-marked priority deal)
   - last_activity_at (timestamp — auto-updated on stage change, note added, etc.)
1.2. Create deal_products junction table (a deal can be associated with multiple products as line interest, before a real quotation exists):
   - id, tenant_id, deal_id (FK), product_id (FK), estimated_quantity (integer), notes (text)
1.3. Create deal_stage_history table for the audit log of stage transitions (separate from generic audit_log because we want quick "time in each stage" reporting):
   - id, tenant_id, deal_id, from_stage, to_stage, transitioned_by, transitioned_at, automatic (boolean — true if auto-triggered, false if manual), reason (text, nullable — for stage 9 closures and high-risk overrides)
1.4. Indexes:
   - (tenant_id, stage, status) for kanban column queries
   - (tenant_id, assigned_to, stage) for "my deals"
   - (tenant_id, hot) WHERE hot = true for hot-deal queries
   - (tenant_id, last_activity_at DESC) for stale-deal detection
   - UNIQUE (tenant_id, deal_code)
1.5. RLS on all three tables. Audit trigger on deals and deal_products (deal_stage_history is itself the audit so no trigger needed).
1.6. document_counters entry for 'deal' with fiscal_year per the tenant's fiscal year start.
1.7. Generate migration and verify it runs.

Phase 2 — Stage state machine
2.1. Create packages/db/src/deals/transitions.ts following the inventory transitions pattern from Day 6:
   - allowedTransitions map covering BRD §3.4. Examples:
     - qualification → needs_analysis (manual)
     - qualification → closed (manual, lost only)
     - needs_analysis → quotation_sent (auto when quotation email is delivered; manual override allowed for admin)
     - quotation_sent → negotiation (manual)
     - negotiation → verbal_commit (manual)
     - verbal_commit → po_pending (manual; this is where the PO/PI gets generated)
     - po_pending → payment_pending (auto when order is confirmed; manual override for admin)
     - payment_pending → ready_for_dispatch (auto when payment status='paid' OR per credit terms)
     - ready_for_dispatch → closed (auto when dispatch is created; status='won')
     - any → closed (manual; status='lost' with mandatory lost_reason)
     - Reverse transitions only with admin role (e.g., negotiation → needs_analysis is admin-only)
   - High-risk dealer guard: if dealer.risk_level = 'high', deals cannot move PAST stage 4 (negotiation) without an admin override
     - The override action requires an explicit reason captured in deal_stage_history.reason
2.2. transitionStage(dealId, toStage, opts: { override?: { admin: User, reason: string } }) — runs inside withTenant transaction:
   - SELECT deal FOR UPDATE
   - Validate transition is allowed for current stage + role
   - Check high-risk guard if applicable
   - Update deal.stage, deal.status, deal.last_activity_at
   - Insert deal_stage_history row
   - Return updated deal
2.3. Forbidden transitions throw InvalidTransitionError with helpful messages.
2.4. Unit tests for: every allowed transition, several forbidden ones, high-risk guard kicks in correctly, admin override works with reason, missing reason on lost-closure throws.

Phase 3 — Server Actions
3.1. apps/web/lib/actions/deals/ using tenantAction():
   - createDeal (admin, sales) — title, dealer_id, assigned_to (defaults to current user if sales), estimated_value, source, products[]
   - updateDealMetadata (admin + assigned_to sales) — title, estimated_value, probability, expected_close_date, notes, hot flag
   - reassignDeal (admin only)
   - transitionDealStage (admin, sales — but admin override required for high-risk past stage 4)
   - closeDeal (admin, sales) — status, lost_reason if lost
   - addDealProduct, removeDealProduct, updateDealProduct (admin + assigned_to sales)
3.2. All actions write deal_stage_history when applicable, update last_activity_at on the deal.

Phase 4 — Query helpers
4.1. apps/web/lib/queries/deals.ts:
   - listDealsByStage(tenantId, opts) — returns Map<stage, Deal[]> for kanban rendering. Filters: assigned_to, hot, dealer_id, age_range
   - getDealById(id) — full deal with dealer, assigned user, products, stage_history (last 20 entries)
   - getDealMetrics(tenantId) — per-stage counts, per-stage total estimated value, average time-in-stage (for dashboard widgets later)
4.2. All queries respect RLS via the request's tenant context.

Phase 5 — Pipeline Kanban UI
5.1. Create app/(app)/pipeline/page.tsx — the kanban board.
   Visual references: docs/Distribyte.html Pipeline screen, docs/screens-extra.jsx kanban patterns.
   - Header bar: page title "Pipeline" (Inter italic for "Pipeline"), date range filter, assigned-to filter (admin sees all, sales defaults to "Mine"), search box, "+ New deal" button
   - 9 columns horizontally scrolling (the prototype lets you scroll horizontally on smaller screens, but desktop fits ~5-6 columns visible at once with horizontal scroll for the rest)
   - Each column header: stage name (Inter), count of deals (mono), total estimated value (mono, ₹ formatted with auto-scale)
   - Each deal card (compact, ~120px tall):
     - Title (truncated)
     - Dealer name + GSTIN state (small mono)
     - Estimated value (mono, large, tabular figures)
     - Hot marker (small flame icon if hot=true)
     - Risk marker (small badge if dealer.risk_level='high')
     - Last activity ("3d ago" — mono)
     - Avatar of assigned_to person
   - Hover state: subtle hairline shadow
   - Cards are draggable via dnd-kit
5.2. Implement drag-and-drop with dnd-kit:
   - useSortable on each card, useSortable column droppable
   - Optimistic update: card visually moves immediately on drop
   - Server action called in background; on success, no change; on failure, card snaps back with toast error
   - Stage transition validation happens server-side; for predictable UX, also do a client-side check before the optimistic update to prevent obviously-invalid drops (e.g., grayed-out columns when dragging)
5.3. High-risk override flow:
   - If a non-admin sales user tries to drag a high-risk deal past stage 4, show a modal: "This deal is for a high-risk dealer. Moving it past Negotiation requires admin approval. Cancel or Request approval?"
   - "Request approval" is out of scope for Phase 1 (just shows a placeholder); cancel reverts the drag
   - If an admin drags it: a modal asks for the override reason (required text), then submits with override

Phase 6 — Deal detail page
6.1. Create app/(app)/pipeline/[id]/page.tsx (or /deals/[id] if cleaner routing):
   - Hero: deal title (large), dealer name + GSTIN, current stage pill, hot toggle, action menu
   - Tabs/sections:
     - Overview: estimated value, probability, expected close, source, assigned to, notes (inline-editable)
     - Products: list of deal_products with estimated quantities, "+ Add product"
     - Stage History: timeline showing every transition (from_stage → to_stage), who, when, reason (if any), automatic vs manual
     - Activity: audit_log entries for this deal
   - Right rail: stage transition buttons (showing allowed next stages, disabled if not allowed for current role/risk)
   - "Close deal" button: opens modal for Won/Lost + reason if Lost

Phase 7 — Deal create form
7.1. Create app/(app)/pipeline/new/page.tsx:
   - Single-page form, sections: Identity (title), Dealer (typeahead from dealers — uses Day 5's searchDealers), Owner (defaults to current user if sales; admin can pick), Commercial (estimated value, expected close, probability, source), Products (typeahead, add multiple lines)
   - Submit creates deal at stage='qualification'
   - Redirect to deal detail

Phase 8 — Dashboard widgets
8.1. Update /dashboard with pipeline widgets per prototype:
   - "Pipeline value" card: total estimated value of open deals
   - "Hot deals" card: count of hot deals + list of top 5
   - "Stalled deals" card: deals with no activity in 14+ days
   - "Stage funnel" mini-chart: bar chart of deal count by stage (use custom SVG per CLAUDE.md §4, not Tremor for this small chart; Tremor for larger ones)

Phase 9 — Seed data
9.1. Update seed scripts to add per CLAUDE.md §13:
   - 30 deals per tenant, spread across all 9 stages (more deals in middle stages for realistic demo: ~3 in qualification, 5 in needs_analysis, 5 in quotation_sent, 8 in negotiation, 4 in verbal_commit, 2 in po_pending, 2 in payment_pending, 1 in ready_for_dispatch, 0 in closed initially — Day 11 will close some)
   - Each deal linked to a real dealer + 1-3 products with quantities
   - 3-5 deals marked hot
   - 2-3 deals on high-risk dealers (for testing the guard)
   - Realistic deal titles (e.g., "Solar Roofers Pune 150kW rooftop", "Bharat EPC 1MW utility-scale", "Maharashtra Solar Co warranty extension")
   - Estimated values realistic for solar distribution (₹2L to ₹2Cr range)
   - last_activity_at distributed across last 30 days for realistic stale-deal indicators
9.2. Re-run seed and verify counts

Phase 10 — Tests
10.1. Unit tests for transitions.ts: all allowed transitions, several forbidden ones, high-risk guard, admin override
10.2. Integration tests for createDeal, transitionDealStage (including override), closeDeal with required lost_reason
10.3. RLS test that deals from tenant A are not visible to tenant B
10.4. Component test for kanban DnD: rendering a column, simulating a drop event triggers the right server action
10.5. Playwright verify-day-7.spec.ts:
   - Login as sales@demo.test
   - Visit /pipeline
   - Verify 9 columns visible, seed deals present
   - Drag a deal from qualification to needs_analysis → succeeds, card moved
   - Click "+ New deal", fill form, submit → deal appears in qualification
   - Try to drag a high-risk deal past negotiation → modal appears, cancel
   - Click into a deal → detail page loads with stage history populated
   - Close the deal as Lost with reason → status updates, history shows the transition

Phase 11 — Documentation
11.1. Update CLAUDE.md §11 if any pipeline workflow nuances emerged that aren't already documented.
11.2. Append to docs/RUNBOOKS.md: "Pipeline stage transition rules" with the full transition matrix and override semantics.

Phase 12 — Closeout (per docs/BUILD_PROMPT_TEMPLATE.md)
12.1. Run `pnpm preflight` — confirm green
12.2. Run `pnpm verify` — all 7 day specs pass (verify-day-7 is today's deliverable)
12.3. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` — all green
12.4. Update PROJECT_PLAN.md: mark B.7 ✅, today's date, brief notes, changelog entry
12.5. Append any Day 7 deviations to DEVIATIONS.md
12.6. Auto-commit: `git add -A && git commit -m "feat(pipeline): day 7 — sales pipeline kanban with stage state machine"`
12.7. Auto-push: `git push`
12.8. Print final summary with: tests added, files added by phase, deviations count, commit SHA confirmed pushed, "Day 7 done"

GUARDRAILS:
- All stage transitions go through transitions.ts — no raw UPDATE deals SET stage = X anywhere
- Row locks on deals during stage transitions (SELECT FOR UPDATE)
- High-risk guard tested explicitly — DO NOT skip
- Drag-and-drop optimistic updates MUST roll back on server failure (don't leave the user with stale UI)
- Closed deals (status != 'open') cannot be dragged in the kanban — they shouldn't even appear in open-deals columns
- estimated_value uses decimal(12,2) — money rules per CLAUDE.md §19
- All dates use the en-IN locale formatting via formatDate from lib/format

WHEN DONE:
- Confirm pnpm verify passes including the new verify-day-7 spec
- Print summary per Phase 12.8
```

### Verification checklist for you (after Claude Code finishes)

- [ ] `pnpm preflight` → 9 green
- [ ] `pnpm verify` → 7 specs pass (including new verify-day-7)
- [ ] `/pipeline` shows 9 columns with seed deals distributed across them
- [ ] Drag a deal between columns → visual update is instant, server confirms in background
- [ ] Drag to an invalid stage (e.g., qualification → ready_for_dispatch directly) → drop is rejected with toast
- [ ] Try to drag a high-risk deal past Negotiation as a sales user → modal appears
- [ ] Same drag as admin → reason modal appears, can override
- [ ] Click a deal → detail page shows stage history timeline
- [ ] Close deal as Lost without reason → blocked with validation error
- [ ] Dashboard shows pipeline widgets with real numbers
- [ ] PROJECT_PLAN.md B.7 marked ✅ (auto-done)
- [ ] DEVIATIONS.md has Day 7 entries if any (auto-done)
- [ ] Commit pushed (auto-done)

If all auto-housekeeping ran as expected, your only task is the visual + interaction verification above. ~30 minutes.

---

## Day 8 — Quotation Builder UI + Line Items

**Goal:** Ship the Quotation Builder — the most complex single form in the app. By end of day, sales users can create, edit, send, and revise quotations with multi-line items, dealer-context-aware tax preview, before-tax discounts, terms & conditions, and validity periods.

**This day is the foundation for Day 9.** Day 9 (GST tax engine) will compute final taxes on the data structure Day 8 produces. If the schema or line-item shape is wrong here, every tax calculation downstream is wrong. **Day 8 must be precise.**

**Estimated time:** 6–7 hours of Claude Code work + ~45 min of your verification

**Deliverable:** Working `/quotations` module with list, create, edit, detail, revise, send-via-email-stub. Tax preview is approximate (final engine arrives Day 9); schema is fully tax-engine-ready.

### Prompt for Claude Code

````
You are implementing Day 8 of the Dealerlink build. Day 7 shipped successfully (commit c9c70c5) — sales pipeline kanban. The CLAUDE.md refactor is also complete (commit 6df3e1f) — CLAUDE.md is now 29.8k chars with 10 focused docs in docs/*.md.

Today: Quotation Builder. This is the data-producing input for Day 9's GST tax engine. The schema and line-item shape MUST be tax-engine-ready by end of day.

PRELIMINARY (every day must do this):
P.1. Run `pnpm preflight` and confirm 9 green checks. Port 3000 should be free.
P.2. Read CLAUDE.md (now slim) for §3 stack, §5 data model, §6 GST logic, §7 auth, §8 anti-patterns, §9 locked decisions.
P.3. Read docs/STANDARDS.md and docs/WORKFLOWS.md for context. Read docs/TESTING.md for test patterns.
P.4. Skim DEVIATIONS.md to know what's been parked. R.13, R.17, R.20 are still tracked.
P.5. Read CLAUDE.md §6 (GST & Multi-Party Document Logic) THREE TIMES. This is the highest-stakes module of the build and Day 8's schema must match the contract.
P.6. Read BRD §4 (Quotations + GST computation rules) for the actual three-party logic and tax math.

PRIMARY REFERENCES:
1. CLAUDE.md §6 (GST logic), §3 stack, §5 data model
2. docs/WORKFLOWS.md (pipeline → quotation → order flow)
3. BRD §4 — quotation requirements, three-party scenarios, intra-state vs inter-state determination
4. docs/Distribyte.html — Quotation Builder is the most complex form in the prototype
5. docs/3 PO Premier.pdf — real PO/quotation reference document with actual tax math for validation
6. Day 7 commit c9c70c5 — pipeline transitions (qualification → needs_analysis → quotation_sent) integrate with quotation creation

==========================================================
PRELIMINARY TRACK — Playwright auto-start fix (~10 min)
==========================================================

PRE.1 — Make pnpm verify self-sufficient (closes the two-terminal dance)

PROBLEM: Currently `pnpm verify` requires `pnpm dev` running in a separate terminal. This caused 16/16 failures during post-refactor validation when dev server wasn't up. Add `webServer` config so Playwright auto-starts the dev server.

PRE.1.1. Open apps/web/playwright.config.ts. Add a webServer block to the export:

```typescript
export default defineConfig({
  // ... existing config ...
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2 min for cold Next.js compile
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
````

PRE.1.2. Test it: stop any pnpm dev process, then run `pnpm verify` from a single terminal. Playwright should auto-start the dev server, run tests, then tear down. All 16 specs should still pass.

PRE.1.3. Update SETUP.md to remove any "run pnpm dev in another terminal first" instructions, since they're no longer needed.

PRE.1.4. Commit this fix BEFORE starting Day 8 main work:
git add apps/web/playwright.config.ts SETUP.md
git commit -m "chore(verify): playwright auto-starts dev server (closes two-terminal dance)"

==========================================================
TRACK A — QUOTATION BUILDER (CHUNKED — 5 chunks, commit per chunk)
==========================================================

CRITICAL: Day 7 timed out on a single-shot UI generation. The Quotation Builder is even more complex. From the start, build in CHUNKS, committing between each. Treat single components >250 lines as candidates for further chunking.

## CHUNK 8a — Schema and queries

A1.1. Create packages/db/src/schema/quotation.ts:

```typescript
// Quotation header
export const quotations = pgTable('quotations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),

  // Identity (auto-generated per fiscal year via document_counters)
  quoteNumber: text('quote_number').notNull(), // e.g., QT-2026-0042
  revision: integer('revision').notNull().default(1), // bumps on each revise
  parentQuotationId: uuid('parent_quotation_id'), // self-FK; non-null for revisions

  // Relationships
  dealId: uuid('deal_id'), // optional — quote can exist without a deal
  dealerId: uuid('dealer_id').notNull(),
  preparedBy: uuid('prepared_by').notNull(), // FK to users

  // Critical for tax engine (Day 9): captures point-in-time tenant + dealer state
  tenantStateAtIssue: text('tenant_state_at_issue').notNull(), // 2-letter Indian state code
  placeOfSupply: text('place_of_supply').notNull(), // 2-letter — defaults from dealer.state

  // Commercial
  quoteDate: date('quote_date').notNull().defaultNow(),
  validUntil: date('valid_until').notNull(),
  currency: text('currency').notNull().default('INR'),

  // Discount applied BEFORE tax (BRD §4 — Phase 1 only supports before-tax discounts)
  discountType: text('discount_type'), // 'percent' | 'amount' | null
  discountValue: numeric('discount_value', { precision: 12, scale: 2 }), // null if no discount

  // Computed totals (denormalized for fast list queries; recomputed on every save)
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(), // sum of line totals before discount
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  taxableAmount: numeric('taxable_amount', { precision: 14, scale: 2 }).notNull(), // subtotal - discount
  cgstAmount: numeric('cgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  igstAmount: numeric('igst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(), // taxableAmount + cgst + sgst + igst

  // Terms
  termsAndConditions: text('terms_and_conditions'), // tenant default or per-quote override
  notes: text('notes'),

  // Status
  status: text('status').notNull().default('draft'),
  // 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'superseded' (when revised)
  sentAt: timestamp('sent_at'),
  sentVia: text('sent_via'), // 'email' | 'pdf_download' | 'in_person' (Phase 1 = email or download)
  acceptedAt: timestamp('accepted_at'),
  rejectedAt: timestamp('rejected_at'),
  rejectedReason: text('rejected_reason'),

  // Audit
  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').notNull(),
});

// Line items
export const quotationLines = pgTable('quotation_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  quotationId: uuid('quotation_id').notNull(),

  // Position (1-indexed; supports reordering)
  lineNumber: integer('line_number').notNull(),

  // Product reference (captured by id for traceability, but values snapshotted)
  productId: uuid('product_id').notNull(),
  productSku: text('product_sku').notNull(), // snapshot
  productName: text('product_name').notNull(), // snapshot
  hsnCode: text('hsn_code').notNull(), // snapshot from product.hsn_code

  // Quantity and pricing
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(), // e.g., 100.000 panels
  unitOfMeasure: text('unit_of_measure').notNull().default('Nos'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),

  // CRITICAL: gst_rate must come from product.gst_rate at line-creation time
  // Day 9 tax engine reads this column as source of truth — never recomputes from product
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(), // 5.00, 12.00, 18.00, or 28.00

  // Computed (lineTotal = quantity * unitPrice — pre-discount, pre-tax)
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),

  // Free-text addenda
  description: text('description'), // override of product name if needed
  notes: text('notes'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

A1.2. Indexes:

- quotations: (tenant_id, status, quote_date DESC), (tenant_id, dealer_id, quote_date DESC), UNIQUE (tenant_id, quote_number, revision)
- quotation_lines: (tenant_id, quotation_id, line_number), (tenant_id, product_id) for "where used"

A1.3. CHECK constraints:

- quotations.gst_rate sanity check: NOT applicable here (it's on quotation_lines)
- quotation_lines.gst_rate IN (0, 5, 12, 18, 28) — must match products table constraint
- quotations.discount_type IN ('percent', 'amount') OR IS NULL
- quotations.status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded')
- quotations.revision >= 1

A1.4. RLS policy: tenant_isolation on both tables. Audit trigger on both.

A1.5. Document counter entry: 'quotation' doc_type with fiscal_year (Indian fiscal year per ADR-005).

A1.6. Generate Drizzle migration. Confirm it applies cleanly.

A1.7. Create packages/schemas/src/quotation.ts with Zod schemas:

- createQuotationInput
- updateQuotationInput (partial)
- reviseQuotationInput
- quotationLineInput
- sendQuotationInput

A1.8. Create apps/web/lib/queries/quotations.ts:

- listQuotations(tenantId, opts) — filters: status, dealer, date range, prepared_by, search by quote_number
- getQuotationById(id) — full quotation with lines (ordered by line_number), dealer, prepared_by user
- getQuotationsByDeal(dealId)
- getQuotationRevisionChain(quotationId) — returns array of all revisions

A1.9. Verify: pnpm typecheck green.

COMMIT 8a: `feat(quotation): day 8 chunk a — schema + queries`

## CHUNK 8b — Server actions and tax preview helper

A2.1. Create apps/web/lib/quotation/preview.ts — APPROXIMATE tax preview helper for the Builder UI:

```typescript
// NOTE: This is a CLIENT-SIDE preview for the Builder.
// Final authoritative tax calculation arrives in Day 9 (packages/tax).
// The preview rules below MUST match Day 9's engine exactly so users see the right numbers.

import type { QuotationLineInput } from '@dealerlink/schemas';

type TaxPreviewInput = {
  lines: QuotationLineInput[]; // {productId, quantity, unitPrice, gstRate}
  tenantState: string; // 2-letter
  placeOfSupply: string; // 2-letter
  discount: { type: 'percent' | 'amount'; value: number } | null;
};

type TaxPreviewOutput = {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  isInterState: boolean;
};

export function previewTax(input: TaxPreviewInput): TaxPreviewOutput {
  const isInterState = input.tenantState !== input.placeOfSupply;

  // Pre-discount subtotal
  const subtotal = input.lines.reduce(
    (sum, l) => sum + Number(l.quantity) * Number(l.unitPrice),
    0,
  );

  // Apply discount BEFORE tax (Phase 1 rule per BRD §4)
  const discountAmount = input.discount
    ? input.discount.type === 'percent'
      ? subtotal * (input.discount.value / 100)
      : input.discount.value
    : 0;

  const taxableAmount = subtotal - discountAmount;

  // CRITICAL: distribute discount proportionally across lines for tax calc
  // (since different lines may have different GST rates)
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  for (const line of input.lines) {
    const lineGross = Number(line.quantity) * Number(line.unitPrice);
    const lineAfterDiscount = lineGross * (1 - discountRatio);
    const lineRate = Number(line.gstRate) / 100;

    if (isInterState) {
      igst += lineAfterDiscount * lineRate;
    } else {
      // Intra-state: split equally between CGST and SGST
      cgst += lineAfterDiscount * (lineRate / 2);
      sgst += lineAfterDiscount * (lineRate / 2);
    }
  }

  // Round to 2 decimals per CLAUDE.md §6
  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxableAmount: round2(taxableAmount),
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    total: round2(taxableAmount + cgst + sgst + igst),
    isInterState,
  };
}
```

Add unit tests for previewTax in apps/web/lib/quotation/preview.test.ts covering:

- Intra-state single-line panel sale (e.g., MH tenant → MH dealer, 100 panels @ ₹15,000 @ 18% GST)
- Inter-state single-line (e.g., MH tenant → KA dealer)
- Multiple lines with mixed GST rates (18% panels + 12% accessories)
- Percent discount applied before tax
- Amount discount applied before tax
- Zero discount
- Single line at 0% GST (e.g., services exempt)
- Verify rounding behavior matches CLAUDE.md §6 expectations

A2.2. Create apps/web/lib/actions/quotations/ Server Actions, each wrapped in tenantAction():

- createQuotation (admin, sales) — creates draft with computed totals
- updateQuotation (admin + prepared_by sales) — only for status='draft'; recomputes totals
- updateQuotationLines (admin + prepared_by sales) — bulk replace; recomputes totals
- sendQuotation (admin, sales) — transitions draft → sent; stamps sentAt + sentVia; in this day, just logs the email send; pg-boss integration comes Day 14
- markAccepted, markRejected (admin, sales) — captures rejection reason if rejected
- markExpired (admin, system) — for the validity expiry job (Day 14)
- reviseQuotation (admin + prepared_by sales) — creates new quotation with revision = parent.revision + 1, parent_quotation_id set, parent.status = 'superseded'
- deleteQuotation (admin only) — soft delete only allowed for status='draft'

A2.3. Each action recomputes the denormalized totals server-side using the same logic as previewTax. **The server-side computation is authoritative**; the client preview is informational.

A2.4. Audit trail: every status transition writes a row to a new table quotation_status_history (similar to deal_stage_history from Day 7). Same pattern: from_status, to_status, by, at, reason.

A2.5. Pipeline integration: when sendQuotation transitions a quotation to 'sent', if linked to a deal and the deal is in stage 'needs_analysis', auto-advance deal to 'quotation_sent' via transitionDealStage (uses Day 7's existing function).

A2.6. Verify: pnpm typecheck + pnpm test green.

COMMIT 8b: `feat(quotation): day 8 chunk b — server actions + tax preview helper`

## CHUNK 8c — Builder UI (the form itself, the hardest piece)

A3.1. Create app/(app)/quotations/new/page.tsx and app/(app)/quotations/[id]/edit/page.tsx — share the bulk of the Builder.

Sections (top to bottom):

(1) Header card:

- Dealer typeahead (uses Day 5's searchDealers) — required; on select, fills placeOfSupply from dealer.state
- Linked deal typeahead (optional; uses Day 7's deal queries)
- Quote date (default today)
- Valid until (default = today + tenant.default_quote_validity days)
- Prepared by (default = current user; admin can pick another sales user)

(2) Line items table:

- Add row by product typeahead (uses Day 5's searchProducts)
- On product select, snapshot: sku, name, hsn_code, gstRate (read from product.gst_rate — DO NOT allow line-level GST rate edits)
- Editable: quantity, unitPrice, description override (defaults from product name), notes
- Row total (mono, tabular figures) updated live as quantity or unitPrice changes
- Remove row (with confirm if line is the only one)
- Reorder rows (drag handle — use dnd-kit since it's already in the stack)
- Empty state: "Add the first line item to get started"

(3) Commercial section:

- Discount type radio: None / Percentage / Amount
- Discount value input (auto-validated: percent ≤ 100, amount ≤ subtotal)
- Currency display (locked to INR per locked decision; show field as read-only)

(4) Terms & conditions:

- Defaults to tenant.terms_and_conditions if set
- Otherwise empty textarea
- "Use tenant default" button to restore

(5) Notes (internal-only, not on PDF):

- Free-text

(6) Summary card (right side, sticky on desktop):

- Subtotal
- Discount: -₹X (if any)
- Taxable: ₹Y
- CGST @ X% / SGST @ X% (if intra-state) OR IGST @ X% (if inter-state)
- **Inter-state determination chip** showing tenantState → placeOfSupply with badge (e.g., "MH → KA · Inter-state")
- Total (large mono, tabular figures)
- All numbers update LIVE as the form changes (debounced 200ms)

(7) Action footer:

- "Save as Draft" — saves with status='draft'
- "Save and Send" — saves with status='sent', triggers email job
- "Cancel" — discards

A3.2. Form library: react-hook-form + zodResolver per CLAUDE.md §3. Field arrays for line items via useFieldArray.

A3.3. Validation rules:

- At least 1 line item required
- All line items must have quantity > 0 and unitPrice >= 0
- dealerId required
- validUntil must be > quoteDate
- If discountType set, discountValue required and > 0
- If discountType='percent', discountValue <= 100
- If discountType='amount', discountValue <= subtotal (computed)

A3.4. Build the Builder in stages within this chunk if needed — if any single component file exceeds 250 lines, split it:

- QuotationBuilderForm (orchestrator)
- LineItemsTable (the line items section)
- SummaryCard (the totals panel)
- DiscountPicker (the discount section)
  Each in its own file under app/(app)/quotations/\_components/.

A3.5. Verify: navigate to /quotations/new manually. Create a quotation with 2 lines. Confirm preview matches expected math for both intra-state and inter-state cases.

COMMIT 8c: `feat(quotation): day 8 chunk c — builder UI with live preview`

## CHUNK 8d — List, detail, revise, status transitions

A4.1. Create app/(app)/quotations/page.tsx — list view:

- Dense table (56px rows) matching Day 5/Day 7 prototype style
- Columns: quote number (mono, with revision badge if > 1), date, dealer, total amount (mono), status pill, prepared by, valid until (with "expires in X days" or "expired" indicator)
- Filters: status (multi), dealer (typeahead), date range, prepared by, "show superseded" toggle (default off — hides parent revisions)
- Search by quote number
- "+ New quotation" button (admin + sales)
- Pagination per Day 6 pattern

A4.2. Create app/(app)/quotations/[id]/page.tsx — detail view:

- Read-only display matching the Builder structure
- Header: quote number with revision (e.g., "QT-2026-0042 · Rev 2"), status pill, action menu
- Action menu items based on status:
  - Draft: Edit, Send, Delete
  - Sent: Mark accepted, Mark rejected, Revise
  - Accepted: Revise (creates revision), Convert to order (Day 11 stub for now)
  - Rejected: Revise
  - Expired: Revise
  - Superseded: View latest revision link, view older revisions link
- Tabs/sections: Overview (header), Line items, Totals breakdown, Activity (audit log + status history), Revisions (chain of all versions)

A4.3. Revise flow:

- "Revise" creates new quotation with revision = parent.revision + 1
- parent_quotation_id set
- Parent status updates to 'superseded'
- Opens new revision in Builder edit mode pre-filled from parent
- User adjusts lines/discount, saves
- History shows: "Revised from QT-2026-0042 · Rev 1"

A4.4. Send flow:

- On Send, show modal: "Send to {dealer.email}? Subject: 'Quotation QT-2026-0042 from {tenant.name}'"
- User confirms; status → 'sent', sentAt = now, sentVia = 'email'
- For Day 8: log the email contents to email_delivery_log; actual Resend integration validates Day 14
- Auto-advance linked deal stage per A2.5

A4.5. Verify: navigate end-to-end — create → save draft → edit → send → mark accepted → revise → view revision chain.

COMMIT 8d: `feat(quotation): day 8 chunk d — list, detail, revise flow`

## CHUNK 8e — Seed data, tests, closeout

A5.1. Seed data (packages/db/src/seeds/day8.ts):

- 15 quotations per tenant across all statuses
- At least 3 multi-line quotations (mix of panels + inverters + accessories with mixed GST rates)
- At least 2 inter-state quotations (e.g., MH tenant → TN dealer for IGST scenario)
- At least 1 revision chain (QT-2026-0001 Rev 1 → Rev 2 → Rev 3)
- At least 1 with percent discount, 1 with amount discount, rest no discount
- Status distribution: 4 draft, 5 sent, 3 accepted, 2 rejected, 1 expired
- Realistic Indian solar pricing: 540W panels around ₹14k-16k, 6kW inverters around ₹35k-45k, accessories ₹500-5k
- Quote numbers follow QT-YYYY-NNNN format (fiscal year aware)

A5.2. Tests (packages/db/tests/quotation.test.ts + apps/web/lib/quotation/preview.test.ts):

- Schema: required fields, CHECK constraints (gst_rate values, status values, discount_type values)
- RLS isolation (tenant A's quotations not visible to tenant B)
- Document counter increments per fiscal year
- Revision chain integrity (parent.status='superseded' enforced)
- Tax preview: at least 8 cases covering intra-state, inter-state, mixed rates, both discount types, edge cases (zero subtotal, all-zero discount)
- Status transition guards (can't go from 'accepted' back to 'draft', etc.)

A5.3. Playwright verify-day-8.spec.ts (use loginAs helper):

- List loads with seeded quotations
- "+ New quotation" loads Builder
- Add a line, total updates
- Switch dealer to inter-state, see CGST/SGST change to IGST in summary
- Save as draft → appears in list with 'draft' status
- Open draft → Edit → change qty → save → updated
- Send draft → status changes to 'sent'
- Revise sent quotation → new revision in chain, parent superseded
- Role check: sales@demo.test can create+edit; cannot delete others' quotations beyond their own (admin can)

A5.4. Documentation:

- Update docs/WORKFLOWS.md with the full quotation lifecycle (draft → sent → accepted/rejected; revision creates new with parent superseded)
- Add new section to docs/RUNBOOKS.md: "Revising a sent quotation" with the operator-facing steps

A5.5. CRITICAL FINAL CHECKS (this is the Day 9 readiness gate):

- quotation_lines.gst_rate is populated from product.gst_rate at line creation
- quotation_lines.hsn_code is populated from product.hsn_code at line creation
- quotations.tenantStateAtIssue is captured at creation (read from tenant.state at the moment)
- quotations.placeOfSupply defaults from dealer.state at creation
- All money columns are NUMERIC(precision, scale), never float
- previewTax produces the same numbers as the server-side compute (verify with one shared test fixture)

A5.6. Closeout per docs/BUILD_PROMPT_TEMPLATE.md:

- pnpm preflight — green
- pnpm verify — 17/17 (16 prior + verify-day-8)
- pnpm typecheck, pnpm lint, pnpm test, pnpm build — all green
- PROJECT_PLAN.md B.8 marked ✅ with today's date and brief notes
- DEVIATIONS.md: append any Day 8 deviations
- Auto-commit + push

COMMIT 8e: `feat(quotation): day 8 complete — quotation builder, list, detail, revise, send`

==========================================================
GUARDRAILS (DAY 8 SPECIFIC — MOST IMPORTANT)
==========================================================

- gst_rate on quotation_lines is the SOURCE OF TRUTH for Day 9's tax engine. Once captured from product.gst_rate at line creation, it MUST NOT change unless the user explicitly removes and re-adds the line. Day 9 will read this column directly.

- placeOfSupply is the SOURCE OF TRUTH for inter-state determination. Capture it from dealer.state at quotation creation. Allow override (user might pick a different ship-to state) but display the override clearly.

- tenantStateAtIssue is required to handle tenant state changes over time. If a tenant updates their registered state mid-fiscal-year, quotations issued before the change still use the original state.

- Discount is BEFORE TAX in Phase 1. Do NOT implement after-tax discounts — BRD §4 is explicit on this and Day 9 expects this assumption.

- Money columns: NUMERIC(precision, scale) everywhere. Never float. Never parseFloat without going through a Decimal helper.

- previewTax must match the server-side compute EXACTLY. Same rounding rules. Same line-by-line distribution. If they diverge by even 1 paisa, users see incorrect totals before saving. Phase A2.6 test must include this parity check.

- Revisions: parent.status MUST become 'superseded' atomically with new revision creation. Use a transaction. If new revision insert fails, parent stays as 'sent' or 'accepted' or whatever it was.

- Document number generation: use the document_counters mechanism. Two parallel revisions of the same quote must NOT get the same number — but they SHOULD share the base quote_number and differ by revision. So QT-2026-0042 Rev 1 and Rev 2 have quote_number='QT-2026-0042' and revision=1 vs 2. The UNIQUE constraint is (tenant_id, quote_number, revision).

- The Builder is a critical UX. Don't compromise on:
  - Live updates (debounced 200ms, never blocking the input)
  - Inter-state badge prominently shown in summary
  - Mono + tabular figures for all numbers
  - Clear error messages on validation failures (per docs/STANDARDS.md)

- If you exceed 250 lines in any single component file, STOP and split. Day 7's lesson applies here doubly — this is the largest form in the app.

==========================================================
WHEN DONE
==========================================================

Print final report:

- 5 chunk commits (8a through 8e) + 1 preliminary commit
- Tests added today + total count (was 172 after Day 7)
- pnpm verify shows 17/17
- pnpm preflight green (now with port 3000 free since Playwright manages dev server)
- Files added by chunk
- Confirm Day 9 readiness gates (gst_rate, hsn_code, tenantStateAtIssue, placeOfSupply, decimal columns, preview/server parity)
- Any deviations appended to DEVIATIONS.md
- Commit SHAs of each chunk
- Tell me: "Day 8 complete. Day 9 (GST tax engine) is the next step — please review the schema once before Day 9."

```

### Verification checklist for you (after Claude Code finishes)

#### Tax-engine readiness (most important — these enable Day 9)
- [ ] `quotation_lines.gst_rate` populated from products in seeded data — run: `docker compose exec postgres psql -U dealerlink -d dealerlink_dev -c "SELECT q.quote_number, ql.product_sku, ql.gst_rate, p.gst_rate AS product_rate FROM quotation_lines ql JOIN quotations q ON q.id = ql.quotation_id JOIN products p ON p.id = ql.product_id LIMIT 10;"` — gst_rate columns should match
- [ ] `quotations.tenant_state_at_issue` and `place_of_supply` populated for every seed row
- [ ] Inter-state seed quotation exists (e.g., MH tenant → TN dealer) with IGST > 0 and CGST + SGST = 0
- [ ] Intra-state seed quotation exists with CGST = SGST and IGST = 0
- [ ] All money columns are NUMERIC type, not REAL/FLOAT (sanity-check with `\d quotations` in psql)

#### Builder UX
- [ ] Navigate to /quotations/new as admin@demo.test
- [ ] Add 2 line items (one panel, one inverter)
- [ ] Watch summary update live as quantities change
- [ ] Change dealer from intra-state (e.g., MH dealer) to inter-state (e.g., KA dealer) → summary switches from CGST/SGST to IGST
- [ ] Apply 5% percent discount → discount line appears, taxes recompute
- [ ] Save as draft → appears in /quotations list
- [ ] Open the draft, edit a quantity, save → totals updated
- [ ] Send the quotation → status pill changes to 'sent', email logged
- [ ] Revise the sent quotation → new Rev 2 created, original shows as 'superseded'

#### Pipeline integration
- [ ] If a quotation was created against a deal in 'needs_analysis' stage, after sending the quotation, the deal should auto-advance to 'quotation_sent' (open the deal in /pipeline to verify)

#### Role enforcement
- [ ] sales@demo.test can create + edit their own quotations
- [ ] sales@demo.test cannot delete a quotation created by admin (or another sales)
- [ ] accounts@demo.test cannot create quotations (view-only)
- [ ] dispatch@demo.test cannot create quotations

#### Automated
- [ ] `pnpm preflight` — green
- [ ] `pnpm verify` — 17/17 (16 prior + new verify-day-8)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — all green
- [ ] PROJECT_PLAN.md B.8 marked ✅ (auto-done)
- [ ] DEVIATIONS.md has any Day 8 entries (auto-done)
- [ ] Commit pushed (auto-done)

#### Day 9 readiness (verify before kicking off Day 9)
- [ ] Read CLAUDE.md §6 once with fresh eyes — does the schema match the contract?
- [ ] Open the seed data and pick one quotation. Manually compute its expected CGST/SGST/IGST per BRD §4. Compare to what the database shows. They must match.
- [ ] If anything is off — STOP. Fix before Day 9. Day 9's tax engine has no chance of being correct if Day 8's schema is wrong.

### Update PROJECT_PLAN.md after Day 8

Mark **B.8** as ✅, add today's date, append to changelog. Note explicitly: "Day 9 readiness gates verified" if all the readiness checks pass.

---

## Day 9 — GST Tax Engine (HIGHEST-RISK DAY)

**Goal:** Ship the authoritative GST tax engine in `packages/tax/`. By end of day, the engine computes CGST/SGST/IGST per Indian GST law with 100% precision, swapped in behind Day 8's `computeQuotationTotals` call shape. 50+ unit tests prove correctness against canonical fixtures.

**This is the single most important module of the build.** A tax bug destroys commercial trust. Get this right.

**Estimated time:** 5–6 hours of Claude Code work + ~1 hour of your verification + ~30 min of business-side math validation

**Deliverable:** Working `packages/tax/` package, swap completed in `apps/web/lib/actions/quotations/helpers.ts`, Day 8's preview helper redirected to use the canonical engine, 50+ tests passing, all prior quotations re-verified against new engine output.

### Prompt for Claude Code

```

You are implementing Day 9 of the Dealerlink build. Day 8 shipped successfully (commit 6616ca6) — quotation builder with line items + tax preview helper. Day 9 replaces the preview helper with the authoritative tax engine in packages/tax/.

THIS IS THE HIGHEST-STAKES MODULE OF THE ENTIRE BUILD. A tax bug means: customer disputes over invoice math, compliance penalties from misfiled GST, lost trust. Every other module is recoverable; this one is not. Slow is fast here.

PRELIMINARY (every day must do this):
P.1. Run `pnpm preflight` and confirm 9 green checks.
P.2. Read CLAUDE.md §6 (GST & Multi-Party Document Logic) THREE TIMES SLOWLY. Every rule there is a test case.
P.3. Read BRD §4 in full if not already done in Day 8.
P.4. Read DEVIATIONS.md DEV.33 — states are stored as full names ("Maharashtra"), not 2-letter codes ("MH"). The tax engine MUST treat them as opaque strings; comparison is `tenantState !== placeOfSupply`. Don't normalize; trust the input format.
P.5. Read apps/web/lib/quotation/preview.ts to know the current call shape and computation logic. The Day 9 engine has the same input/output contract but with rigorous edge-case handling.
P.6. Read apps/web/lib/actions/quotations/helpers.ts::computeTotalsForPersistence — this is the server-side compute path that Day 9 replaces.

PRIMARY REFERENCES:

1. CLAUDE.md §6 — the contract Day 9 implements
2. BRD §4 — business rules and test scenarios
3. docs/STANDARDS.md — coding standards (decimal arithmetic, error types, etc.)
4. apps/web/lib/quotation/preview.ts — current preview implementation (will be redirected)
5. apps/web/lib/actions/quotations/helpers.ts — server-side compute (will be redirected)
6. packages/tax/ — workspace exists but is empty; this is where the engine lands

==========================================================
TRACK A — PACKAGES/TAX ENGINE (CHUNKED — 4 chunks)
==========================================================

## CHUNK 9a — Engine scaffold + types + decimal helpers

A1.1. Audit packages/tax/ — confirm package.json exists, has typecheck script. If empty src/, set up:

- packages/tax/src/index.ts (public API exports)
- packages/tax/src/types.ts (input/output shapes)
- packages/tax/src/decimal.ts (decimal arithmetic helpers)
- packages/tax/src/round.ts (rounding rules)
- packages/tax/src/state.ts (state comparison helper)
- packages/tax/tests/ (test directory)

A1.2. Decimal arithmetic — NEVER use JavaScript native floats for money math. Three options:

- Option A (preferred): Use `Decimal.js` library — battle-tested, exact precision
- Option B: Use BigInt with explicit scale tracking (paise as integer)
- Option C: Use a thin wrapper around `Number` with strict round-after-every-op

RECOMMEND: Use Decimal.js. It's a small dependency (~30KB) and eliminates the entire class of float-precision bugs. Add to packages/tax/package.json:

```
"dependencies": { "decimal.js": "^10.4.3" }
```

A1.3. packages/tax/src/types.ts — define the engine contract:

```typescript
import { Decimal } from 'decimal.js';

export type GstRate = 0 | 5 | 12 | 18 | 28; // canonical per CLAUDE.md §6

export type TaxLineInput = {
  /** Unique line identifier — passed through to output for reconciliation */
  lineId: string;
  /** Quantity (can be fractional, e.g., 2.5 kg) */
  quantity: number | string | Decimal;
  /** Unit price in INR (decimal, 2-3 places typical) */
  unitPrice: number | string | Decimal;
  /** GST rate as percentage (0, 5, 12, 18, or 28) */
  gstRate: GstRate;
};

export type TaxDiscount =
  | { type: 'percent'; value: number | string | Decimal } // 0-100
  | { type: 'amount'; value: number | string | Decimal } // INR
  | null;

export type TaxComputationInput = {
  /** Tenant's state at point of issue (opaque string; consistent format per DEV.33) */
  tenantState: string;
  /** Place of supply (opaque string; same format as tenantState) */
  placeOfSupply: string;
  /** Line items — at least one required */
  lines: TaxLineInput[];
  /** Document-level discount applied BEFORE tax */
  discount: TaxDiscount;
};

export type TaxLineOutput = {
  lineId: string;
  /** Quantity × unitPrice (pre-discount, pre-tax) */
  lineSubtotal: Decimal;
  /** Portion of document discount allocated to this line */
  lineDiscount: Decimal;
  /** lineSubtotal - lineDiscount */
  lineTaxable: Decimal;
  /** GST rate for this line */
  gstRate: GstRate;
  /** CGST amount for this line (zero if inter-state) */
  lineCgst: Decimal;
  /** SGST amount for this line (zero if inter-state) */
  lineSgst: Decimal;
  /** IGST amount for this line (zero if intra-state) */
  lineIgst: Decimal;
  /** Total tax on this line (cgst + sgst + igst) */
  lineTaxTotal: Decimal;
  /** lineTaxable + lineTaxTotal */
  lineTotal: Decimal;
};

export type TaxComputationOutput = {
  /** Sum of line subtotals (pre-discount, pre-tax) */
  subtotal: Decimal;
  /** Document-level discount amount in INR */
  discountAmount: Decimal;
  /** subtotal - discountAmount */
  taxableAmount: Decimal;
  /** Aggregate CGST across all lines (0 if inter-state) */
  cgstAmount: Decimal;
  /** Aggregate SGST across all lines (0 if inter-state) */
  sgstAmount: Decimal;
  /** Aggregate IGST across all lines (0 if intra-state) */
  igstAmount: Decimal;
  /** taxableAmount + cgstAmount + sgstAmount + igstAmount */
  totalAmount: Decimal;
  /** True if tenantState !== placeOfSupply */
  isInterState: boolean;
  /** Per-line breakdown — same length and order as input lines */
  lines: TaxLineOutput[];
};

export class TaxComputationError extends Error {
  constructor(
    public code: TaxErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type TaxErrorCode =
  | 'EMPTY_LINES'
  | 'NEGATIVE_QUANTITY'
  | 'NEGATIVE_UNIT_PRICE'
  | 'INVALID_GST_RATE'
  | 'NEGATIVE_DISCOUNT'
  | 'DISCOUNT_EXCEEDS_SUBTOTAL'
  | 'DISCOUNT_PERCENT_OUT_OF_RANGE'
  | 'EMPTY_STATE';
```

A1.4. packages/tax/src/decimal.ts — helpers:

- `toDecimal(value: number | string | Decimal): Decimal` — normalizes any input to Decimal
- `sumDecimals(values: Decimal[]): Decimal` — exact summation
  Set Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP }) globally in this file

A1.5. packages/tax/src/round.ts — rounding rules per CLAUDE.md §6:

- `round2(d: Decimal): Decimal` — round to 2 decimal places, half-up
- Apply at LINE LEVEL for taxes (per Indian invoicing convention — each line tax rounded individually, then summed)
- Verify this matches CLAUDE.md §6 — if §6 specifies document-level rounding instead, implement that. PICK ONE AND COMMENT WHY.

A1.6. packages/tax/src/state.ts — state comparison:

- `isInterState(tenantState: string, placeOfSupply: string): boolean` — returns `tenantState !== placeOfSupply` after trim. Pure string comparison; opaque format per DEV.33.

A1.7. packages/tax/src/index.ts — exports the public API surface (types, computeTax function placeholder for now)

A1.8. Add packages/tax/package.json with proper exports map. Add typecheck/test scripts. Make sure pnpm typecheck passes for the package.

COMMIT 9a: `feat(tax): chunk a — engine scaffold, types, decimal arithmetic`

## CHUNK 9b — Core engine implementation

A2.1. Create packages/tax/src/compute.ts — the core engine:

```typescript
import { Decimal } from 'decimal.js';
import { toDecimal, sumDecimals } from './decimal';
import { round2 } from './round';
import { isInterState } from './state';
import type { TaxComputationInput, TaxComputationOutput, TaxLineOutput } from './types';
import { TaxComputationError } from './types';

export function computeTax(input: TaxComputationInput): TaxComputationOutput {
  // Phase 1: Validate
  validateInput(input);

  const interState = isInterState(input.tenantState, input.placeOfSupply);

  // Phase 2: Compute per-line subtotals
  const lineSubtotals = input.lines.map((line) => ({
    line,
    subtotal: toDecimal(line.quantity).times(toDecimal(line.unitPrice)),
  }));

  const subtotal = sumDecimals(lineSubtotals.map((l) => l.subtotal));

  // Phase 3: Compute document-level discount amount
  const discountAmount = computeDiscountAmount(input.discount, subtotal);

  // Validate discount doesn't exceed subtotal
  if (discountAmount.greaterThan(subtotal)) {
    throw new TaxComputationError(
      'DISCOUNT_EXCEEDS_SUBTOTAL',
      `Discount ₹${discountAmount} exceeds subtotal ₹${subtotal}`,
    );
  }

  const taxableAmount = subtotal.minus(discountAmount);

  // Phase 4: Allocate discount proportionally to each line, then compute tax per line
  // Allocation ratio handles edge case of zero subtotal (no division by zero)
  const discountRatio = subtotal.isZero() ? new Decimal(0) : discountAmount.dividedBy(subtotal);

  const lines: TaxLineOutput[] = lineSubtotals.map(({ line, subtotal: lineSubtotal }) => {
    const lineDiscount = round2(lineSubtotal.times(discountRatio));
    const lineTaxable = lineSubtotal.minus(lineDiscount);
    const rate = new Decimal(line.gstRate).dividedBy(100);

    let lineCgst = new Decimal(0);
    let lineSgst = new Decimal(0);
    let lineIgst = new Decimal(0);

    if (interState) {
      // Inter-state: full GST as IGST
      lineIgst = round2(lineTaxable.times(rate));
    } else {
      // Intra-state: split equally CGST + SGST
      const halfRate = rate.dividedBy(2);
      lineCgst = round2(lineTaxable.times(halfRate));
      lineSgst = round2(lineTaxable.times(halfRate));
    }

    const lineTaxTotal = lineCgst.plus(lineSgst).plus(lineIgst);
    const lineTotal = lineTaxable.plus(lineTaxTotal);

    return {
      lineId: line.lineId,
      lineSubtotal: round2(lineSubtotal),
      lineDiscount,
      lineTaxable: round2(lineTaxable),
      gstRate: line.gstRate,
      lineCgst,
      lineSgst,
      lineIgst,
      lineTaxTotal: round2(lineTaxTotal),
      lineTotal: round2(lineTotal),
    };
  });

  // Phase 5: Aggregate document totals (sum of rounded line values — Indian convention)
  const cgstAmount = sumDecimals(lines.map((l) => l.lineCgst));
  const sgstAmount = sumDecimals(lines.map((l) => l.lineSgst));
  const igstAmount = sumDecimals(lines.map((l) => l.lineIgst));

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxableAmount: round2(taxableAmount),
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount: round2(taxableAmount.plus(cgstAmount).plus(sgstAmount).plus(igstAmount)),
    isInterState: interState,
    lines,
  };
}

function validateInput(input: TaxComputationInput): void {
  if (input.lines.length === 0) {
    throw new TaxComputationError('EMPTY_LINES', 'At least one line item is required');
  }
  if (!input.tenantState || !input.tenantState.trim()) {
    throw new TaxComputationError('EMPTY_STATE', 'tenantState is required');
  }
  if (!input.placeOfSupply || !input.placeOfSupply.trim()) {
    throw new TaxComputationError('EMPTY_STATE', 'placeOfSupply is required');
  }
  for (const line of input.lines) {
    const qty = toDecimal(line.quantity);
    if (qty.lessThanOrEqualTo(0)) {
      throw new TaxComputationError(
        'NEGATIVE_QUANTITY',
        `Line ${line.lineId}: quantity must be > 0`,
      );
    }
    const price = toDecimal(line.unitPrice);
    if (price.lessThan(0)) {
      throw new TaxComputationError(
        'NEGATIVE_UNIT_PRICE',
        `Line ${line.lineId}: unitPrice must be >= 0`,
      );
    }
    if (![0, 5, 12, 18, 28].includes(line.gstRate)) {
      throw new TaxComputationError(
        'INVALID_GST_RATE',
        `Line ${line.lineId}: gstRate ${line.gstRate} not in {0,5,12,18,28}`,
      );
    }
  }
  if (input.discount) {
    const value = toDecimal(input.discount.value);
    if (value.lessThan(0)) {
      throw new TaxComputationError('NEGATIVE_DISCOUNT', 'Discount value cannot be negative');
    }
    if (input.discount.type === 'percent' && value.greaterThan(100)) {
      throw new TaxComputationError(
        'DISCOUNT_PERCENT_OUT_OF_RANGE',
        'Discount percent must be 0-100',
      );
    }
  }
}

function computeDiscountAmount(
  discount: TaxComputationInput['discount'],
  subtotal: Decimal,
): Decimal {
  if (!discount) return new Decimal(0);
  const value = toDecimal(discount.value);
  if (discount.type === 'percent') {
    return subtotal.times(value.dividedBy(100));
  }
  return value;
}
```

A2.2. Export `computeTax` from packages/tax/src/index.ts. Also export a convenience function `serializeOutput(output: TaxComputationOutput): SerializedOutput` that converts all Decimal fields to strings — needed because Decimal objects don't serialize cleanly across the Server Component boundary.

A2.3. Verify pnpm typecheck green.

COMMIT 9b: `feat(tax): chunk b — core engine with line-level rounding`

## CHUNK 9c — Comprehensive test suite (50+ tests)

A3.1. Create packages/tax/tests/compute.test.ts. Group tests into clear suites:

TEST SUITE 1 — Basic intra-state cases:

- Single line, 100 panels @ ₹15,000 @ 18%, no discount, intra-state (MH→MH):
  subtotal=1,500,000, discount=0, taxable=1,500,000, cgst=135,000, sgst=135,000, igst=0, total=1,770,000
- Single line, 1 unit @ ₹1.00 @ 18%, intra-state:
  subtotal=1.00, cgst=0.09, sgst=0.09, igst=0, total=1.18
- Single line, 0% GST (e.g., exempt goods):
  taxable amount, zero tax, total = taxable

TEST SUITE 2 — Basic inter-state cases:

- Single line, 100 panels @ ₹15,000 @ 18%, no discount, inter-state (MH→KA):
  subtotal=1,500,000, taxable=1,500,000, cgst=0, sgst=0, igst=270,000, total=1,770,000
- Cross-check: same numbers as intra-state but cgst+sgst becomes igst

TEST SUITE 3 — Mixed GST rate scenarios:

- 2 lines: panels @ 18% + accessories @ 12%, intra-state — each line taxed at its own rate
- 3 lines: panels @ 18% + inverter @ 18% + service @ 0% — service line has zero tax
- All four GST rates in one quotation (5, 12, 18, 28)

TEST SUITE 4 — Discount application:

- Percent discount: 10% off ₹100,000 subtotal, 18% GST intra-state:
  subtotal=100,000, discount=10,000, taxable=90,000, cgst=8,100, sgst=8,100, total=106,200
- Amount discount: ₹5,000 off ₹100,000 subtotal, 18% inter-state:
  subtotal=100,000, discount=5,000, taxable=95,000, igst=17,100, total=112,100
- Discount across multi-line mixed-rate: proportional allocation per line
- 100% percent discount on 18% intra-state: taxable=0, all taxes=0, total=0
- 0% percent discount: same as no discount

TEST SUITE 5 — Rounding edge cases (CRITICAL):

- Tax that produces fractional paise: 1 unit @ ₹333.33 @ 18% intra-state:
  cgst = round2(333.33 _ 0.09) = 30.00 (333.33 _ 0.09 = 29.9997, rounds to 30.00)
  sgst = 30.00, total tax = 60.00, total = 393.33
- Tax rounding consistency: verify line-level rounding produces same total whether you sum first or round first (asserted via test)
- Penny-precision: ₹0.01 line @ 18% intra-state:
  cgst = round2(0.01 \* 0.09) = 0.00 (rounds down)
  sgst = 0.00
  total = 0.01 (taxable only)

TEST SUITE 6 — Validation errors:

- Empty lines → EMPTY_LINES
- Negative quantity → NEGATIVE_QUANTITY
- Negative unit price → NEGATIVE_UNIT_PRICE
- Invalid GST rate (e.g., 10, 15, 100) → INVALID_GST_RATE
- Negative discount → NEGATIVE_DISCOUNT
- Discount percent > 100 → DISCOUNT_PERCENT_OUT_OF_RANGE
- Discount amount > subtotal → DISCOUNT_EXCEEDS_SUBTOTAL
- Empty tenant state → EMPTY_STATE
- Empty place of supply → EMPTY_STATE

TEST SUITE 7 — State comparison edge cases (DEV.33 awareness):

- States with full names: "Maharashtra" vs "Karnataka" → inter-state
- Same state, different case: "Maharashtra" vs "maharashtra" → INTER-STATE (engine does exact match — log this as DEV.34 if it surfaces problems)
- States with trailing whitespace: trimmed before comparison
- Identical states → intra-state regardless of format

TEST SUITE 8 — Real-world distributor scenarios:

- 5 panels @ ₹15,000 @ 18% intra-state, no discount: ₹88,500 total
- 100 panels @ ₹14,800 @ 18% inter-state, ₹50,000 discount:
  subtotal=1,480,000, discount=50,000, taxable=1,430,000, igst=257,400, total=1,687,400
- Mixed quote: 50 panels @ ₹15,000 (18%) + 50 mounting clamps @ ₹100 (12%) + installation service @ ₹25,000 (0%) intra-state with 5% discount:
  Verify per-line discount allocation, mixed-rate aggregation, total

TEST SUITE 9 — Output structure invariants:

- For every output: lines.length === input.lines.length
- For every output: sum of line.lineSubtotal === subtotal
- For every output: subtotal - discountAmount === taxableAmount (exact)
- For every output: cgstAmount + sgstAmount + igstAmount === sum of line tax totals
- For every output: if isInterState, cgstAmount === 0 and sgstAmount === 0
- For every output: if !isInterState, igstAmount === 0
- For every output: totalAmount === taxableAmount + cgst + sgst + igst (exact)

A3.2. Target: 50+ tests minimum. Use Decimal-aware assertions (e.g., `expect(output.totalAmount.toString()).toBe('1770000')` — strings avoid float comparison pitfalls).

A3.3. Run `pnpm --filter @dealerlink/tax test`. ALL tests must pass before continuing.

COMMIT 9c: `feat(tax): chunk c — comprehensive test suite (50+ cases)`

## CHUNK 9d — Integration: swap preview + persistence to use the engine

A4.1. Refactor apps/web/lib/quotation/preview.ts:

- Import computeTax from packages/tax (add @dealerlink/tax as a workspace dependency in apps/web/package.json if not already)
- The previewTax function becomes a thin adapter that:
  - Maps the existing input shape to the new TaxComputationInput shape (mostly a rename)
  - Calls computeTax
  - Maps the Decimal output to number (for the UI's live preview — UI doesn't need Decimal precision)
- Behavior MUST be byte-identical to the prior preview for all the existing seed data
- The existing preview.test.ts should still pass without modification (this is the parity proof)

A4.2. Refactor apps/web/lib/actions/quotations/helpers.ts::computeTotalsForPersistence:

- Same pattern: thin adapter that calls computeTax
- Output mapped to strings (for direct insertion into NUMERIC columns)
- Use Decimal's .toFixed(2) to produce strings like '1770000.00' for DB inserts
- The Server Action's existing call sites do NOT need to change — the function signature stays the same

A4.3. CRITICAL VERIFICATION — Parity with Day 8's data:
For every seeded QT- quotation, re-run computeTax with its line inputs and assert the result matches the stored header totals (subtotal, taxableAmount, cgst/sgst/igst, total).
Write this as packages/db/tests/quotation-engine-parity.test.ts:

```typescript
test('Day 9 engine produces same totals as Day 8 stored values for all seeded quotations', async () => {
  const quotations = await db
    .select()
    .from(quotationsTable)
    .where(like(quotationsTable.quoteNumber, 'QT-%'));
  for (const q of quotations) {
    const lines = await db
      .select()
      .from(quotationLines)
      .where(eq(quotationLines.quotationId, q.id));
    const result = computeTax({
      tenantState: q.tenantStateAtIssue,
      placeOfSupply: q.placeOfSupply,
      lines: lines.map((l) => ({
        lineId: l.id,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        gstRate: Number(l.gstRate),
      })),
      discount: q.discountType ? { type: q.discountType, value: q.discountValue } : null,
    });
    expect(result.subtotal.toFixed(2)).toBe(q.subtotal);
    expect(result.discountAmount.toFixed(2)).toBe(q.discountAmount);
    expect(result.taxableAmount.toFixed(2)).toBe(q.taxableAmount);
    expect(result.cgstAmount.toFixed(2)).toBe(q.cgstAmount);
    expect(result.sgstAmount.toFixed(2)).toBe(q.sgstAmount);
    expect(result.igstAmount.toFixed(2)).toBe(q.igstAmount);
    expect(result.totalAmount.toFixed(2)).toBe(q.totalAmount);
  }
});
```

This test MUST pass. If even one quotation produces different numbers:

- That's a sign of a behavior difference between Day 8's preview and Day 9's engine
- STOP and investigate: which is correct? (Day 9's engine is the new source of truth; Day 8's preview may have had a subtle bug)
- If Day 9 differs in a defensibly-correct way (e.g., better rounding), document as DEV.35 and update the stored values via a one-time recompute migration
- If Day 9 differs incorrectly, fix the engine

A4.4. Run all quality gates:

- pnpm typecheck — green
- pnpm lint — green
- pnpm test — all unit + integration tests including the new parity test green
- pnpm verify — 21/21 still passing
- pnpm build — green

A4.5. Closeout:

- PROJECT_PLAN.md: mark B.9 ✅ with date and notes
- DEVIATIONS.md: append any Day 9 deviations (likely DEV.34 for case-sensitivity if surfaced, possibly DEV.35 for engine parity)
- Final commit: `feat(tax): day 9 complete — authoritative GST engine with line-level rounding`
- Push

COMMIT 9d: as above

==========================================================
GUARDRAILS (DAY 9 SPECIFIC — MOST IMPORTANT)
==========================================================

- NEVER use JavaScript native floats for tax math. Decimal.js or BigInt only.
- Line-level rounding is the standard Indian invoicing convention. If CLAUDE.md §6 specifies otherwise, follow §6 — but be explicit in code comments about which choice was made and why.
- The engine is a PURE FUNCTION. No I/O, no DB calls, no framework imports. Just input → output.
- packages/tax depends ONLY on decimal.js. No drizzle, no react, no next, no @dealerlink/\* — it's reusable beyond this app.
- All money output values are Decimal in the internal API. The boundary adapters convert to string (for DB) or number (for UI).
- State comparison is opaque string compare per DEV.33. The engine does NOT know about "MH" vs "Maharashtra" — it just trusts the caller passed consistent values.
- The parity test (A4.3) is the proof point. If it fails, the day is not done.
- DO NOT MODIFY Day 8's stored quotation totals unless A4.3 surfaces a genuine pre-existing bug. Document any such case as DEV.35 with clear before/after numbers.
- Edge cases that MUST be tested: zero quantity (rejected), zero subtotal (zero discount ratio, no DIV/0), 100% discount (taxable=0, taxes=0), penny-level amounts, fractional paise via 18% on odd amounts.

WHEN DONE:

- Print summary: 4 chunk commits, total test count (50+ new in packages/tax), parity test result, pnpm verify 21/21
- Confirm Day 8 quotations all match Day 9 engine output exactly
- Confirm the preview helper and persistence path are both wired to the canonical engine
- Tell me: "Day 9 complete. Engine swap successful. Day 10 (PDF pipeline) is next."

```

### Verification checklist for you (after Claude Code finishes)

#### Engine correctness (most important)
- [ ] All 50+ tests in `packages/tax/tests/compute.test.ts` pass
- [ ] Parity test in `packages/db/tests/quotation-engine-parity.test.ts` passes — every seeded quotation produces identical totals via the new engine
- [ ] `pnpm test` overall green
- [ ] Pick one quotation and manually verify with a calculator (e.g., QT-2026-0001: 100 × 10400 × 1.18 should equal stored total for intra-state, or 1 + IGST for inter-state)

#### Integration
- [ ] `apps/web/lib/quotation/preview.ts` now imports from `@dealerlink/tax`
- [ ] `apps/web/lib/actions/quotations/helpers.ts` now imports from `@dealerlink/tax`
- [ ] Builder UI still works — open `/quotations/new`, add lines, see live preview update correctly
- [ ] Save a new quotation — DB stores totals matching the preview (within rounding)
- [ ] `pnpm verify` still 21/21

#### Engine purity
- [ ] `packages/tax/package.json` has only `decimal.js` as a runtime dependency
- [ ] No imports from drizzle, next, react, or `@dealerlink/*` in `packages/tax/src/`
- [ ] Engine can be imported and called from a standalone Node script (smoke test in your head: would it work outside this monorepo?)

#### Day 10 readiness
- [ ] PDF generation (Day 10) will read computed totals from quotations table — these are now engine-produced
- [ ] If parity test required updates to stored values, all old quotations have been refreshed
- [ ] DEV log clean: any new deviations explained and tracked

### Update PROJECT_PLAN.md after Day 9

Mark **B.9** as ✅, today's date, append to changelog. Day 9 is the most important checkbox in the entire build.

---

## Day 10 — PDF Pipeline (Puppeteer Worker + Templates)

**Goal:** Ship the PDF generation pipeline. By end of day, sales users can generate professional quotation PDFs with tenant branding, line items, GST breakdown, T&Cs, and bank details. The infrastructure handles invoices, dispatch notes, and payment receipts in later days.

**Estimated time:** 5–6 hours of Claude Code work + ~45 min of your verification (including reviewing actual PDF output)

**Deliverable:** Working "Download PDF" and "Email PDF" actions on quotations. Puppeteer runs in `apps/workers/` (isolated process per locked decision). Generated PDFs match the prototype design. Template architecture supports invoices/dispatch/receipts on later days.

### Prompt for Claude Code

```

You are implementing Day 10 of the Dealerlink build. Day 9 shipped successfully (commit 4061f0d) — authoritative GST tax engine. Day 10 builds on Day 9 by generating PDFs that show those computed taxes.

PRELIMINARY (every day must do this):
P.1. Run `pnpm preflight` and confirm 9 green checks.
P.2. Read CLAUDE.md §3 (stack — Puppeteer in workers per locked decision), §6 (GST/three-party — invoice PDF later but pattern starts today), §10 (auth — PDF actions are tenant-scoped).
P.3. Read docs/PDF_PIPELINE.md — the design contract for this module.
P.4. Read DECISIONS.md ADR-007 (branding spec) — 1 MB max, PNG/SVG/JPG, 400×120 px recommendation.
P.5. Read DEVIATIONS.md DEV.15 (base64 logo fallback — still active since DO Spaces deferred to Stage D).
P.6. Read apps/workers/ structure — pg-boss worker scaffold exists from Day 6/8 stubs; today fleshes it out for PDF jobs.

PRIMARY REFERENCES:

1. docs/PDF_PIPELINE.md — the contract
2. CLAUDE.md §3 (stack), §6 (multi-party doc logic)
3. docs/Distribyte.html and docs/Distribyte-print.html — the print stylesheet from the prototype is the visual target
4. docs/3 PO Premier.pdf — real-world reference PDF for layout cues (page size, structure, density)
5. ADR-007 — branding constraints
6. Day 9's @dealerlink/tax — engine that computes the numbers the PDF displays

==========================================================
TRACK A — PDF PIPELINE (CHUNKED — 4 chunks)
==========================================================

## CHUNK 10a — Worker scaffold + Puppeteer setup

A1.1. Audit apps/workers/ — confirm package.json, tsconfig, existing pg-boss scaffold.

A1.2. Add Puppeteer to apps/workers/package.json:

```
"dependencies": {
  "puppeteer-core": "^22.x",
  "@sparticuz/chromium": "^131.x"
}
```

Rationale: puppeteer-core (no bundled Chromium) + @sparticuz/chromium (slim Chromium for production servers). In dev, fall back to a system Chromium if @sparticuz fails to load.

A1.3. Create apps/workers/src/pdf/browser.ts:

- Lazy-initialized singleton browser instance (one Chromium process, shared across jobs)
- Auto-restart if browser crashes (track lastUsed; if >10 min idle, close and re-launch on next request)
- Memory cap awareness: track number of pages opened; force a browser restart every 100 pages to mitigate Puppeteer memory drift (known issue)
- Pages closed cleanly after each render (try/finally)
- Headless mode, no sandbox flags appropriate for Linux containers in Stage D

A1.4. Create apps/workers/src/pdf/render.ts — pure rendering function:

```typescript
export async function renderPdfFromHtml(html: string, opts: PdfOptions): Promise<Buffer> {
  // Open page, setContent, waitForLoadState, page.pdf({format: 'A4', margin: ...}), close page
  // Return Buffer
}
```

Options: page size (default A4), margins (default 18mm), printBackground=true, displayHeaderFooter=false (we build header/footer into the HTML)

A1.5. Add a pg-boss job type 'render-pdf':

- Input: { documentType: 'quotation' | 'invoice' | 'dispatch' | 'payment_receipt', documentId: string, tenantId: string }
- Worker reads document, renders HTML, calls renderPdfFromHtml, stores result
- For Day 10: only 'quotation' is implemented; others throw "not implemented yet"

A1.6. Storage strategy for generated PDFs:

- Phase 1 (today): write to DO Spaces if configured, else base64 in a new generated_documents table (per CLAUDE.md and DEV.15 fallback pattern)
- Create packages/db/src/schema/generated_documents.ts:
  - id, tenantId, documentType, documentId (FK varies by type — store as text), filename, mimeType, sizeBytes, storage ('spaces' | 'inline'), storageRef (URL or base64 data), generatedAt, generatedBy, expiresAt (nullable)
  - RLS, audit trigger
- Cleanup: rows older than 30 days with storage='inline' get pruned by a daily cron job (Day 14 wires this; Day 10 just creates the schema)

A1.7. Generate migration. Verify pnpm typecheck green.

A1.8. Add a simple smoke test in apps/workers/tests/render.test.ts:

- Render a trivial HTML ('<h1>test</h1>') to PDF
- Assert output is a non-empty Buffer starting with '%PDF-'
- Skip if no system Chromium available (dev environment fallback)

COMMIT 10a: `feat(pdf): chunk a — puppeteer worker scaffold + storage schema`

## CHUNK 10b — Quotation template (the design)

A2.1. Create apps/workers/src/templates/quotation.tsx (or quotation.html.ts if not using React for templates — pick one and document):

DECISION: Use React-on-the-server template rendering for two reasons:

- Type safety on template inputs
- Component reuse for shared sub-templates (header, footer, line-items-table)
  Alternative: handlebars-style string templates. Less typesafe. Skip.

Set up:

- apps/workers/src/templates/quotation.tsx (renders quotation HTML)
- apps/workers/src/templates/\_components/Header.tsx (tenant branding)
- apps/workers/src/templates/\_components/Footer.tsx (T&Cs, bank, page number)
- apps/workers/src/templates/\_components/LineItemsTable.tsx (with GST breakdown)
- apps/workers/src/templates/\_components/TaxSummary.tsx (CGST/SGST/IGST breakdown)
- apps/workers/src/templates/\_components/PartyBlock.tsx (Bill-To / Ship-To dealer info — handles three-party scenarios per CLAUDE.md §6)
- apps/workers/src/templates/styles.ts (inline CSS for print — print stylesheet from Distribyte-print.html)

A2.2. Quotation template structure (matches docs/Distribyte-print.html, docs/3 PO Premier.pdf as visual reference):

PAGE LAYOUT (A4 portrait):

- Header band (60mm):
  - Tenant logo (left) — from tenant_settings.logoUrl (base64 inline or Spaces URL)
  - Tenant legal name + address + GSTIN + PAN (left below logo)
  - Document title "QUOTATION" (right, large)
  - Quote number + revision + date + valid until (right, monospaced)
- Bill-To block (40mm):
  - "Bill To:" label
  - Dealer legal name, address, GSTIN, contact person
- Line items table (variable height, wraps to multiple pages):
  - Columns: S.No, Description (SKU + name + HSN), Qty, Unit Price, Discount (if line-level — N/A for Phase 1, but column placeholder), Taxable Value, GST Rate, GST Amount, Total
  - Each row uses IBM Plex Mono for numbers (consistent with on-screen design)
  - Total row at the bottom of each page repeats column headers
- Tax summary block (40mm):
  - Subtotal
  - Discount (if any) with type indicator (e.g., "Discount @ 5%")
  - Taxable Amount
  - Either: CGST @ X% + SGST @ X% (intra-state) OR IGST @ X% (inter-state)
  - Grand Total (large, bold)
  - Amount in words (e.g., "Rupees One Lakh Twenty Seven Thousand Two Hundred Only")
- Terms & Conditions (variable, end of document):
  - From quotation.termsAndConditions if set, else tenant_settings.defaultTermsAndConditions
- Bank details footer (last page only):
  - Bank account name, account number, IFSC, branch (from tenant_settings.bank\*)
- Footer band on every page:
  - "Page X of Y" right-aligned
  - "Quotation QT-2026-NNNN · Generated DD-MMM-YYYY HH:MM IST" left-aligned

A2.3. CRITICAL: Three-party support stub:

- The quotation today has ONE dealer (Bill-To = Ship-To)
- But the template should accept optional separate billTo and shipTo dealer references
- Per CLAUDE.md §6, invoices (Day 11) will use this; quotation only renders Bill-To with a note that Ship-To = Bill-To for quotations
- This makes Day 11's invoice template a small extension, not a rewrite

A2.4. Numbers display:

- All currency in IBM Plex Mono, tabular figures
- Amounts: 2 decimal places, comma-thousands in Indian format (1,27,200.00 NOT 127,200.00 — uses Intl.NumberFormat with en-IN locale)
- GST rates: "18%" (whole number when possible)

A2.5. Amount-in-words helper:

- Create apps/workers/src/lib/amount-in-words.ts
- Converts a number (or Decimal string) to Indian-format words ("One Lakh Twenty Seven Thousand Two Hundred Rupees Only")
- Handles lakhs and crores (NOT thousands and millions — Indian numbering)
- Unit test: 10 cases covering edge cases (0, 1, 99, 100, 1000, 99999, 100000=1 Lakh, 9999999=99 Lakhs, 10000000=1 Crore, decimals like 127200.50)

A2.6. Render the quotation template to a static HTML string given a quotation + tenant + dealer payload. Output is a complete <html>...</html> with inline styles. NO external CSS files — Puppeteer needs everything inline for reliable rendering.

A2.7. Smoke test:

- Feed a fixture quotation (with realistic data: 2 lines, 18% GST, inter-state) into the template renderer
- Assert HTML output contains expected strings (quote number, dealer name, GSTIN, IGST amount, total in words)
- This is a HTML-level test, not a PDF-level test

COMMIT 10b: `feat(pdf): chunk b — quotation template with tenant branding`

## CHUNK 10c — Server actions: generate, download, email-attached

A3.1. Create apps/web/lib/actions/quotations/generate-pdf.ts:

- Action: generateQuotationPdf(quotationId) using tenantAction(['admin', 'sales'])
- Flow:
  1.  Load quotation + lines + dealer + tenant settings (single query)
  2.  Build the template payload
  3.  Enqueue a pg-boss 'render-pdf' job with the payload (passed by reference: just the IDs; worker re-loads to avoid stale data)
  4.  Worker renders HTML, calls renderPdfFromHtml, stores result in generated_documents
  5.  Return { documentId } so the client can poll OR — if synchronous mode is fine for Day 10 — just await the job and return the storage ref directly
- For Day 10 simplicity: SYNCHRONOUS within the request (await pg-boss completion). Async polling pattern adds complexity not needed yet. Document as DEV.36 if questioned.

A3.2. Create apps/web/lib/actions/quotations/download-pdf.ts:

- Action: downloadQuotationPdf(quotationId) using tenantAction(['admin', 'sales', 'accounts'])
- Loads the latest generated PDF for this quotation (most recent generated_documents row)
- If none exists, calls generateQuotationPdf first
- Returns a stream or base64 payload to the client for download
- Records to access_log: action='download', entity_type='quotation', entity_id=quotationId

A3.3. Update the quotation detail page (app/(app)/quotations/[id]/page.tsx):

- Add "Download PDF" button (visible to admin + sales + accounts)
- Add "Regenerate PDF" button if a generated_documents row exists (admin only — for after edits)
- Show "Last generated: DD-MMM HH:MM" if applicable
- Add "Email PDF" button — opens modal asking for recipient (default = dealer.email) + subject + body; on confirm, attaches PDF to email and sends via Resend
  - Day 10 just LOGS the email request to email_delivery_log; actual send hooks up in Day 14
  - The PDF generation happens regardless

A3.4. Connect the existing "Save and Send" flow from Day 8:

- When a quotation transitions draft → sent, auto-generate the PDF (call generateQuotationPdf)
- Email body references the PDF (when Day 14 wires the actual send)

A3.5. Verify pnpm typecheck + test green.

COMMIT 10c: `feat(pdf): chunk c — generate/download/email actions wired up`

## CHUNK 10d — Tests, real PDF verification, closeout

A4.1. Tests:

- apps/workers/tests/quotation-template.test.ts — HTML output assertions for various quotation shapes:
  - Single-line intra-state
  - Multi-line inter-state with discount
  - With and without revision badge
  - With and without tenant logo (test base64 fallback)
  - With and without bank details
- apps/workers/tests/amount-in-words.test.ts — 10 cases minimum
- apps/web/tests/e2e/verify-day-10.spec.ts (Playwright):
  - Login, open a quotation, click Download PDF, verify response is a PDF (mime type + magic bytes %PDF-)
  - Open the same quotation again, verify the cached PDF returns quickly (no regeneration)
  - Click Regenerate PDF (admin), verify a new generated_documents row created with different generated_at

A4.2. REAL PDF QUALITY CHECK (manual, do this YOURSELF before declaring the day done):

- Generate a PDF for one seeded quotation
- Open the PDF in Adobe Reader or browser PDF viewer
- Verify:
  - Logo renders correctly (or fallback "TENANT NAME" placeholder if no logo)
  - All numbers use mono font with tabular alignment
  - GST breakdown shows the right type (CGST/SGST OR IGST, never both)
  - Amount in words matches the grand total
  - T&Cs and bank details appear on the last page
  - Page numbers correct on multi-page quotes (force a 30-line test quotation if needed to test pagination)
- Save a sample PDF to docs/samples/quotation-sample.pdf for future reference

A4.3. Documentation:

- Update docs/PDF_PIPELINE.md with the implemented architecture (template files, worker flow, storage strategy)
- Add to docs/RUNBOOKS.md: "Re-generating a quotation PDF after edits"
- Add to DEVIATIONS.md any deviations encountered (likely DEV.36 for synchronous PDF generation, possibly DEV.37 for any template quirks)

A4.4. Closeout per docs/BUILD_PROMPT_TEMPLATE.md:

- pnpm preflight — green
- pnpm verify — 22/22 (21 prior + verify-day-10)
- pnpm typecheck, pnpm lint, pnpm test, pnpm build — all green
- PROJECT_PLAN.md B.10 marked ✅
- Final commit: `feat(pdf): day 10 complete — puppeteer pipeline + quotation template`
- Push

COMMIT 10d: as above

==========================================================
GUARDRAILS (DAY 10 SPECIFIC)
==========================================================

- Puppeteer runs ONLY in apps/workers/. Never import puppeteer-core from apps/web/ — that would bring 200MB of binary into the web bundle.
- Generated PDFs are stored as immutable artifacts (one row per render). If a user edits the quotation and regenerates, NEW row is created; old row stays for audit. The download endpoint serves the LATEST.
- Template inputs are typed — no `any` in template props.
- Numbers in PDFs use Indian format (1,27,200.00). Use Intl.NumberFormat('en-IN'), not generic comma-thousands.
- Amount in words uses Indian numbering (Lakhs, Crores). NOT international (Thousands, Millions).
- The template MUST work without a logo (base64 fallback per DEV.15). Test the fallback explicitly.
- Three-party stub: template accepts billTo + shipTo. For quotations, shipTo defaults to billTo with a "Ship-To same as Bill-To" line. Invoice (Day 11) overrides this.
- Storage: base64 inline in dev, DO Spaces in production. Day 10's storage code uses an abstraction so Stage D's DO Spaces wiring is a config change, not a refactor.
- Memory: Puppeteer browser restarts every 100 pages. Confirm this via comment in browser.ts.

WHEN DONE:

- Print summary
- 4 chunk commits
- Confirm a real PDF was generated and visually verified for one seeded quotation
- Sample PDF saved to docs/samples/
- pnpm verify shows 22/22
- Tell me Day 10 is complete and Day 11 (PI/Order creation) is next

```

### Verification checklist for you (after Claude Code finishes)

#### Generated PDF quality (do this yourself — 15 minutes)
- [ ] Open `/quotations/[any-seeded-id]` as admin
- [ ] Click "Download PDF" — file downloads, opens in PDF viewer
- [ ] **Read the entire PDF carefully**:
  - Logo or "TENANT NAME" placeholder rendered correctly
  - Quote number, date, valid until shown
  - Dealer info (legal name, address, GSTIN) correct
  - Each line item shows: SKU, name, HSN, quantity, unit price, line total
  - Numbers in mono font, tabular aligned
  - Tax summary shows CGST+SGST (intra-state) OR IGST (inter-state) — never both
  - Grand total matches what the quotation detail page shows
  - Amount in words matches the grand total
  - T&Cs section populated
  - Bank details on the last page
  - Page numbers correct
- [ ] Open a multi-line inter-state quotation — verify IGST appears, CGST+SGST don't
- [ ] Open one with a discount — verify discount line shows in tax summary
- [ ] Save one sample PDF to share for future reference

#### Architecture
- [ ] Puppeteer is in `apps/workers/`, not `apps/web/`
- [ ] `apps/web/package.json` does NOT depend on `puppeteer-core` or `@sparticuz/chromium`
- [ ] Generated documents table has rows for every PDF you generated
- [ ] Re-clicking Download (without regenerate) reuses the cached PDF (fast response)

#### Automated
- [ ] `pnpm preflight` — green
- [ ] `pnpm verify` — 22/22
- [ ] All quality gates green
- [ ] B.10 marked ✅ in PROJECT_PLAN.md
- [ ] DEV log updated if any deviations

#### Day 11 readiness
- [ ] Template architecture supports invoice extension (three-party billTo/shipTo handles invoice case)
- [ ] PDF storage abstraction in place (Stage D will swap to DO Spaces)
- [ ] Worker flow established (pg-boss job → Puppeteer → storage)

### Update PROJECT_PLAN.md after Day 10

Mark **B.10** as ✅, today's date, append to changelog.

---

## Day 11 — Performa Invoice + Order Creation

**Goal:** Ship the PI (Performa Invoice) and Order modules. By end of day, an accepted quotation converts to a PI for buyer confirmation, then to an Order once the buyer confirms. The Order creates inventory reservations and advances the deal pipeline. PI gets its own PDF with full three-party support.

**Estimated time:** 5–6 hours + ~45 min verification

**Deliverable:** Working `/quotations/[id]/convert-to-pi` flow, `/pi/*` and `/orders/*` modules with list, detail, status transitions, PDF generation. Inventory automatically reserves on order confirmation.

### Prompt for Claude Code

```

You are implementing Day 11 of the Dealerlink build. Day 10 shipped successfully (commit fc6fbed) — PDF pipeline with quotation template. Day 11 reuses that template architecture for invoices and adds the cross-module choreography (deal advancement + inventory reservation + PDF generation).

PRELIMINARY:
P.1. Run `pnpm preflight` — confirm 9 green.
P.2. Read CLAUDE.md §6 (three-party document logic) and §11 (auth/roles).
P.3. Read docs/WORKFLOWS.md — the deal pipeline transitions (verbal_commit → po_pending → payment_pending).
P.4. Read DEVIATIONS.md — note DEV.36 (sync PDF generation), DEV.38 (cross-tenant seed fix), R.13 (email dispatch must move to pg-boss Day 14).
P.5. Read apps/workers/src/templates/\_components/ — these are Day 10's shared template parts. Today extends them for invoices.
P.6. Read packages/db/src/deals/transitions.ts and packages/db/src/inventory/transitions.ts — Day 11 calls both.

PRIMARY REFERENCES:

1. CLAUDE.md §6 (three-party) — Bill-To = who pays, Ship-To = where goods go. PI/Order/Invoice can have different combinations.
2. BRD §5 (PI/Order requirements + workflow)
3. docs/Distribyte.html — PI/Order screens reference
4. docs/3 PO Premier.pdf — real reference document
5. Day 10 quotation template — invoice template extends this
6. Day 9 @dealerlink/tax — engine recomputes taxes on PI/Order (they reuse quotation totals but support different ship-to states which may change inter-state determination)

==========================================================
TRACK A — PI + ORDER (CHUNKED — 5 chunks)
==========================================================

## CHUNK 11a — Schemas + state machines

A1.1. Create packages/db/src/schema/performa_invoice.ts (PI = Performa Invoice):

```typescript
export const performaInvoices = pgTable('performa_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),

  piNumber: text('pi_number').notNull(), // e.g., PI-2026-0001

  // Source quotation (required — PIs always come from accepted quotations in Phase 1)
  quotationId: uuid('quotation_id').notNull(),

  // Deal link (denormalized for fast queries; copied from quotation)
  dealId: uuid('deal_id'),

  // Bill-To and Ship-To dealers (may differ — three-party scenario)
  billToDealerId: uuid('bill_to_dealer_id').notNull(),
  shipToDealerId: uuid('ship_to_dealer_id').notNull(), // defaults to billTo on creation

  // Captured at issue (point-in-time)
  tenantStateAtIssue: text('tenant_state_at_issue').notNull(),
  placeOfSupply: text('place_of_supply').notNull(), // recomputed from ship-to if different from quote

  preparedBy: uuid('prepared_by').notNull(),

  // Commercial (snapshot from quotation; can deviate slightly e.g. validity period change)
  piDate: date('pi_date').notNull().defaultNow(),
  validUntil: date('valid_until').notNull(),
  currency: text('currency').notNull().default('INR'),

  // Discount (snapshot from quotation, allowed to adjust)
  discountType: text('discount_type'),
  discountValue: numeric('discount_value', { precision: 12, scale: 2 }),

  // Computed totals (server-side via @dealerlink/tax, never trust client)
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  taxableAmount: numeric('taxable_amount', { precision: 14, scale: 2 }).notNull(),
  cgstAmount: numeric('cgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  igstAmount: numeric('igst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),

  termsAndConditions: text('terms_and_conditions'),
  notes: text('notes'),

  // Status: 'draft' | 'sent' | 'confirmed' (buyer agreed) | 'cancelled'
  // Confirmed PIs are immutable and trigger Order creation
  status: text('status').notNull().default('draft'),
  sentAt: timestamp('sent_at'),
  confirmedAt: timestamp('confirmed_at'),
  cancelledAt: timestamp('cancelled_at'),
  cancelledReason: text('cancelled_reason'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').notNull(),
});

export const performaInvoiceLines = pgTable('performa_invoice_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  performaInvoiceId: uuid('performa_invoice_id').notNull(),
  lineNumber: integer('line_number').notNull(),
  productId: uuid('product_id').notNull(),
  productSku: text('product_sku').notNull(),
  productName: text('product_name').notNull(),
  hsnCode: text('hsn_code').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitOfMeasure: text('unit_of_measure').notNull().default('Nos'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
  description: text('description'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

A1.2. Create packages/db/src/schema/order.ts:

```typescript
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),

  orderNumber: text('order_number').notNull(), // e.g., ORD-2026-0001

  // Source PI (Phase 1: every order comes from a confirmed PI)
  performaInvoiceId: uuid('performa_invoice_id').notNull(),
  quotationId: uuid('quotation_id').notNull(), // denormalized
  dealId: uuid('deal_id'),

  // Bill-To + Ship-To (copied from PI; cannot change once order is placed)
  billToDealerId: uuid('bill_to_dealer_id').notNull(),
  shipToDealerId: uuid('ship_to_dealer_id').notNull(),

  tenantStateAtIssue: text('tenant_state_at_issue').notNull(),
  placeOfSupply: text('place_of_supply').notNull(),

  // Commercial
  orderDate: date('order_date').notNull().defaultNow(),
  expectedDispatchDate: date('expected_dispatch_date'),
  currency: text('currency').notNull().default('INR'),

  // Snapshot of totals from PI
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  taxableAmount: numeric('taxable_amount', { precision: 14, scale: 2 }).notNull(),
  cgstAmount: numeric('cgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  sgstAmount: numeric('sgst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  igstAmount: numeric('igst_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),

  // Status state machine:
  // 'pending' → 'confirmed' → 'partially_dispatched' → 'fully_dispatched' → 'delivered' → 'closed'
  // Or: any → 'cancelled' (admin only, with reason)
  status: text('status').notNull().default('pending'),
  confirmedAt: timestamp('confirmed_at'),
  cancelledAt: timestamp('cancelled_at'),
  cancelledReason: text('cancelled_reason'),

  // Payment status (separate dimension)
  paymentStatus: text('payment_status').notNull().default('unpaid'),
  // 'unpaid' | 'partially_paid' | 'paid'

  notes: text('notes'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').notNull(),
});

export const orderLines = pgTable('order_lines', {
  // Same shape as performaInvoiceLines, plus:
  // reservedQuantity: numeric('reserved_quantity', { precision: 12, scale: 3 }).default('0')
  // dispatchedQuantity: numeric('dispatched_quantity', { precision: 12, scale: 3 }).default('0')
  // [other fields like in PI lines]
});
```

A1.3. Constraints:

- pi_number, order_number: UNIQUE (tenant_id, X_number)
- status CHECKs for both tables matching the enum sets above
- payment_status CHECK
- Both tables have RLS, audit triggers
- document_counters entries for 'performa_invoice' (PI) and 'order'

A1.4. Create packages/db/src/pi/transitions.ts and packages/db/src/orders/transitions.ts following the Day 7/8 transition module pattern. Define allowed transitions explicitly.

A1.5. Generate migration. Verify pnpm typecheck green.

A1.6. Create packages/schemas/src/performa-invoice.ts and packages/schemas/src/order.ts with Zod schemas for create/update inputs.

COMMIT 11a: `feat(orders): chunk a — PI + order schemas + state machines`

## CHUNK 11b — Server actions: convert + lifecycle

A2.1. apps/web/lib/actions/pi/ (using tenantAction()):

- convertQuotationToPi (admin + sales) — creates a draft PI from an accepted quotation; copies lines, dealer, discount; recomputes totals via @dealerlink/tax with shipTo state if user changed it; default shipTo = billTo
- updatePi (admin + prepared_by sales, only when status='draft') — line edits allowed
- sendPi (admin + sales) — transitions draft → sent; queues PDF generation; logs email
- confirmPi (admin + sales) — transitions sent → confirmed; CREATES THE ORDER ATOMICALLY (single transaction); advances deal stage from po_pending → payment_pending
- cancelPi (admin only) — captures reason

A2.2. apps/web/lib/actions/orders/ (using tenantAction()):

- confirmOrder (admin + sales) — transitions pending → confirmed; CREATES INVENTORY RESERVATIONS using Day 6's inventory transitions module; if insufficient inventory, returns specific error with which products are short
- updateOrderExpectedDispatch (admin + dispatch)
- cancelOrder (admin only) — releases any inventory reservations back to in_stock; captures reason; advances deal stage backwards or to lost

A2.3. CRITICAL: The PI confirmation flow is the most complex action in the build so far. It does:

1.  Validates PI is in 'sent' status
2.  In a single transaction:
    a. Update PI: status='confirmed', confirmedAt=now
    b. Insert orders row with status='pending'
    c. Insert order_lines rows from PI lines (1:1)
    d. Transition deal stage po_pending → payment_pending via deals/transitions.ts
    e. Write audit log entries for each step
3.  Returns the new orderId

A2.4. Inventory reservation in confirmOrder:

- For each order line, find inventory_items with status='in_stock' and product_id matching, ORDER BY procurement_date ASC, LIMIT to requested quantity
- SELECT ... FOR UPDATE on those rows
- For each: call inventory transitions.ts reserveForOrder(itemId, orderId, dealerId)
- Atomic: if not enough in_stock, rollback the entire transaction with InsufficientInventoryError listing the short products + how many short
- Update order_lines.reservedQuantity accordingly

A2.5. Verify tests pass.

COMMIT 11b: `feat(orders): chunk b — server actions (convert, confirm, reserve inventory)`

## CHUNK 11c — UI: PI module

A3.1. PI list (app/(app)/pi/page.tsx):

- Dense table, columns: PI number, date, dealer, total, status pill, prepared by, deal link
- Filters: status, dealer, date range
- Empty state with CTA to convert a quotation

A3.2. PI detail (app/(app)/pi/[id]/page.tsx):

- Same inline-edit pattern as quotations
- Hero: PI number, status pill, action menu (per status: Draft → Edit/Send/Cancel; Sent → Confirm/Cancel; Confirmed → View order, View invoice link Day 13; Cancelled → final)
- Sections: identity, parties (Bill-To, Ship-To — if same, show one block with "Ship-To same as Bill-To"; if different, show both), commercial, line items, tax summary, T&Cs

A3.3. Convert-from-quotation flow (app/(app)/quotations/[id]/convert-to-pi/page.tsx):

- Loads quotation, prefills a PI draft
- User can change Ship-To dealer (typeahead from dealers; defaults to quotation dealer)
- When Ship-To changes to a different state, the tax recomputes (might switch from IGST to CGST/SGST or vice versa) — this is a visual confirmation moment per CLAUDE.md §6
- User can adjust validity period
- Submit creates draft PI; redirect to PI detail

A3.4. PI PDF: reuse the Day 10 quotation template. Override the document title to "PERFORMA INVOICE" and pass both billTo and shipTo (the template already accepts them). Generate via the workers subprocess pattern from Day 10.

COMMIT 11c: `feat(orders): chunk c — PI list, detail, convert flow, PDF`

## CHUNK 11d — UI: Order module

A4.1. Order list (app/(app)/orders/page.tsx):

- Columns: order number, date, dealer (Bill-To), total, fulfillment status pill, payment status pill, expected dispatch date
- Two status dimensions visible: order status (pending/confirmed/dispatching/delivered/closed) + payment status (unpaid/partial/paid)

A4.2. Order detail (app/(app)/orders/[id]/page.tsx):

- Hero: order number, both status pills, action menu
- Tabs:
  - Overview: header info, parties, totals
  - Line items: shows ordered qty, reserved qty (live, with checkbox/eyeglass to see which serials), dispatched qty (placeholder for Day 13)
  - Inventory reservations: list of inventory_items currently reserved for this order (joins with serials)
  - Status history
  - Activity (audit + access log)

A4.3. Confirm order modal:

- Shows expected reservation: "Will reserve N panels of SKU X, M panels of SKU Y..."
- If inventory available: enable Confirm button
- If short: show specific shortage details + "Cannot confirm — N panels short of X"

COMMIT 11d: `feat(orders): chunk d — order list, detail, confirm flow with reservation`

## CHUNK 11e — Seed, tests, closeout

A5.1. Seed:

- 10 PIs per tenant (mix of statuses: 3 draft, 4 sent, 2 confirmed, 1 cancelled)
- For confirmed PIs: corresponding Order rows + inventory reservations on existing seeded inventory
- Ensure at least 2 three-party scenarios (Ship-To differs from Bill-To)
- Ensure at least 1 scenario where Ship-To is in a different state from Bill-To (forces tax recomputation)
- Ensure deal stages advance correctly (linked deals show in payment_pending if order exists)

A5.2. Tests:

- Schemas/RLS for PIs and orders
- PI transitions, order transitions (all allowed + several forbidden)
- convertQuotationToPi: tax recomputation when shipTo state differs from quote state
- confirmPi: atomic transaction (mock a failure at deal advancement, verify everything rolls back)
- confirmOrder: inventory reservation with FOR UPDATE locking; concurrent reservation test (two orders trying to confirm same items — second should fail cleanly)
- InsufficientInventoryError shape
- Three-party PDF: render a PI where billTo and shipTo are different dealers, verify both blocks appear in PDF
- verify-day-11.spec.ts: Playwright covering convert → PI sent → PI confirm → order pending → order confirm (with inventory reservation) → verify inventory_items status changed

A5.3. Docs:

- Update docs/WORKFLOWS.md with PI/Order lifecycle
- Add docs/RUNBOOKS.md entries: "Converting a quotation to PI", "Confirming an order with inventory check", "Cancelling an order and releasing reservations"

A5.4. Closeout per template:

- pnpm preflight, verify (25/25), typecheck, lint, test, build all green
- PROJECT_PLAN.md B.11 ✅
- Auto-commit + push

COMMIT 11e: `feat(orders): day 11 complete — PI + order lifecycle`

==========================================================
GUARDRAILS (DAY 11)
==========================================================

- Three-party support: PIs/Orders MUST support billTo ≠ shipTo. If shipTo state differs from billTo's state for tax purposes, place_of_supply must be the SHIP-TO state per Indian GST rules.
- Place of supply MUST be recomputed when Ship-To changes. The tax engine sees the right state.
- Order confirmation is atomic — PI + order + reservations + deal advance happen in ONE transaction. If any step fails, all roll back.
- Inventory reservation uses SELECT FOR UPDATE on inventory_items. No race conditions.
- Insufficient inventory blocks order confirmation with a structured error. User can see exactly what's short.
- Document numbering is per-tenant per-fiscal-year (pattern from Day 8 quotations). PIs have their own counter, Orders have their own.
- All money columns NUMERIC, never float.
- @dealerlink/tax is called for every recomputation. No copy-paste of tax logic.
- Chunk each phase commit. Day 7 and Day 10's lessons apply.

WHEN DONE:

- Print summary, 5 chunk commits
- Confirm seeded order reservations work (inventory items show status='reserved')
- Confirm three-party PI PDF renders correctly
- Confirm verify is 25/25 (24 prior + verify-day-11)
- Tell me Day 11 is complete and Day 12 (Payments) is next

```

### Verification checklist (after Day 11)

#### Cross-module choreography
- [ ] Convert a seeded accepted quotation → PI created → quotation status='accepted' stays (immutable now)
- [ ] PI shipped → PDF generated and downloadable
- [ ] Confirm PI → order auto-created → linked deal stage advances to `payment_pending`
- [ ] Confirm order → inventory_items.status changes from 'in_stock' to 'reserved' for the reserved quantity
- [ ] Try to confirm an order that exceeds inventory → blocked with specific shortage error

#### Three-party document
- [ ] Create a PI with Ship-To different from Bill-To (e.g., same dealer's two addresses, or two different dealers)
- [ ] PDF shows both blocks distinctly
- [ ] If Ship-To state differs from tenant state for inter-state purposes, tax recomputes per shipTo state (not billTo state) — manually verify the math

#### Tax engine integration
- [ ] PI with billTo in MH and shipTo in KA → IGST applies (inter-state)
- [ ] PI with both in MH → CGST + SGST (intra-state)
- [ ] Order created from PI has the same totals (snapshot match)

#### Automated
- [ ] `pnpm preflight` green
- [ ] `pnpm verify` 25/25
- [ ] All quality gates green
- [ ] B.11 ✅ in PROJECT_PLAN.md

---

## Day 12 — Payments + Receipts

**Goal:** Ship the payment recording module. By end of day, users can record payments (full / partial / advance), allocate one payment across multiple PIs/Orders, generate payment receipts, see auto-updated payment status on orders, and track credit-period overdues. Payment receipt PDFs reuse the Day 10 template architecture.

**Estimated time:** 4–5 hours + ~30 min verification

**Deliverable:** Working `/payments/*` module with list, detail, record, allocate, receipt PDF, refund. Order payment status propagates automatically.

### Prompt for Claude Code

```

You are implementing Day 12 of the Dealerlink build. Day 11 shipped successfully (commits f1def0d..93c6900) — PI + Order lifecycle with atomic transactions and inventory reservation. Day 12 adds the cash side: payment recording, allocation, receipts.

PRELIMINARY:
P.1. Run `pnpm preflight` — confirm 11 green checks.
P.2. Read CLAUDE.md §6 (multi-party doc logic — receipts go to Bill-To, not Ship-To), §10 (auth — payments are admin + accounts roles only, NOT sales).
P.3. Read DECISIONS.md ADR-012 (place of supply — receipts are not goods/services and don't apply tax; this is informational so receipts are tax-neutral documents).
P.4. Read DEVIATIONS.md DEV.31 (verify spec locator pattern) and DEV.40 (PI line items inherited from quotation; same pattern for payments).
P.5. Read packages/db/src/schema/order.ts — the `paymentStatus` field on orders is what we'll be propagating to.
P.6. Read apps/workers/src/templates/\_components/ — Day 10/11 shared template parts; today's receipt uses Header, PartyBlock, Footer (no LineItemsTable since receipts have no line items per se).

PRIMARY REFERENCES:

1. CLAUDE.md §6 (Bill-To is the payment party — receipts always go to whoever pays)
2. BRD §6 (Payment requirements, partial payment, advance payment, credit period)
3. docs/Distribyte.html — Payments screen reference
4. Day 11 schemas — Order.paymentStatus is the propagation target
5. Day 10 template architecture — receipt PDF extends this

==========================================================
TRACK A — PAYMENTS (CHUNKED — 4 chunks)
==========================================================

## CHUNK 12a — Schemas + state machine + helpers

A1.1. Create packages/db/src/schema/payment.ts:

```typescript
export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),

  paymentNumber: text('payment_number').notNull(), // PAY-2026-0001 (per-tenant per-FY)

  // Payer (Bill-To from one or more orders)
  dealerId: uuid('dealer_id').notNull(),

  // Money: receipts are tax-neutral documents
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('INR'),

  // Method
  method: text('method').notNull(), // 'bank_transfer' | 'cheque' | 'cash' | 'upi' | 'card' | 'other'
  reference: text('reference'), // bank txn ID, cheque number, UPI ref, etc.
  receivedDate: date('received_date').notNull(),

  // Bank deposit details (for accountant reconciliation)
  depositedToBank: text('deposited_to_bank'),
  depositedDate: date('deposited_date'),

  // Status
  status: text('status').notNull().default('pending_verification'),
  // 'pending_verification' (accounts hasn't confirmed yet)
  // | 'verified' (accounts confirmed receipt; allocations can be made)
  // | 'cleared' (cheque cleared / bank receipt confirmed; allocations final)
  // | 'bounced' (cheque bounced / payment reversed)
  // | 'refunded' (refunded back to dealer)

  // Verification trail
  verifiedAt: timestamp('verified_at'),
  verifiedBy: uuid('verified_by'),
  clearedAt: timestamp('cleared_at'),
  bouncedAt: timestamp('bounced_at'),
  bouncedReason: text('bounced_reason'),
  refundedAt: timestamp('refunded_at'),
  refundedReason: text('refunded_reason'),

  // Allocation summary (denormalized for fast queries; equals SUM of payment_allocations.amount where payment_id = this.id)
  allocatedAmount: numeric('allocated_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  // Unallocated = amount - allocatedAmount. Positive = advance / floating credit.

  notes: text('notes'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').notNull(),
});

export const paymentAllocations = pgTable('payment_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  paymentId: uuid('payment_id').notNull(),

  // Allocated against — exactly one of these is set
  orderId: uuid('order_id'),
  performaInvoiceId: uuid('performa_invoice_id'),
  // Phase 1: payment can be allocated to Order (after order is confirmed) OR PI advance.
  // If orderId is set, performaInvoiceId is null. Vice versa.

  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),

  allocatedAt: timestamp('allocated_at').notNull().defaultNow(),
  allocatedBy: uuid('allocated_by').notNull(),
  notes: text('notes'),
});
```

A1.2. Constraints:

- payment_number: UNIQUE (tenant_id, payment_number)
- payments.amount > 0
- payments.allocated_amount >= 0 AND <= amount
- payments.method IN the listed enum
- payments.status IN the listed enum
- payment_allocations.amount > 0
- CHECK: exactly one of (order_id, performa_invoice_id) is non-null per allocation
- No allocations against bounced/refunded payments (enforced in transition guards)

A1.3. Indexes:

- payments: (tenant_id, dealer_id, received_date DESC), (tenant_id, status, received_date DESC)
- payment_allocations: (tenant_id, payment_id), (tenant_id, order_id), (tenant_id, performa_invoice_id)
- For overdue queries: (tenant_id, dealer_id) on orders combined with (tenant_id, status) for paymentStatus='unpaid' or 'partially_paid'

A1.4. RLS + audit trigger on both tables. document_counters entry for 'payment'.

A1.5. Create packages/db/src/payments/transitions.ts — state machine:

- pending_verification → verified (admin + accounts)
- verified → cleared (admin + accounts)
- verified → bounced (admin + accounts, captures reason; reverses any allocations)
- cleared → refunded (admin only, captures reason; reverses allocations)
- Forbidden: pending → cleared directly (must verify first); any → pending; cleared → bounced

A1.6. Create packages/db/src/payments/propagation.ts — pure helper that computes order.paymentStatus given an order's totalAmount and the sum of cleared/verified allocations against it:

```typescript
export function deriveOrderPaymentStatus(
  orderTotal: Decimal,
  allocatedAmount: Decimal, // sum of allocations from payments where status IN ('verified','cleared')
): 'unpaid' | 'partially_paid' | 'paid' {
  if (allocatedAmount.isZero()) return 'unpaid';
  if (allocatedAmount.greaterThanOrEqualTo(orderTotal)) return 'paid';
  return 'partially_paid';
}
```

Unit-test this helper with edge cases (over-allocation, exact match, etc).

A1.7. Generate migration. Verify pnpm typecheck green.

A1.8. Zod schemas in packages/schemas/src/payment.ts: createPaymentInput, allocatePaymentInput, transitionPaymentInput.

COMMIT 12a: `feat(payments): chunk a — schemas + state machine + propagation helper`

## CHUNK 12b — Server actions

A2.1. apps/web/lib/actions/payments/ (using tenantAction()):

- recordPayment (admin + accounts) — creates payment with status='pending_verification', amount, method, reference, date. Returns paymentId.

- verifyPayment (admin + accounts) — pending_verification → verified. Triggers propagation: for any orders where this payment has allocations (none yet for new payment), recompute paymentStatus.

- markPaymentCleared (admin + accounts) — verified → cleared. Triggers propagation.

- markPaymentBounced (admin + accounts) — verified → bounced. ATOMIC: reverses all allocations (deletes payment_allocations rows for this payment, recomputes paymentStatus on affected orders). Captures bouncedReason.

- refundPayment (admin only) — cleared → refunded. Same atomic reversal as bounced.

- allocatePayment (admin + accounts) — partial allocation. Input: paymentId, allocations[] = [{ orderId | performaInvoiceId, amount, notes? }]. Validates:
  - Payment status IN ('verified', 'cleared')
  - SUM(new allocations) + payment.allocatedAmount <= payment.amount (no over-allocation)
  - For each order allocation: amount <= (orderTotal - already-allocated-to-that-order)
  - All in one transaction. After insert, recompute paymentStatus on each affected order via the propagation helper. Update orders.paymentStatus accordingly.
  - If order.paymentStatus moves to 'paid' AND the order was 'pending', advance to 'confirmed' (the funds-received-then-confirm flow; Day 11's manual confirm flow still works for credit terms).

- deallocatePayment (admin + accounts) — removes an allocation by id. Recomputes paymentStatus. Used to fix mistakes.

A2.2. CRITICAL: All payment status transitions and allocations are inside a single transaction. The pattern is:

1.  Open withTenant transaction
2.  SELECT FOR UPDATE on payment row
3.  Validate status transition allowed
4.  Apply DB changes (status update, allocation insert/delete)
5.  For each affected order: SELECT FOR UPDATE order row, recompute paymentStatus, update
6.  Audit log entries
7.  Commit

A2.3. Add `applyAdvancePayment` convenience action (admin + accounts) — for the common flow: dealer pays an advance against a PI before order is confirmed.

- Input: paymentId, piId, amount
- Creates allocation against PI
- When PI is later confirmed → order created, advance allocation auto-transfers to the new order (in the confirmPi action; update Day 11's confirmPi to check for PI-allocated payments and transfer them)

A2.4. Update Day 11's confirmPi action — add the advance-transfer step inside the atomic transaction:

- Before deal advance, query for payment_allocations where performaInvoiceId = this PI
- For each, update the allocation: set orderId = newOrderId, performaInvoiceId = null
- Recompute paymentStatus on the new order
- If paymentStatus = 'paid', set order.status = 'confirmed' (effectively merged the funds-received-confirm flow)
- All in the same atomic transaction Day 11 already established

A2.5. Tests for all of the above. Include:

- recordPayment with various methods
- verify → cleared happy path
- bounced reverses allocations and propagates back to 'unpaid' on affected orders
- allocation validation (over-allocation rejected, allocating to wrong-tenant order rejected)
- Concurrent allocation attempt on same payment (two operators try to allocate ₹100k from a ₹100k payment to different orders simultaneously — second should fail with payment-fully-allocated)
- Order paymentStatus propagation: 0 → unpaid, partial → partially_paid, exact → paid, over → paid (clamped, not error)
- Advance payment on PI transfers to order on confirmPi

COMMIT 12b: `feat(payments): chunk b — server actions with atomic allocation`

## CHUNK 12c — UI: payments + receipt PDF

A3.1. Payment list (app/(app)/payments/page.tsx):

- Columns: payment number, date, dealer, amount, method, allocated % (visual progress bar), status pill, action menu
- Filters: status (multi), method, dealer, date range
- Sort by date desc

A3.2. Payment detail (app/(app)/payments/[id]/page.tsx):

- Hero: payment number, status pill, dealer name, amount, action menu (per status)
- Sections:
  - Identity (number, date, dealer, reference, method)
  - Allocations table — list of payment_allocations rows with order/PI number, amount, allocated by, action to deallocate (admin + accounts)
  - "Allocate to..." button (visible if unallocated > 0 and status IN verified/cleared) — opens modal showing dealer's unpaid orders + outstanding amounts; user picks orders + enters amounts; submit
  - Status history
  - Activity (audit + access log)

A3.3. Record payment flow (app/(app)/payments/new/page.tsx):

- Form: dealer (typeahead), amount, method, reference, received date, deposited bank/date, notes
- "Allocate now" toggle: if on, after creating payment, redirects directly to allocation modal pre-filtered to that dealer's unpaid orders
- Default to admin@demo + accounts roles only — sales should NOT see the New Payment button (server-side enforced; UI hides it)

A3.4. Order detail page update (Day 11 file):

- Add "Payments" tab showing allocations against this order
- Each row: payment number (link), allocated amount, allocated date, allocated by
- Footer: "Total paid: ₹X, Outstanding: ₹Y, Status: <pill>"
- "Record Payment" button (admin + accounts, visible if outstanding > 0)

A3.5. Payment receipt PDF (apps/workers/src/templates/payment-receipt.tsx):

- Reuse Day 10 Header (tenant branding) + PartyBlock (dealer) + Footer
- Body content (replaces line items):
  - Receipt header: "PAYMENT RECEIPT" + payment number + date
  - "Received From" block: dealer Bill-To address + GSTIN
  - Amount: large mono, amount in words below
  - Method + reference (bank txn / cheque number)
  - Allocation breakdown (if any): table of which order numbers + amounts
  - Unallocated remainder (if any): "Advance balance: ₹X"
  - Bank details (tenant's bank — same as quotation footer)
- Note: receipts are tax-neutral. No GST breakdown. No place_of_supply.

A3.6. PDF generation server action (apps/web/lib/actions/payments/generate-receipt.ts) — same pattern as Day 10's quotation PDF:

- Loads payment + allocations + dealer + tenant
- Renders to PDF via the workers subprocess
- Stores in generated_documents
- Returns download URL / stream

A3.7. "Send Receipt" action — emails the PDF to dealer.email (logs to email_delivery_log; actual Resend send wires up Day 14).

COMMIT 12c: `feat(payments): chunk c — UI + receipt PDF`

## CHUNK 12d — Overdue tracking, dashboard, seed, tests, closeout

A4.1. Overdue calculation:

- A query helper getOverdueOrders(tenantId): returns orders where paymentStatus IN ('unpaid', 'partially_paid') AND (orderDate + dealer.creditPeriodDays) < today
- Each row includes: order, dealer, days overdue, outstanding amount
- ORDER BY days overdue DESC

A4.2. Dashboard widget on /dashboard:

- "Overdue payments" card — count of overdue orders + total outstanding amount
- "Recent payments (last 7 days)" — list with payment number, dealer, amount
- "Unallocated payments" — count of payments with allocatedAmount < amount AND status IN ('verified', 'cleared') — these are advances waiting to be applied

A4.3. Seed (packages/db/src/seeds/day12.ts):

- 15 payments per tenant covering all states:
  - 6 fully allocated to confirmed orders (status='cleared')
  - 3 partially allocated (advance with remainder unallocated)
  - 2 unverified (pending_verification)
  - 2 bounced (with allocations reversed)
  - 1 refunded
  - 1 advance against a PI (linked to a PI that's later confirmed in another seed step → allocation transfers to the resulting order)
- After seed, several orders should have paymentStatus='paid' (fully allocated cleared payments) and a couple 'partially_paid'
- A couple of overdue orders for dashboard widget testing (set orderDate far enough back that creditPeriodDays has elapsed)

A4.4. Tests:

- All transition + allocation cases per chunk 12b
- Propagation helper unit tests
- Concurrent allocation race (the FOR UPDATE proof)
- Seed assertion: SUM(payment_allocations.amount) WHERE payment_id = X equals payment.allocatedAmount for every payment (denormalization invariant)
- Receipt PDF renders with allocations and amount-in-words
- verify-day-12.spec.ts (Playwright):
  - Login, navigate /payments, see seeded payments
  - Click "Record payment", fill form, submit → appears in list
  - Open a payment, verify it, allocate to an unpaid order → order paymentStatus updates to paid/partial
  - Generate receipt PDF, verify download
  - Filter spec locators with PAY-2026-/ORD-2026- patterns to ignore test residue (per DEV.31)

A4.5. Docs:

- Update docs/WORKFLOWS.md with payment lifecycle and the advance-transfer-on-confirmPi behavior
- Add runbook entries: "Recording a payment", "Allocating an advance to an order", "Reversing a bounced cheque", "Refunding a payment"

A4.6. Closeout:

- pnpm preflight, verify (28/28 = 27 prior + 1 new), typecheck, lint, test, build all green
- PROJECT_PLAN.md B.12 ✅
- Final commit: `feat(payments): day 12 complete — payments, allocations, receipts, overdue`
- Push

COMMIT 12d: as above

==========================================================
GUARDRAILS (DAY 12)
==========================================================

- Payments are MONEY. Every column is NUMERIC, never float. Every computation goes through Decimal via @dealerlink/tax's decimal helpers (you may import @dealerlink/tax's exported decimal module if useful, or use decimal.js directly — pick one and stay consistent).
- Allocation validation is non-negotiable: cannot allocate more than payment.amount; cannot allocate to other-tenant orders (RLS catches but validate explicitly with friendly errors).
- ATOMIC TRANSACTIONS for all status changes and allocations. SELECT FOR UPDATE on payment and affected orders.
- Bounce/refund REVERSES allocations and recomputes order paymentStatus. The orders may regress from 'paid' to 'partially_paid' or 'unpaid'.
- Receipts are tax-neutral documents. No CGST/SGST/IGST fields. No tax engine call in the receipt path.
- Receipt PDF uses Bill-To dealer (per CLAUDE.md §6 — receipts go to the payer). Not Ship-To.
- Role enforcement: sales role does NOT see payment UI or buttons. Accounts is the primary role; admin has full access. Server-side enforcement via tenantAction, UI hiding is cosmetic.
- Document number per-tenant per-FY using existing document_counters.
- Chunk each phase. Day 7/10/11 lessons apply.

WHEN DONE:

- Print summary, 4 chunk commits
- Confirm seeded data: orders show paymentStatus correctly propagated, overdue widget shows expected count
- Confirm receipt PDF generated for one payment (mention allocation count + total in receipt)
- Confirm verify 28/28
- Tell me Day 12 is complete and Day 13 (Dispatch) is next

```

### Verification checklist (after Day 12)

#### Allocation correctness
- [ ] Open a seeded order with `paymentStatus='paid'` — confirm Payments tab shows allocations summing to order total
- [ ] Open an order with `paymentStatus='partially_paid'` — confirm partial allocation reflected
- [ ] Record a new payment, allocate part of it to an unpaid order — order moves to `partially_paid`
- [ ] Try to over-allocate (allocate ₹110k from a ₹100k payment) — blocked with clear error
- [ ] Mark a verified-and-allocated payment as bounced — affected orders regress in payment status, allocations reversed

#### Receipt PDF
- [ ] Generate a receipt for a payment with multiple allocations — PDF lists each allocation
- [ ] Generate a receipt for an unallocated advance — PDF shows "Advance balance"
- [ ] Amount in words matches digits
- [ ] No GST breakdown visible on receipt

#### Role enforcement
- [ ] Log in as `sales@demo.test` — /payments redirects to dashboard OR shows access denied (NOT visible in sidebar)
- [ ] Log in as `accounts@demo.test` — full payments access
- [ ] Server-side: try to call recordPayment from a sales-role session via direct invocation — blocked

#### Dashboard
- [ ] /dashboard shows overdue payments widget with seeded overdue count
- [ ] Recent payments shown
- [ ] Unallocated advances shown

#### Automated
- [ ] `pnpm verify` 28/28
- [ ] All quality gates green
- [ ] B.12 ✅ in PROJECT_PLAN.md

---

## Day 13 — Dispatch + Delivery Tracking

**Goal:** Close the order-to-cash cycle. Users pick reserved serial numbers, create dispatch notes, transition inventory through `reserved → dispatched → delivered`, generate dispatch note PDFs, mark orders fulfilled. Concurrent dispatch protection is mandatory.

**Estimated time:** 5–6 hours + ~45 min verification

**Deliverable:** Working `/dispatch/*` module. Order transitions `confirmed → partially_dispatched → fully_dispatched → delivered`. Inventory items move through dispatch states. Dispatch note PDF using Day 10 template. Concurrent-dispatch race test passing.

### Prompt for Claude Code

```

You are implementing Day 13 of the Dealerlink build. Day 12 shipped successfully (26b73ff..7f6353e) — payments + allocations + receipts. Day 13 is the physical-fulfillment day: inventory leaves the warehouse against confirmed orders.

THIS IS THE HIGHEST-STAKES DAY AFTER DAY 9. Tax bugs destroy trust; dispatch bugs send the wrong panels to the wrong customer. Concurrent dispatch is a real race condition. Slow is fast.

PRELIMINARY:
P.1. `pnpm preflight` — confirm 11 green.
P.2. Read CLAUDE.md §5 (now Ship-To-driven place_of_supply per ADR-012), §6 (multi-party — dispatch note goes to Ship-To), §10 (auth — dispatch role primary).
P.3. Read DECISIONS.md ADR-012 (place of supply).
P.4. Read DEVIATIONS.md DEV.33 (state format), DEV.41 (Day 12 left orders pending — Day 13 confirms them in seed before dispatch), DEV.42 (correlated subquery ambiguity — scan other queries for the same pattern).
P.5. Read packages/db/src/schema/inventory.ts — the inventory_items state machine: in_stock → reserved (Day 11) → dispatched (Day 13) → delivered (Day 13).
P.6. Read packages/db/src/inventory/transitions.ts — extend today with dispatchItem() and deliverItem().
P.7. Read Day 11's confirmOrder flow — Day 13's createDispatch is its mirror (reserved → dispatched, decrements order's reservedQuantity, increments dispatchedQuantity).
P.8. Read apps/workers/src/templates/\_components/ — Day 13 adds a SerialsTable component for the dispatch note.

PRIMARY REFERENCES:

1. CLAUDE.md §5 + §6 (place of supply = Ship-To; dispatch note goes to Ship-To)
2. BRD §7 (Dispatch requirements: serial pick, partial dispatch, vehicle/transporter details)
3. ADR-012 (Ship-To-driven tax)
4. Day 11 schemas (orders.status state machine — declared transitions: confirmed → partially_dispatched → fully_dispatched → delivered)
5. Day 6 inventory schema + transitions module
6. Day 10 template architecture (Header/PartyBlock/Footer reused; new SerialsTable added)

==========================================================
TRACK A — DISPATCH (CHUNKED — 5 chunks)
==========================================================

## CHUNK 13a — Schemas + state machine extensions

A1.1. Create packages/db/src/schema/dispatch.ts:

```typescript
export const dispatches = pgTable('dispatches', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),

  dispatchNumber: text('dispatch_number').notNull(), // DSP-2026-0001

  // Source order (required — every dispatch comes from a confirmed order)
  orderId: uuid('order_id').notNull(),

  // Snapshot of parties from order (immutable once dispatched)
  billToDealerId: uuid('bill_to_dealer_id').notNull(),
  shipToDealerId: uuid('ship_to_dealer_id').notNull(),

  // Logistics
  dispatchDate: date('dispatch_date').notNull().defaultNow(),
  vehicleNumber: text('vehicle_number'),
  transporterName: text('transporter_name'),
  transporterDocketNumber: text('transporter_docket_number'),
  driverName: text('driver_name'),
  driverPhone: text('driver_phone'),

  // E-way bill placeholder (Phase 2 wires real API; today just stores manually-entered number)
  ewayBillNumber: text('eway_bill_number'),
  ewayBillDate: date('eway_bill_date'),

  // Status: 'in_transit' → 'delivered' | 'returned'
  status: text('status').notNull().default('in_transit'),
  deliveredAt: timestamp('delivered_at'),
  deliveredAcknowledgedBy: text('delivered_acknowledged_by'), // dealer-side person who signed
  returnedAt: timestamp('returned_at'),
  returnedReason: text('returned_reason'),

  notes: text('notes'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').notNull(),
});

export const dispatchLines = pgTable('dispatch_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  dispatchId: uuid('dispatch_id').notNull(),

  // Mirrors order_lines structure (which mirrors PI lines, mirrors quotation lines)
  lineNumber: integer('line_number').notNull(),
  orderLineId: uuid('order_line_id').notNull(), // FK to the order_line being dispatched
  productId: uuid('product_id').notNull(),
  productSku: text('product_sku').notNull(),
  productName: text('product_name').notNull(),

  // The serials picked for this line (separate join table for granular tracking)
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),

  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const dispatchSerials = pgTable('dispatch_serials', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  dispatchId: uuid('dispatch_id').notNull(),
  dispatchLineId: uuid('dispatch_line_id').notNull(),
  inventoryItemId: uuid('inventory_item_id').notNull(), // the serial that was dispatched

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
```

A1.2. Constraints:

- dispatch_number UNIQUE (tenant_id, dispatch_number)
- dispatches.status CHECK ('in_transit', 'delivered', 'returned')
- dispatch_lines.quantity > 0
- dispatch_serials: UNIQUE (tenant_id, inventory_item_id) — a serial can only appear in ONE dispatch ever
- All tables: RLS, audit trigger, tenant_id index
- document_counters entry for 'dispatch'

A1.3. Extend packages/db/src/inventory/transitions.ts:

- `dispatchItem(itemId, dispatchId)` — reserved → dispatched. Validates current status. Sets dispatch_id reference.
- `deliverItem(itemId)` — dispatched → delivered. Updates delivered_at.
- `returnItem(itemId)` — dispatched → in_stock (returned to warehouse). Clears dispatch reference.
- All inside tenant-scoped transactions; SELECT FOR UPDATE on the inventory_items row.

A1.4. Extend packages/db/src/orders/transitions.ts:

- Wire the previously-declared but unimplemented transitions:
  - confirmed → partially_dispatched (when first dispatch created and order has more reservedQuantity remaining)
  - confirmed → fully_dispatched (when first dispatch satisfies entire order in one go)
  - partially_dispatched → fully_dispatched (when subsequent dispatch completes remaining)
  - fully_dispatched → delivered (when all dispatches marked delivered)
  - partially_dispatched → delivered (when remaining lines marked delivered via dispatch deliveries)
- Helper: deriveOrderFulfillmentStatus(orderId) — pure function that examines order_lines.dispatchedQuantity vs ordered quantity, plus all dispatch.status values, returns expected order status.

A1.5. Generate migration. pnpm typecheck green.

A1.6. Zod schemas in packages/schemas/src/dispatch.ts: createDispatchInput, pickSerialsInput, markDeliveredInput.

COMMIT 13a: `feat(dispatch): chunk a — schemas + state transitions`

## CHUNK 13b — Server actions: createDispatch (the high-stakes one)

A2.1. apps/web/lib/actions/dispatch/ (using tenantAction()):

- createDispatch (admin + dispatch role) — THE critical action. Input:

  ```
  {
    orderId: uuid,
    lines: [{
      orderLineId: uuid,
      serialIds: uuid[]  // exact inventory_item_ids being dispatched, all must be currently 'reserved' for this order
    }],
    vehicleNumber, transporterName, transporterDocketNumber,
    driverName, driverPhone, ewayBillNumber, ewayBillDate, notes
  }
  ```

  ATOMIC transaction:
  1. SELECT FOR UPDATE on orders row
  2. Validate order.status IN ('confirmed', 'partially_dispatched')
  3. For each serialId, SELECT FOR UPDATE on inventory_items row
  4. Validate every serial:
     - status='reserved'
     - reserved_for_order_id === orderId (cannot dispatch another order's serials)
     - belongs to same tenant
  5. Validate the serial count per orderLineId matches an integer quantity (e.g., 5 serials → quantity 5)
  6. Validate sum of dispatched quantities per orderLineId ≤ remaining (order_line.quantity - order_line.dispatchedQuantity)
  7. Allocate next dispatch_number via document_counters
  8. INSERT dispatches row
  9. INSERT dispatch_lines rows
  10. INSERT dispatch_serials rows
  11. For each serial: dispatchItem(itemId, dispatchId) — moves to status='dispatched'
  12. For each affected order_line: UPDATE order_lines.dispatchedQuantity += dispatched count
  13. Compute new order.status via deriveOrderFulfillmentStatus
  14. UPDATE order row with new status, set partiallyDispatchedAt or fullyDispatchedAt timestamps
  15. If deal pipeline linked + order becomes fully_dispatched, advance deal to 'closed_won' (final stage)
  16. Audit log entries
  17. Commit

A2.2. markDispatchDelivered (admin + dispatch) — transitions dispatch.status: in_transit → delivered. ATOMIC:

1.  SELECT FOR UPDATE on dispatch row
2.  For each dispatch_serial → deliverItem() (dispatched → delivered)
3.  If all dispatches for the order are now 'delivered', UPDATE order.status = 'delivered', set deliveredAt
4.  Audit entries

A2.3. returnDispatch (admin only) — transitions dispatch.status: in_transit → returned. ATOMIC:

1.  SELECT FOR UPDATE on dispatch + all related inventory_items
2.  For each serial → returnItem() (dispatched → in_stock; clears dispatch ref; also clears reserved_for_order_id since order may need re-reservation)
3.  UPDATE order_lines.dispatchedQuantity -= returned quantities
4.  Recompute order.status (may regress from partially_dispatched → confirmed)
5.  Capture returnedReason
6.  Audit entries

A2.4. Helper queries:

- getAvailableSerialsForOrder(orderId) — returns inventory_items.status='reserved' for this order, grouped by product, with serial_number
- getDispatchableLines(orderId) — for each order_line, return: ordered, reserved, dispatched, remaining-to-dispatch counts
- getDispatchesForOrder(orderId) — list of dispatches with their lines + serials

A2.5. CRITICAL — Concurrent dispatch test (mandatory):
Two operators try to dispatch the SAME serial numbers simultaneously. The SECOND must fail cleanly with a structured error. Test:

```typescript
test('concurrent dispatch of same serials — second fails', async () => {
  // Setup: order with 5 reserved serials
  const [r1, r2] = await Promise.allSettled([
    createDispatch({ orderId, lines: [{ orderLineId, serialIds: serialIds.slice(0, 3) }], ... }),
    createDispatch({ orderId, lines: [{ orderLineId, serialIds: serialIds.slice(0, 3) }], ... }), // same serials
  ]);
  // Exactly one succeeds, the other fails with a specific error code
  expect([r1.status, r2.status].filter(s => s === 'fulfilled').length).toBe(1);
  expect([r1, r2].find(r => r.status === 'rejected')?.reason).toMatchObject({ code: 'SERIAL_ALREADY_DISPATCHED' });
});
```

This test must use ACTUAL concurrent transactions (Promise.allSettled), not sequential calls. The FOR UPDATE locks make this safe; the test proves it.

A2.6. Tests for return flow + delivery flow + partial dispatch scenarios.

COMMIT 13b: `feat(dispatch): chunk b — createDispatch with concurrent-safe serial pick`

## CHUNK 13c — UI: dispatch list, create flow, detail

A3.1. Dispatch list (app/(app)/dispatch/page.tsx):

- Columns: dispatch number, date, order number (link), Ship-To dealer, vehicle, transporter, status pill (in_transit/delivered/returned), serials count
- Filters: status, date range, transporter, dealer
- "+ New dispatch" button (admin + dispatch role)

A3.2. Create dispatch flow (app/(app)/dispatch/new/page.tsx OR /orders/[id]/dispatch/new):

- Order selection: typeahead of orders in status='confirmed' or 'partially_dispatched' (those with remaining reserved quantities)
- After order picked, load getDispatchableLines(orderId) to show:
  - Per line: SKU, name, ordered qty, dispatched-so-far, remaining
  - Quantity input (default = remaining; user can pick less for partial)
  - Serial picker: list of reserved serials for that product, checkboxes, default all selected up to quantity input
- Logistics section: vehicle, transporter, docket, driver info, e-way bill
- Validation:
  - At least one line with quantity > 0
  - For each line: serialIds count exactly matches quantity input
  - All picked serials are 'reserved' status (re-check at submit time, server validates again with FOR UPDATE)
- Submit creates dispatch → redirects to dispatch detail

A3.3. Dispatch detail (app/(app)/dispatch/[id]/page.tsx):

- Hero: dispatch number, status pill, order number link, action menu
- Sections:
  - Identity (number, date, order link)
  - Ship-To block (PartyBlock — Ship-To dealer)
  - Logistics (vehicle, transporter, e-way bill)
  - Line items + serials (table with each line's SKU, qty, expand to see serial numbers)
  - Status history
- Action menu by status:
  - in_transit: Mark delivered (capture acknowledged_by), Return (admin only, capture reason)
  - delivered: View only, "Generate POD" (proof of delivery) placeholder
  - returned: View only

A3.4. Order detail page update (Day 11 file):

- Add "Dispatches" tab listing all dispatches for this order
- Fulfillment status line: "X of Y units dispatched, Z delivered"
- "New dispatch" button if order has remaining reserved quantity

COMMIT 13c: `feat(dispatch): chunk c — dispatch UI + order integration`

## CHUNK 13d — Dispatch note PDF + dashboard

A4.1. Dispatch note PDF template (apps/workers/src/templates/dispatch-note.tsx):

- Reuse Header (tenant branding), PartyBlock (Ship-To dealer; Bill-To shown as smaller "Invoice to" sub-block), Footer
- New component: SerialsTable.tsx — line items + serial numbers grouped per product
- Document title: "DISPATCH NOTE" + dispatch number + date
- Logistics block: vehicle, transporter, docket, driver, e-way bill
- Order reference: "Against Order: ORD-2026-XXXX dated YYYY-MM-DD"
- Tax-neutral document (dispatch note is not a tax invoice; that's a separate Phase 2 module)
- Acknowledgment section: signature line "Received by: ******\_\_\_\_****** Date: ****\_\_\_\_****"
- Save sample to docs/samples/dispatch-sample.pdf during verification

A4.2. PDF actions:

- generateDispatchPdf (admin + dispatch + accounts) — same pattern as Day 10/12
- downloadDispatchPdf
- emailDispatchPdf — logs to email_delivery_log (Day 14 wires real send)
- Auto-generate on dispatch creation (the "send to driver" use case)

A4.3. Dashboard widgets on /dashboard:

- "Dispatches today" — count + total units
- "In-transit dispatches" — count, with expected delivery (next 7 days if expectedDeliveryDate captured)
- "Orders ready to dispatch" — count of orders.status='confirmed' with reserved inventory

COMMIT 13d: `feat(dispatch): chunk d — dispatch PDF + dashboard widgets`

## CHUNK 13e — Seed, tests, closeout

A5.1. Seed (packages/db/src/seeds/day13.ts):

- First: take Day 12's seeded orders and CONFIRM the ones still in 'pending' (DEV.41 — orders deliberately left unconfirmed). Some need to be in 'confirmed' state with reservations.
- 8 dispatches per tenant:
  - 4 in_transit (recent dispatches, expected delivery in next 1-7 days)
  - 3 delivered (older dispatches, acknowledged_by populated)
  - 1 returned (with reason)
- At least 2 partial dispatches (order has 10 units, dispatch only 6, leaves 4 remaining-to-dispatch)
- At least 1 full-dispatch-then-delivered cycle (order moves through confirmed → fully_dispatched → delivered)
- Realistic logistics data: actual-looking vehicle numbers (MH-12-AB-1234), transporter names, docket numbers

A5.2. Tests (packages/db/tests/dispatch.test.ts):

- Schema constraints + RLS
- All transition cases for inventory_items + orders + dispatches
- The concurrent-dispatch test (A2.5) — MANDATORY
- Partial dispatch leaves order in 'partially_dispatched' with correct remaining counts
- Return flow regresses order status
- Cross-tenant dispatch attempt blocked
- Cannot dispatch unreserved serials
- Cannot dispatch other-order's serials
- Cannot dispatch more than reserved quantity
- Audit log invariant: every dispatch creation logs N audit entries (one per serial transition + dispatch insert + order update)

A5.3. Playwright verify-day-13.spec.ts (use loginAs):

- dispatch@demo.test can see /dispatch + create dispatches
- sales@demo.test CANNOT access /dispatch (redirect to /dashboard per Day 12 pattern)
- accounts@demo.test can view dispatches but cannot create
- Create a dispatch from a seeded confirmed order via the UI, verify inventory_items status changes to 'dispatched'
- Mark a dispatch delivered, verify order.status updates appropriately
- Locators scoped to DSP-2026-, ORD-2026- per DEV.31

A5.4. Docs:

- Update docs/WORKFLOWS.md with full dispatch lifecycle
- Update docs/STRUCTURE.md with new schemas
- Add runbook entries: "Creating a dispatch", "Marking dispatch delivered", "Returning a dispatched order", "Handling partial dispatch"

A5.5. Closeout per template:

- pnpm preflight, verify (32/32 = 31 prior + 1 new), typecheck, lint, test, build all green
- PROJECT_PLAN.md B.13 ✅
- Final commit: `feat(dispatch): day 13 complete — dispatch creation, serial pick, fulfillment tracking`
- Push

COMMIT 13e: as above

==========================================================
GUARDRAILS (DAY 13)
==========================================================

- Serials are PHYSICAL ASSETS. Cannot dispatch a serial twice. dispatch_serials.UNIQUE constraint + status state machine + FOR UPDATE locking are the three layers protecting this.
- ATOMIC TRANSACTIONS for every dispatch creation/delivery/return. No partial state.
- Cross-tenant access blocked at RLS layer AND explicit validation in createDispatch (defense in depth).
- Role enforcement: dispatch is the primary role, admin has full access. Sales/accounts can VIEW but not CREATE dispatches. UI hides buttons; server enforces via tenantAction.
- Dispatch note PDF goes to Ship-To dealer (per CLAUDE.md §6 — physical goods location). Bill-To shown as reference only.
- Concurrent dispatch test is NON-NEGOTIABLE. Must use Promise.allSettled with actual parallel transactions, not sequential calls.
- Document numbering: per-tenant per-FY via document_counters. DSP-2026-XXXX format.
- If creating a dispatch fails partway, the entire transaction rolls back — serials stay 'reserved', order status unchanged, no orphan dispatch row.
- Chunk per phase. Day 7/10/11 lessons apply doubly — this day touches more rows per transaction than any prior day.

WHEN DONE:

- Print summary, 5 chunk commits
- Confirm concurrent-dispatch test passes
- Confirm seeded dispatches: count by status, sample serials show 'dispatched' state
- Confirm dispatch PDF sample saved to docs/samples/dispatch-sample.pdf
- Confirm verify 32/32
- Tell me Day 13 is complete and Day 14 (Email + webhooks) is next

````

### Verification checklist

#### Concurrent-dispatch correctness (the most important)
- [ ] Confirm the concurrent-dispatch test exists and uses `Promise.allSettled` (not sequential)
- [ ] Verify the test asserts exactly one succeeds, one fails with specific error code
- [ ] Run `pnpm test` filter to that test — confirm it actually runs and passes

#### Serial state machine
- [ ] After Day 13 seed: query `SELECT status, COUNT(*) FROM inventory_items GROUP BY status;` — should show `in_stock`, `reserved`, `dispatched`, `delivered` rows
- [ ] Pick one dispatched serial, verify its `dispatch_id` reference is set
- [ ] Pick one delivered serial, verify it transitioned from `dispatched` not directly from `reserved`

#### Order fulfillment status
- [ ] Order with partial dispatch shows `partially_dispatched` status
- [ ] Order with all units dispatched shows `fully_dispatched`
- [ ] Order with all dispatches delivered shows `delivered`
- [ ] Returned dispatch regresses order status correctly

#### Role enforcement
- [ ] sales@demo.test → /dispatch → redirects to /dashboard
- [ ] dispatch@demo.test → /dispatch → full access
- [ ] accounts@demo.test → /dispatch → can view, cannot create

#### Dispatch PDF
- [ ] Open `docs/samples/dispatch-sample.pdf`
- [ ] Verify Ship-To prominently displayed; Bill-To shown as smaller reference
- [ ] Serial numbers visible per line
- [ ] Logistics block populated
- [ ] Acknowledgment signature line present
- [ ] No tax breakdown (dispatch note is not a tax invoice)

#### Invariant queries (production-scoped)
```sql
-- No serial dispatched twice
SELECT inventory_item_id, COUNT(*) FROM dispatch_serials GROUP BY inventory_item_id HAVING COUNT(*) > 1;
-- Expect: 0 rows

-- Every dispatched/delivered inventory item has a dispatch_serials entry
SELECT i.id FROM inventory_items i WHERE i.status IN ('dispatched', 'delivered') AND NOT EXISTS (SELECT 1 FROM dispatch_serials ds WHERE ds.inventory_item_id = i.id);
-- Expect: 0 rows

-- Order dispatched quantities match sum of dispatch line quantities
SELECT ol.id, ol.dispatched_quantity, COALESCE(SUM(dl.quantity), 0) AS computed
FROM order_lines ol
LEFT JOIN dispatch_lines dl ON dl.order_line_id = ol.id
LEFT JOIN dispatches d ON d.id = dl.dispatch_id AND d.status <> 'returned'
WHERE ol.tenant_id IN (SELECT id FROM tenants)
GROUP BY ol.id
HAVING ol.dispatched_quantity::numeric <> COALESCE(SUM(dl.quantity), 0);
-- Expect: 0 rows
````

#### Automated

- [ ] `pnpm verify` 32/32
- [ ] All quality gates green
- [ ] B.13 ✅ in PROJECT_PLAN.md

---

## Day 14 — Email Dispatch + Inbound Webhooks

**Goal:** Close R.13 by moving email sending from inline calls to pg-boss workers. Wire Resend API for real outbound delivery. Set up the first inbound webhook (Resend delivery events) with HMAC signature verification. Generate the parked `RESEND_INBOUND_WEBHOOK_SECRET` from Stage A (A.10).

**Estimated time:** 4–5 hours + ~30 min verification

**Deliverable:** Working email dispatch via pg-boss + Resend. Sent quotation/PI/receipt/dispatch emails actually arrive in inboxes. Inbound delivery webhooks update `email_delivery_log` with bounce/open/delivered events. Signature verification rejects spoofed payloads.

### Prompt for Claude Code

```
You are implementing Day 14 of the Dealerlink build. Day 13 shipped successfully (commits 37ea511..4581a01) — dispatch flow with concurrent-safe serial pick. Day 14 closes R.13 (inline email → pg-boss) and unparks A.10 (RESEND_INBOUND_WEBHOOK_SECRET).

PRELIMINARY:
P.1. `pnpm preflight` — confirm 13 green.
P.2. Read CLAUDE.md §3 (stack — Resend + pg-boss), §10 (auth — webhook endpoint is public but signature-verified).
P.3. Read DEVIATIONS.md DEV.13 (R.13 origin — inline email was Day 4 expedient), DEV.36 (Day 10 sync PDF via subprocess; pg-boss handler exists but unused), DEV.45 + DEV.46 (Day 13 seed observations — no Day 14 impact).
P.4. Read packages/db/src/schema/email_delivery_log.ts — Day 4's table that captures every email attempt. Today extends it with bounce/open/click event tracking.
P.5. Read apps/web/lib/email/ — current inline send code. Today this gets replaced.
P.6. Read PROJECT_PLAN.md A.10 — the parked task for RESEND_INBOUND_WEBHOOK_SECRET. Today generates and stores it.

PRIMARY REFERENCES:
1. CLAUDE.md §3 (Resend for email, pg-boss for queues — no Redis)
2. https://resend.com/docs/api-reference/emails — Resend API contract
3. https://resend.com/docs/dashboard/webhooks/introduction — Resend webhook payload + signature format
4. Day 4 schema email_delivery_log + send helpers
5. Day 10/12/13 templates — PDFs are attachments to outbound emails

==========================================================
TRACK A — EMAIL + WEBHOOKS (CHUNKED — 4 chunks)
==========================================================

CHUNK 14a — Schema extensions + secrets setup
---------------------------------

A1.1. Generate RESEND_INBOUND_WEBHOOK_SECRET:
   - Use crypto.randomBytes(32).toString('base64url') in a one-off script
   - Add to .env.local (NEXT_PUBLIC_? NO — server-only)
   - Add to .env.example with a placeholder note
   - Document in SETUP.md alongside the other secrets (RESEND_API_KEY etc)
   - Update PROJECT_PLAN.md A.10 status from "parked" to "✅ closed by Day 14"

A1.2. Extend email_delivery_log schema (packages/db/src/schema/email_delivery_log.ts):
   - Existing columns: tenant_id, id, to, from, subject, body_preview, status, sent_at, error
   - Add:
     - provider_message_id (text, nullable) — Resend's id field from successful API response
     - delivered_at (timestamp, nullable) — set on delivery webhook event
     - opened_at (timestamp, nullable) — first open event
     - clicked_at (timestamp, nullable) — first click event
     - bounced_at (timestamp, nullable)
     - bounced_type (text, nullable) — 'hard' | 'soft' from Resend
     - bounced_reason (text, nullable)
     - complained_at (timestamp, nullable) — spam complaints
     - last_event_at (timestamp, nullable)
     - last_event_type (text, nullable)
   - Indexes: (tenant_id, provider_message_id) for webhook lookup, (tenant_id, status, last_event_at DESC)
   - status enum extended: 'queued' | 'sending' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'
   - RLS, audit trigger already there

A1.3. Create packages/db/src/schema/webhook_events.ts — raw audit log for ALL inbound webhooks (not just Resend; pattern for future webhooks):
   - id, provider (text — 'resend' | future ones), event_type, payload (jsonb), signature_verified (boolean), received_at, processed_at, processing_error
   - No tenant_id at this layer — webhooks arrive before tenant context is determined; the processing step routes to the right tenant
   - Index: (provider, received_at DESC)
   - RLS DISABLED on this table (operator-only access; webhook handler bypasses RLS to insert)

A1.4. Migration. pnpm typecheck green.

A1.5. Zod schemas in packages/schemas/src/email.ts for the outbound email job payload + the inbound webhook payload shapes.

COMMIT 14a: `feat(email): chunk a — schema + secrets for email dispatch and webhooks`

CHUNK 14b — Outbound: pg-boss worker + Resend client
---------------------------------

A2.1. Create apps/workers/src/email/resend-client.ts — thin wrapper over Resend SDK:
   - Lazy-init Resend client (one instance per process)
   - Single function: sendEmail({ tenantId, to, from, subject, html, attachments }) → returns { providerMessageId } or throws
   - Attachments are { filename, content: Buffer, contentType } — used for PDF receipts/quotations/dispatch notes
   - Error mapping: Resend's structured errors → typed EmailSendError with code (RATE_LIMITED, INVALID_EMAIL, INVALID_API_KEY, BLOCKED_DOMAIN, etc)

A2.2. Create apps/workers/src/email/handler.ts — pg-boss job handler for 'send-email':
   - Input job data: { tenantId, emailLogId, to, from, subject, html, attachments? }
   - Flow:
     1. Load email_delivery_log row by emailLogId (validate tenant matches)
     2. Update status='sending'
     3. Call resendClient.sendEmail(...)
     4. On success: update status='sent', provider_message_id=result.id, sent_at=now
     5. On EmailSendError: update status='failed', error=message
     6. On rate-limit error (RATE_LIMITED): re-queue with exponential backoff (pg-boss native retry — configure with retryLimit=5, retryBackoff=true)
     7. Audit log entry
   - Wire this handler into the workers boot path (apps/workers/src/index.ts) alongside the render-pdf handler from Day 10

A2.3. Create apps/web/lib/email/send.ts — REPLACES the inline send code:
   - Public function: queueEmail({ tenantId, to, from, subject, html, attachments }) — wrapped in tenantAction
   - Inserts into email_delivery_log with status='queued'
   - Enqueues pg-boss 'send-email' job with the new log row's id
   - Returns { emailLogId } — caller can poll status if needed
   - DOES NOT await delivery — async-first per R.13

A2.4. Update all existing callers of inline email send to use queueEmail:
   - Day 8 sendQuotation flow
   - Day 11 sendPi flow
   - Day 12 emailPaymentReceipt flow
   - Day 13 emailDispatchNote flow
   - Day 4 operator-tenant-onboarding welcome email
   - Each caller already had an "email log" entry; now they just enqueue the job

A2.5. PDF attachment integration: for callers that attach PDFs (quotation, PI, receipt, dispatch note):
   - Load the generated_documents row created in earlier days
   - Decode the base64 storage_ref (or fetch from DO Spaces in Stage D)
   - Pass as Buffer in the attachments array
   - File naming: `{document_type}-{document_number}.pdf` (e.g., `quotation-QT-2026-0042.pdf`)

A2.6. Update the documented behavior: emails are async now. If the document is "Send now" + immediate visibility needed, the UI shows "Queued — will deliver within a few minutes" not "Sent."

A2.7. Tests:
- Mock Resend client; assert handler updates email_delivery_log correctly on success/failure
- Rate-limit retry: assert pg-boss retry config triggers re-queue on RATE_LIMITED
- Concurrent job processing: 10 emails queued, verify all transition to 'sent' with no double-sends
- Tenant isolation: queueEmail from tenant A cannot read tenant B's email_delivery_log rows

COMMIT 14b: `feat(email): chunk b — pg-boss outbound worker + Resend client (closes R.13)`

CHUNK 14c — Inbound webhook: signature verification + event processing
---------------------------------

A3.1. Create apps/web/app/api/webhooks/resend/route.ts — Next.js Route Handler for POST:
   - Read raw body (NOT JSON.parsed — needed for signature verification)
   - Read 'svix-id', 'svix-timestamp', 'svix-signature' headers (Resend uses Svix for webhooks)
   - Verify signature using RESEND_INBOUND_WEBHOOK_SECRET:
     - Use the 'svix' npm package (Resend's recommended verification library)
     - On verification failure: return 400, log to webhook_events with signature_verified=false
     - On verification success: log to webhook_events with signature_verified=true, then process

A3.2. Event processing (apps/workers/src/email/inbound-handler.ts):
   - Event types from Resend: 'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.complained', 'email.bounced', 'email.opened', 'email.clicked', 'email.failed'
   - For each event:
     1. Extract provider_message_id from payload.data.email_id
     2. Find email_delivery_log row by provider_message_id (no tenant_id needed; provider_message_id is globally unique)
     3. Update appropriate timestamp + status:
        - 'email.delivered' → delivered_at, status='delivered'
        - 'email.bounced' → bounced_at, bounced_type, bounced_reason, status='bounced'
        - 'email.complained' → complained_at, status='complained'
        - 'email.opened' → opened_at (first only; subsequent opens just update last_event_at)
        - 'email.clicked' → clicked_at (first only)
     4. Always update last_event_at + last_event_type
     5. Write audit log entry (system-attributed, since webhook isn't user-initiated)

A3.3. Webhook handler processes synchronously for now (low volume; deferred async processing is Phase 2). Mark webhook_events.processed_at when done.

A3.4. Replay protection: webhook_events has an implicit dedup via Resend's event id in payload — if the same event id arrives twice, second insert fails (add UNIQUE (provider, payload->>'id') constraint).

A3.5. Tests:
- Signature verification: valid payload accepted, tampered payload rejected
- Replay: same event submitted twice — second returns 200 but doesn't double-update
- Event processing: each event type produces correct email_delivery_log update
- Unknown event type: logged but doesn't crash
- Webhook for unknown provider_message_id: logged with processing_error, returns 200 (don't tell sender we don't recognize their event — security)

A3.6. Local dev setup: document in SETUP.md how to expose the webhook endpoint to Resend during local development:
   - Option A: ngrok tunnel (recommended) — instructions for ngrok install + tunnel command
   - Option B: deploy to a preview environment
   - Option C: skip webhooks locally; test against staging in Stage D

COMMIT 14c: `feat(email): chunk c — inbound webhook with signature verification (closes A.10)`

CHUNK 14d — Validity-expiry cron + tests + closeout
---------------------------------

A4.1. Quotation/PI validity expiry job:
   - Day 8 schema has quotations.valid_until + status. When that date passes and status is still 'sent', status should transition to 'expired'.
   - Same for PIs (Day 11 — though PIs typically confirm fast, expiry exists for abandoned ones).
   - Create apps/workers/src/jobs/validity-expiry.ts:
     - Scheduled pg-boss job, runs daily at 02:00 IST
     - Selects quotations where status='sent' AND valid_until < CURRENT_DATE, batch-updates to 'expired'
     - Same for performa_invoices
     - Logs count of expirations per tenant per run
   - Wire scheduling: pg-boss has built-in cron support via boss.schedule()

A4.2. PDF cleanup job:
   - generated_documents rows with storage='inline' AND created_at < (now - 30 days): purge the base64 payload (set storage_ref=null, add storage_ref_purged_at)
   - Daily at 03:00 IST
   - Keeps audit history (row stays) but reclaims space

A4.3. Tests:
- Validity expiry: seed quotations with past valid_until in 'sent' state; run job; assert they transition to 'expired'
- Validity expiry idempotency: run twice; second run is no-op
- PDF cleanup: seed old generated_documents inline; run job; assert old ones purged, recent ones intact

A4.4. Email-end-to-end Playwright spec:
- Login, open a draft quotation, send it
- Poll email_delivery_log for the quotation: should appear with status='queued', transition to 'sent' (with mock Resend client returning success)
- (Webhook testing is integration-only — Playwright can't easily mock Svix headers; document this limitation)

A4.5. Documentation:
- Update docs/RUNBOOKS.md: "Setting up Resend webhook in production" + "Investigating a bounce" + "Why is an email stuck in 'sending'?"
- Update docs/DEPLOYMENT.md: add RESEND_INBOUND_WEBHOOK_SECRET to required env vars
- Update docs/WORKFLOWS.md: note that email is async now; UI shows "queued" not "sent"

A4.6. Closeout:
- pnpm preflight, verify (37/37 = 36 prior + 1 new), all gates green
- Mark B.14 ✅ + close R.13 in PROJECT_PLAN.md
- Mark A.10 ✅ closed
- Final commit: `feat(email): day 14 complete — async email + webhooks + validity expiry`
- Push

COMMIT 14d: as above

==========================================================
GUARDRAILS (DAY 14)
==========================================================

- Email is ASYNC now. No code path should await delivery before responding to user. UI surfaces "queued" status.
- RESEND_INBOUND_WEBHOOK_SECRET is server-only. NEVER expose via NEXT_PUBLIC_ env var.
- Signature verification on EVERY inbound webhook. Reject (return 400) on any verification failure. Log to webhook_events for forensics.
- Webhook endpoint is public (Resend calls it from their infrastructure) — but signature verification is the security boundary. No auth header needed; signature IS the auth.
- Webhook events are deduplicated by Resend's event id (UNIQUE constraint catches replay attacks).
- Audit log every status change on email_delivery_log even though triggered by webhook (system-attributed).
- Resend API errors classified: rate-limit → retry; invalid-email → fail permanently; blocked-domain → fail permanently. Don't infinitely retry on permanent failures.
- pg-boss retry config: retryLimit=5, retryBackoff=true (exponential).
- The PDF attachment for outbound email is loaded from generated_documents — same source the download flow uses. No double-rendering.
- Validity expiry runs daily. If skipped (worker down), next run catches up — it's just a batch update.
- All money columns still NUMERIC. (Not applicable today but standing rule.)

WHEN DONE:
- Print summary, 4 chunk commits
- Confirm: R.13 closed (inline email replaced), A.10 closed (webhook secret generated)
- Confirm: signature verification test demonstrates a tampered payload gets rejected
- Confirm: an end-to-end test sends an email through the pg-boss path and asserts email_delivery_log transitions
- Confirm: verify 37/37
- Tell me Day 14 is complete and Days 15+16 (Reports + Polish, batched per the structured plan) are next
```

### Verification checklist

#### R.13 closure (inline → async)

- [ ] Grep `apps/web/lib/email/` for direct Resend SDK calls — should be zero
- [ ] All email sends go through `queueEmail` which inserts into log + enqueues pg-boss job
- [ ] Worker handler in `apps/workers/src/email/handler.ts` does the actual send

#### A.10 closure (webhook secret)

- [ ] `RESEND_INBOUND_WEBHOOK_SECRET` in `.env.local`
- [ ] `.env.example` updated with placeholder
- [ ] `SETUP.md` documents the secret
- [ ] PROJECT_PLAN.md A.10 marked ✅

#### Signature verification (security boundary)

- [ ] Test exists for tampered payload → 400 rejection
- [ ] Test exists for valid payload → 200 + log update
- [ ] Test exists for replay (same event twice) → 200 but no double-update
- [ ] Webhook handler runs WITHOUT requiring user authentication (it's signature-verified instead)

#### End-to-end email flow

- [ ] Send a quotation from the UI as admin
- [ ] Check `email_delivery_log` — row appears with `status='queued'`
- [ ] Wait ~5-10 seconds — status should transition to `'sent'` with `provider_message_id` populated (if Resend API key is real and working) OR `status='failed'` (if running in dev without real key — acceptable as long as the flow ran)
- [ ] Email arrives in dealer.email inbox (if real Resend key configured) — Day 14 manual check

#### Validity expiry

- [ ] Run the expiry job manually: a seeded quotation with past `valid_until` and `status='sent'` should move to `'expired'`
- [ ] Job is idempotent (running again is no-op)

#### Invariant queries (production-scoped)

```sql
-- Every queued email eventually transitions (no permanent stuck queue)
SELECT status, COUNT(*) FROM email_delivery_log WHERE created_at < (now() - interval '1 hour') AND status IN ('queued', 'sending') GROUP BY status;
-- Expect: 0 rows (after a few minutes of running)

-- Webhook events have signature_verified=true except for known test failures
SELECT signature_verified, COUNT(*) FROM webhook_events GROUP BY signature_verified;
-- Expect: mostly/all 'true'; any 'false' rows are test fixtures
```

#### Automated

- [ ] `pnpm verify` 37/37
- [ ] All quality gates green
- [ ] B.14 ✅ + R.13 closed in PROJECT_PLAN.md

---

## Days 15 + 16 — Reports + Polish (Batched)

**Goal:** Day 15 ships the Reports module (sales summary, inventory valuation, outstanding receivables, tax reports) with CSV export. Day 16 ships the polish pass (empty states, loading skeletons, error boundaries, a11y audit, keyboard navigation, micro-copy improvements). Batched per the structured plan because both days are read-mostly composition of existing data.

**Estimated time:** 6–8 hours combined + ~45 min verification

**Deliverable:** Working `/reports/*` module with 4 reports + CSV exports + date-range filtering. Polished UX across all existing modules — every list has empty state + loading skeleton + error boundary. Keyboard nav works throughout. Lighthouse a11y score ≥ 95.

### Prompt for Claude Code

```
You are implementing Days 15 + 16 of the Dealerlink build, BATCHED. Day 14 shipped successfully (b8bf23b..b5681e3) — async email + webhooks. Days 15-16 are read-mostly: no new state machines, no money math beyond reading what's already computed, no concurrent operations. Both days fit one Claude Code run with 6 distinct chunks.

PRELIMINARY:
P.1. `pnpm preflight` — confirm 14 green.
P.2. Read CLAUDE.md §3 (stack — TanStack Table for dense data grids), §6 (GST — reports surface CGST/SGST/IGST breakdowns; do NOT recompute, read from stored columns).
P.3. Read DEVIATIONS.md — note DEV.33 (state format full names; reports group/filter by state with full names), DEV.45 (Day 13 seed pre-stamps; report counts should match this reality).
P.4. Read docs/STANDARDS.md (a11y baseline for Day 16), docs/DESIGN_SYSTEM.md (loading skeletons + empty states patterns).
P.5. Skim each existing module's list page (dealers, products, inventory, pipeline, quotations, PIs, orders, payments, dispatches). Day 16 polishes all of them consistently.

PRIMARY REFERENCES:
1. CLAUDE.md §6 (tax computations — REPORTS NEVER RECOMPUTE; always read stored columns)
2. BRD §8 (Reports requirements — list of expected reports)
3. docs/Distribyte.html — reports screen reference from prototype
4. docs/DESIGN_SYSTEM.md — empty/loading/error states existing patterns
5. Days 8-13 schemas — reports query these directly

==========================================================
TRACK A — DAY 15: REPORTS (3 chunks)
==========================================================

CHUNK 15a — Report query infrastructure + 2 reports
---------------------------------

A1.1. Create apps/web/lib/reports/ as the report query layer. Pattern:
   - Each report is a pure typed function: salesSummaryReport(tenantId, filters) → ReportResult
   - Reports compose SQL via Drizzle but expose typed inputs (date range, group-by, dealer filter)
   - Output shape: { columns, rows, totals, metadata } — meant to drive both UI tables and CSV exports

A1.2. REPORT 1 — Sales Summary
   - Source: quotations (sent/accepted), PIs (confirmed), orders (all statuses)
   - Filters: date range, status, dealer, prepared_by user
   - Group by: month, dealer, OR product (user picks one)
   - Columns: group key, count, subtotal sum, discount sum, tax sum (CGST+SGST+IGST), total sum, average deal size
   - Totals row at bottom

A1.3. REPORT 2 — Outstanding Receivables (Aging)
   - Source: orders where paymentStatus IN ('unpaid', 'partially_paid')
   - For each order: total - allocated = outstanding amount
   - Aging buckets: 0-30 days, 31-60 days, 61-90 days, 91+ days (calculated from orderDate vs today, modulo creditPeriodDays)
   - Group by: dealer (default) or aging bucket
   - Columns: dealer, total outstanding, by-bucket breakdown, oldest invoice date, days overdue

A1.4. UI scaffold for both reports:
   - app/(app)/reports/page.tsx — landing page with cards for each report
   - app/(app)/reports/sales-summary/page.tsx
   - app/(app)/reports/outstanding/page.tsx
   - Filter bar at top (date range picker, group-by dropdown, dealer typeahead)
   - TanStack Table for the data — sticky header, sortable columns, virtualized rows if >100 rows
   - Numbers in mono (IBM Plex Mono per design system), Indian formatting (1,27,200.00)
   - Loading state during filter changes (skeleton rows)
   - Empty state if no data: "No sales in this date range. Try broadening the filter."

A1.5. Tests for the two report query functions (snapshot-style — seed data produces known totals).

COMMIT 15a: `feat(reports): chunk a — sales summary + outstanding receivables`

CHUNK 15b — 2 more reports + CSV export
---------------------------------

A2.1. REPORT 3 — Inventory Valuation
   - Source: inventory_items WHERE status='in_stock' + procurements for cost basis
   - Per product: SKU, name, in-stock qty, last procurement cost, total valuation (qty × cost)
   - Total at bottom
   - Filter: product category, low-stock toggle (qty < reorder threshold)
   - Note: cost basis uses last procurement price (FIFO would be more correct but is Phase 2)

A2.2. REPORT 4 — GST Summary (the compliance-critical one)
   - Source: orders (confirmed/dispatched/delivered states only — pending orders are not "supplies" for GST purposes)
   - Filters: fiscal quarter (Apr-Jun, Jul-Sep, Oct-Dec, Jan-Mar per ADR-005), tax type (intra-state vs inter-state)
   - Per row: place_of_supply (state), supply type (intra/inter), taxable_amount sum, CGST sum, SGST sum, IGST sum
   - Group by place_of_supply state
   - Totals row matching what would go on GSTR-1 filing (Phase 2 will export to the actual GSTR-1 JSON)
   - CRITICAL: this report's numbers MUST match the underlying orders exactly. DO NOT recompute via @dealerlink/tax. READ stored values. If they don't match the engine's reading, that's a Day 9/11 bug to surface — but Day 15 surfaces it, doesn't fix it.

A2.3. CSV export:
   - Create apps/web/lib/reports/csv.ts — pure function: reportToCsv(result: ReportResult): string
   - Headers row from columns metadata
   - Each data row + totals row
   - Indian formatting preserved (e.g., "1,27,200.00" not "127200")
   - Numbers wrapped in quotes if they contain commas (CSV escaping)
   - Date format ISO (2026-05-16) for export portability
   - UTF-8 with BOM (Excel-friendly)

A2.4. "Download CSV" button on each report page:
   - Triggers a server action that runs the report query and returns the CSV
   - Filename: `{report-name}-{tenant-slug}-{date-range}.csv` (e.g., `sales-summary-demo-2026-Q1.csv`)

A2.5. UI for the 2 new reports + CSV button on all 4.

A2.6. Tests:
   - CSV escaping (commas in dealer names, quotes in product names, newlines in notes)
   - Each report's totals row arithmetic
   - GST summary parity check: SUM of stored cgst/sgst/igst across orders for a period == report's totals (no recomputation drift)

COMMIT 15b: `feat(reports): chunk b — inventory valuation + GST summary + CSV export`

CHUNK 15c — Dashboard widget refresh + role enforcement + seed-data sanity
---------------------------------

A3.1. Dashboard updates (/dashboard):
   - Replace placeholder report widgets (if any) with live links to the 4 reports
   - "Top dealer this month" widget — references sales summary report grouped by dealer
   - "Tax payable estimate" widget — references GST summary for current month
   - "Slow-moving inventory" widget — references inventory valuation report filtered to age > 60 days since procurement

A3.2. Role enforcement on /reports:
   - admin, accounts: full access to all 4 reports
   - sales: access to sales summary + outstanding only (not inventory valuation or GST summary)
   - dispatch: access to inventory valuation only
   - Server-side enforcement via tenantAction with role param; UI hides cards user can't access
   - verify-day-15.spec.ts asserts each role sees the right set

A3.3. Seed-data sanity:
   - Run all 4 reports against the existing seeded data and confirm reasonable outputs:
     - Sales summary for this fiscal year shows non-zero totals
     - Outstanding shows the 2 overdue orders from Day 12
     - Inventory valuation shows non-zero stock value
     - GST summary shows CGST/SGST/IGST totals matching the stored order columns
   - If any report returns empty or weird data, that's a seed gap; document if needed.

A3.4. Playwright verify-day-15.spec.ts:
   - Login as admin → see all 4 reports
   - Login as sales → see only 2 reports (sales summary + outstanding); GST summary returns 403 if hit directly
   - Run a report, change date filter, see results update
   - Download CSV, assert content-type and first row is the headers
   - Scope locators with SALES-2026-, OUTSTANDING-, etc. patterns if applicable

A3.5. Docs:
   - Update docs/WORKFLOWS.md with reports section
   - Add runbook entries: "Pulling a sales summary for a sales review meeting", "Generating GST summary at month-end", "Investigating a discrepancy between two reports"

COMMIT 15c: `feat(reports): day 15 complete — 4 reports + CSV + dashboard widgets`

==========================================================
TRACK B — DAY 16: POLISH PASS (3 chunks)
==========================================================

CHUNK 16a — Empty states, loading skeletons, error boundaries
---------------------------------

B1.1. Audit every list page in apps/web/app/(app)/ for these states:
   - Loading (first paint while data fetches)
   - Empty (query returned no rows — distinct from "no data exists" vs "filter excluded everything")
   - Error (query threw — network, RLS denial, etc.)
   - Pages to cover: dealers, products, inventory (items + procurements), pipeline, quotations, pi, orders, payments, dispatch, reports

B1.2. Shared components in apps/web/app/_components/:
   - <EmptyState icon="..." title="..." description="..." action={...} />
   - <LoadingSkeleton rows={5} columns={6} />  — matches table column structure
   - <ErrorState error={err} retry={fn} /> — shows safe error message, retry button, "report issue" link

B1.3. Apply consistently:
   - Empty state for "no data at all" is friendly (e.g., "No dealers yet. Add your first dealer to get started.") with a CTA
   - Empty state for "filter excluded everything" is informative (e.g., "No quotations match these filters. Try widening the date range.") with a "Clear filters" button
   - Loading skeletons match the actual table layout (same column count, similar widths) — no layout shift on data arrival
   - Error states never leak internals (no stack traces, no SQL errors); show a friendly message + retry

B1.4. Error boundaries at the page level:
   - app/(app)/error.tsx (Next.js convention) — catches any unhandled error in the app section
   - Logs to Sentry (Day 17 wires the actual Sentry client; today just call a placeholder logger that writes to console + audit_log)
   - Renders a friendly error page with "Go back" + "Reload" actions

B1.5. Tests:
   - Storybook-style component tests for EmptyState, LoadingSkeleton, ErrorState
   - Playwright: induce an empty list via filter, assert empty state shows
   - Playwright: simulate a network error (route mock), assert error state shows

COMMIT 16a: `feat(polish): chunk a — empty states, loading skeletons, error boundaries`

CHUNK 16b — Accessibility audit + keyboard navigation
---------------------------------

B2.1. A11y baseline target: Lighthouse score ≥ 95 on key pages (dashboard, dealers list, dealer detail, quotation builder, order detail).

B2.2. Run an automated a11y pass:
   - Use @axe-core/playwright or similar inside verify-day-16.spec.ts
   - For each key page, assert 0 'serious' or 'critical' violations
   - Common findings to fix proactively:
     - Missing alt text on images (logos, icons)
     - Color contrast (mono font on background — verify ratios)
     - Missing labels on form inputs
     - Buttons without accessible names (icon-only buttons need aria-label)
     - Focus indicators visible on all interactive elements

B2.3. Keyboard navigation audit:
   - Every page should be fully usable with keyboard only
   - Tab order is logical (top-to-bottom, left-to-right)
   - Focus visible on every focusable element (don't rely on browser default; ensure design system focus ring)
   - Modals trap focus (no escape to underlying page via Tab)
   - Escape key closes modals
   - Enter key submits forms
   - Skip-to-content link at the top of each page

B2.4. Form a11y:
   - Every input has an associated <label> (via htmlFor / id or wrapping)
   - Error messages reference the input via aria-describedby
   - Required fields marked with aria-required AND visible asterisk
   - Validation errors announced to screen readers (aria-live="polite")

B2.5. Tests:
   - verify-day-16.spec.ts runs axe on key pages
   - Manual checklist documented in docs/STANDARDS.md for future pages

COMMIT 16b: `feat(polish): chunk b — accessibility audit + keyboard navigation`

CHUNK 16c — Micro-copy + visual consistency + closeout
---------------------------------

B3.1. Micro-copy audit:
   - Walk every modal title, button label, confirmation message
   - Fix inconsistencies (e.g., "Save" vs "Update" vs "Submit" — pick one verb per action class)
   - Action labels say what happens (e.g., "Send quotation" not "Submit")
   - Destructive actions named clearly ("Cancel order" not "Delete order" if it's a soft cancel)
   - Empty values rendered as "—" (em-dash), not "null" or blank
   - Loading verbs in present continuous ("Generating PDF…" not "Generate")

B3.2. Visual consistency:
   - All money columns aligned right, mono font, 2 decimals
   - All status pills use the same shape, padding, font weight
   - All "row hover" interactions consistent (color + cursor)
   - All page heroes (title + status + actions) use the same vertical rhythm
   - Spot-check 3 modules side-by-side; if any feels different, normalize

B3.3. Final touches:
   - Favicon + apple-touch-icon for /
   - Document title tags for every page (e.g., "Quotation QT-2026-0042 · Dealerlink")
   - 404 page (app/not-found.tsx) — branded, with sensible action
   - 500 page (app/error.tsx) — already done in 16a but verify branded

B3.4. Tests:
   - verify-day-16.spec.ts adds: navigate to a non-existent route → 404 page renders
   - verify-day-16.spec.ts adds: every key page has a non-default <title>

B3.5. Closeout:
   - pnpm preflight, verify (40/40 = 37 prior + 2 day-15 + 1 day-16), all gates green
   - Mark B.15 ✅ + B.16 ✅ in PROJECT_PLAN.md
   - Final commit: `feat(polish): days 15-16 complete — reports + polish pass`
   - Push

COMMIT 16c: as above

==========================================================
GUARDRAILS (DAYS 15-16)
==========================================================

- Reports NEVER recompute taxes. Always read stored columns. Any drift between report and underlying data must be surfaced as a deviation, not silently fixed.
- Reports are READ-ONLY. No mutations from the reports module.
- CSV export is server-side, not client-side. Don't bundle large datasets to the client and convert in JS.
- Role enforcement on reports is BOTH server-side (tenantAction) and UI (cards hidden). Server is the security boundary; UI is courtesy.
- Loading skeletons match real table dimensions to prevent layout shift.
- Error boundaries never leak internal error details. Friendly messages only; log details to audit_log + Day 17's Sentry.
- A11y target is meaningful (Lighthouse ≥ 95, 0 critical axe violations) not aspirational. If a page can't hit it, document why in DEVIATIONS.md.
- Keyboard navigation is mandatory, not optional. Every flow must complete without a mouse.
- Micro-copy is part of the product, not an afterthought. Spend 15 minutes walking the app as a new user; fix anything that's awkward.

WHEN DONE:
- Print summary, 6 chunk commits total
- Confirm: 4 reports working, CSV exports correct, role enforcement tested
- Confirm: Lighthouse a11y ≥ 95 on 5 key pages (paste scores)
- Confirm: empty/loading/error states across all list pages
- Confirm: verify 40/40
- Tell me Days 15+16 are complete and Day 17 (Observability) is next
```

### Verification checklist

#### Reports correctness

- [ ] Open `/reports/sales-summary` — totals match a manual SQL count of `quotations` + `pis` + `orders`
- [ ] Open `/reports/outstanding` — outstanding amount matches `SELECT order_total - allocated_total FROM ...`
- [ ] Open `/reports/gst-summary` — sums match `SELECT SUM(cgst), SUM(sgst), SUM(igst) FROM orders WHERE confirmed/dispatched/delivered`
- [ ] Download a CSV, open in Excel/Google Sheets — opens cleanly, numbers preserved, headers correct

#### Role enforcement

- [ ] sales@demo.test → sees sales-summary + outstanding only
- [ ] dispatch@demo.test → sees inventory valuation only
- [ ] accounts@demo.test → sees all 4
- [ ] Direct URL to /reports/gst-summary as sales user → blocked

#### A11y

- [ ] Run Lighthouse in DevTools on dashboard, dealers list, quotation builder, order detail, payment list
- [ ] All five score ≥ 95 on accessibility tab
- [ ] Tab through dashboard with keyboard only — focus visible everywhere, logical order
- [ ] Open a modal, Tab cycles within modal, Escape closes

#### Empty/loading/error states

- [ ] Filter dealers list to non-existent name → empty state with "Clear filters"
- [ ] Throttle network in DevTools, reload a list page → loading skeleton matches eventual table layout
- [ ] Stop Postgres, reload a page → friendly error state with retry button (no stack trace shown)

#### Invariant: report numbers match stored data

```sql
-- GST summary parity (production-scoped)
SELECT
  SUM(cgst_amount) AS cgst_orders,
  SUM(sgst_amount) AS sgst_orders,
  SUM(igst_amount) AS igst_orders
FROM orders
WHERE order_number LIKE 'ORD-2026-%'
  AND status IN ('confirmed', 'partially_dispatched', 'fully_dispatched', 'delivered');
-- Compare to /reports/gst-summary totals for full FY. Must match.
```

#### Automated

- [ ] `pnpm verify` 40/40
- [ ] All quality gates green
- [ ] B.15 + B.16 ✅ in PROJECT_PLAN.md

---

## Day 17 — Observability (Sentry + Better Stack + Axiom)

_Will be added when Days 15+16 are complete. Day 17 wires the observability stack — Sentry for errors, Better Stack for logs/uptime, Axiom for structured event analytics, /health endpoint enrichment with DB/Resend/queue depth checks. Standalone day per the structured plan._

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
