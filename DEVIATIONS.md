# Build Deviations Log

Append-only record of intentional deviations from the daily build prompt spec.
Format: `## DEV.NN — Day N — short title`. Never edit historic entries; when
a deviation is resolved later, append a **new** RESOLVED entry referencing
the original DEV.NN.

Backfilled 2026-05-11 from session memories for Days 1–5; future days append
their own at end-of-day per `docs/BUILD_PROMPT_TEMPLATE.md`.

---

## DEV.01 — Day 1 — strict-peer-dependencies disabled

**Date:** 2026-05-10
**Spec said:** `strict-peer-dependencies=true` in `.npmrc`.
**Built:** `strict-peer-dependencies=false` + `auto-install-peers=true`.
**Why:** Next.js 14 + React 18 peer-dep tree doesn't resolve cleanly under strict mode; this is the documented pnpm + Next workaround.
**Impact:** None on functionality.
**Resolution:** None needed.

## DEV.02 — Day 1 — ESLint not in lint-staged on Day 1

**Date:** 2026-05-10
**Spec said:** lint-staged should run prettier + eslint in the pre-commit hook from Day 1.
**Built:** lint-staged ran prettier-only; eslint was added later.
**Why:** ESLint config wasn't fully shaped on Day 1; pushing it into the hook would have blocked all commits with rule-noise.
**Impact:** Minor — Day 2 added eslint to lint-staged. No bugs slipped through.
**Resolution:** Resolved Day 2.

## DEV.03 — Day 1 — `no-floating-promises` not on in hook scope

**Date:** 2026-05-10
**Spec said:** Engineering standards forbid floating promises (`@typescript-eslint/no-floating-promises`).
**Built:** Rule enabled in the root config but `parserOptions.project` not wired up workspace-wide, so type-checked rules don't run.
**Why:** Type-aware ESLint adds 5–10× runtime; chose to enable rule-by-rule as workspaces mature.
**Impact:** Floating promises caught manually + by Next's React 18 noise rather than ESLint.
**Resolution:** Tracked as a Phase 2 polish item — not blocking.

## DEV.04 — Day 1 — shadcn CLI not used

**Date:** 2026-05-10
**Spec said:** "Copy components into `components/ui/` via the shadcn CLI."
**Built:** Components are written by hand using the same primitives (Radix + cva + Tailwind).
**Why:** Faster than running the CLI's install flow for the small set of primitives we need now (button, input, badge, card, status-pill). CLI integrates cleanly when needed.
**Impact:** None.
**Resolution:** None needed.

## DEV.05 — Day 1 — tailwind-preset typed as `Record<string, any>`

**Date:** 2026-05-10
**Spec said:** Strict typing throughout — no `any`.
**Built:** `packages/design-tokens/src/tailwind-preset.ts` initially used `Record<string, any>` because Tailwind's `Config` type at the time leaked `unknown`.
**Why:** Tailwind's TS types resisted strict typing; quickest path forward.
**Impact:** Minor — leaked one `any` past the lint rule via override.
**Resolution:** Resolved Day 2 Phase 10 (tracked as R.6, since closed).

## DEV.06 — Day 2 — Two DB roles (`dealerlink_app` + `dealerlink`)

**Date:** 2026-05-11
**Spec said:** "The application sets `app.tenant_id` per request."
**Built:** Added a separate `dealerlink_app` role (NOBYPASSRLS) for the runtime client; kept `dealerlink` (superuser) for migrations + Lucia adapter.
**Why:** A superuser bypasses RLS, making isolation untestable in dev. Two roles enforce the same constraints in dev as prod.
**Impact:** `adminDb` export from `@dealerlink/db` must be used carefully — it bypasses RLS by design.
**Resolution:** Not a deviation per se; pattern is now load-bearing.

## DEV.07 — Day 2 — Permissive INSERT on `audit_log` + `auth_events`

**Date:** 2026-05-11
**Spec said:** Uniform `tenant_id = app_current_tenant()` policy on every table.
**Built:** `audit_log` and `auth_events` accept INSERTs from any role; reads stay tenant-scoped.
**Why:** Failed logins, audit triggers, and platform-operator events legitimately write outside any tenant context.
**Impact:** Writes are trigger-only or trusted server-side — no application code writes these directly.
**Resolution:** Documented in trigger + RLS comments; intentional.

## DEV.08 — Day 2 — Heartbeat writes inside a transaction

**Date:** 2026-05-11
**Spec said:** Heartbeat writes an `auth_events` row periodically.
**Built:** Wrapped in `db.transaction` with `app.tenant_id` set (also UPDATEs `users.last_auth_event_at` which is RLS-gated).
**Why:** Two writes that must succeed together or roll back together.
**Impact:** None.
**Resolution:** N/A.

## DEV.09 — Day 2 — Lazy DB proxy

**Date:** 2026-05-11
**Spec said:** Standard Drizzle client export.
**Built:** `db` + `adminDb` are Proxy objects that instantiate the real client on first property access.
**Why:** Next.js page-data collection runs during build with env vars missing; eager init would crash the build.
**Impact:** None.
**Resolution:** N/A.

## DEV.10 — Day 3 — Middleware runs Edge-only

**Date:** 2026-05-11
**Spec said:** "If Edge can't access Drizzle, set `runtime = 'nodejs'` in middleware.ts."
**Built:** Middleware is Edge-only with string-only host/query parsing; tenant + role checks happen in layouts.
**Why:** Next.js 14 middleware is Edge-only; the `nodejs` runtime flag for middleware is a Next 15+ feature.
**Impact:** Standard Next 14 pattern; no functional gap.
**Resolution:** N/A.

## DEV.11 — Day 3 — Subdomain gates enforced only in production

**Date:** 2026-05-11
**Spec said:** Middleware unconditionally gates `(app)/*` to tenant scope and `/admin/*` to operator scope.
**Built:** On localhost middleware skips the gate (no subdomain routing exists); layouts do auth-aware routing in dev.
**Why:** Localhost has no subdomains; unconditional enforcement would break the "log in as admin, land on /dashboard" flow.
**Impact:** Production behaviour matches spec; dev is permissive.
**Resolution:** N/A.

## DEV.12 — Day 3 — Impersonation tests in `packages/db/tests/`

**Date:** 2026-05-11
**Spec said:** `apps/web/tests/impersonation.test.ts`.
**Built:** `packages/db/tests/impersonation.test.ts`.
**Why:** The test exercises the Postgres trigger (`app.read_only` raises). It's a DB-contract test, not a web-app test. UI-level E2E will live in `apps/web/tests/e2e/`.
**Impact:** None; better test placement.
**Resolution:** N/A.

## DEV.13 — Day 4 — Playwright E2E deferred

**Date:** 2026-05-11
**Spec said:** `apps/web/tests/e2e/operator-onboarding.spec.ts`.
**Built:** `packages/db/tests/tenant-provisioning.test.ts` (9 integration tests covering the same flow at the DB-contract level).
**Why:** Playwright wasn't installed yet; full E2E bootstrap is its own day of work.
**Impact:** No UI-level happy-path verification.
**Resolution:** Day 6 installed Playwright + scaffolded verify specs (see DEV.21).

## DEV.14 — Day 4 — Plain-HTML email template (no react-email)

**Date:** 2026-05-11
**Spec said:** `apps/web/components/emails/TenantWelcomeEmail.tsx` via `@react-email/components`.
**Built:** `apps/web/lib/email/templates/tenant-welcome.ts` — string template with inline styles mapped to design tokens.
**Why:** `@react-email/components` not installed; the dep tree pulls in non-trivial weight for one template.
**Impact:** When the second template ships, react-email install pays off; porting is mechanical.
**Resolution:** Tracked as R.14; revisit when 2nd template ships.

## DEV.15 — Day 4 — Inline email dispatch (no pg-boss)

**Date:** 2026-05-11
**Spec said:** Dispatched as a pg-boss worker job with retries.
**Built:** `dispatchPendingEmails()` is called inline (fire-and-forget) from the tenant-create action; worker stub documents the pg-boss-ready shape.
**Why:** pg-boss not bootstrapped yet (Day 14).
**Impact:** Welcome email runs in-request; no retry on transient failure.
**Resolution:** Tracked as R.13; resolves on Day 14.

## DEV.16 — Day 4 — Base64 logo fallback (no DO Spaces yet)

**Date:** 2026-05-11
**Spec said:** Upload to DO Spaces if configured, else base64 fallback.
**Built:** Base64 path is the only path; DO Spaces creds deferred to Stage D.
**Why:** DO Spaces is a Stage D activation.
**Impact:** Logos are stored as data URIs in `tenant_settings.logo_url` until Stage D.
**Resolution:** Tracked as R.15; resolves in Stage D.

## DEV.17 — Day 5 — No tRPC; Server Components + query helpers

**Date:** 2026-05-11
**Spec said:** tRPC procedures for read paths.
**Built:** Typed query helpers in `apps/web/lib/queries/` called directly from Server Components.
**Why:** tRPC adds a router layer with no client-side fetcher to type for. Server Components already provide typed, server-side reads.
**Impact:** CLAUDE.md §3 updated; ADR-011 captures the rationale.
**Resolution:** Locked in ADR-011 (Day 5 / Day 6).

## DEV.18 — Day 5 — No virtualization on dealer/product lists

**Date:** 2026-05-11
**Spec said:** TanStack Virtual on long lists.
**Built:** Server-side pagination (PAGE_SIZE=50) without client virtualization.
**Why:** With 20–40 seeded rows, the perf budget is met. Virtualization requires a Client Component conversion that fights Server Components data flow.
**Impact:** Inventory list (500+ rows) is the first surface that genuinely needs it — assessed Day 6 and still preferred pagination for now (DEV.22).
**Resolution:** Tracked as R.16; reassessed Day 6 (see DEV.22).

## DEV.19 — Day 5 — Hand-rolled CSV parser (no PapaParse)

**Date:** 2026-05-11
**Spec said:** PapaParse client-side preview.
**Built:** `apps/web/lib/csv.ts` — quote/comma/newline handling, ~50 LOC.
**Why:** Avoids a 50KB dep for an admin-only operator surface.
**Impact:** None for current input shapes (Excel/Sheets exports).
**Resolution:** N/A.

## DEV.20 — Day 5 — Atomic CSV imports, no per-row error report

**Date:** 2026-05-11
**Spec said:** Per-row pass/fail table.
**Built:** Imports roll back on any failure; first conflict surfaces in the error message.
**Why:** Atomic semantics + no partial state. A row-by-row report would imply partial commits, which the spec also forbids.
**Impact:** Operators see one conflict at a time on retry.
**Resolution:** Tracked as R.17; surface a row identifier in Day 7/8 polish.

## DEV.21 — Day 6 — Playwright installed; chromium binary not auto-downloaded

**Date:** 2026-05-11
**Spec said:** "Install Playwright + `pnpm exec playwright install chromium`."
**Built:** `@playwright/test` added; `playwright.config.ts` + 6 verify specs scaffolded; chromium binary install left as a one-time manual step (`pnpm exec playwright install chromium`).
**Why:** Binary install needs network + ~200MB download per environment; not part of the repo checkout.
**Impact:** `pnpm verify` requires the user to run the install once.
**Resolution:** Documented in `docs/BUILD_PROMPT_TEMPLATE.md`.

## DEV.22 — Day 6 — Inventory list paginates instead of virtualizing

**Date:** 2026-05-11
**Spec said:** TanStack Virtual on inventory list (500+ rows).
**Built:** Server-side pagination (PAGE_SIZE=100). TanStack Virtual not added.
**Why:** Server Components + pagination keeps the page a pure SSR render. Virtualization needs a Client Component + client-side data fetch, which the rest of the codebase avoids. At 100 rows/page the perf budget is met.
**Impact:** When tenants reach ~10K serials and need to scroll-jump rather than page-jump, virtualize the row body inside the Server Component-rendered table shell.
**Resolution:** R.16 stays open; revisit when a real perf complaint arrives.

## DEV.23 — Day 6 — Worker dispatch still inline (pg-boss not yet)

**Date:** 2026-05-11
**Spec said:** N/A for Day 6 directly, but Phase A2 mentioned "worker render" patterns.
**Built:** Procurement workflow is fully synchronous; no worker enqueue.
**Why:** pg-boss + workers process bootstraps on Day 14 per the plan.
**Impact:** None — procurement actions are fast enough server-side.
**Resolution:** N/A (matches plan).
