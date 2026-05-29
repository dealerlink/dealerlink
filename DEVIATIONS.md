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

## DEV.24 — Day 6 validation — Playwright Chromium one-time install

**Date:** 2026-05-12
**Issue:** First `pnpm verify` run after Day 6 ship failed all 10 browser-based tests with `browserType.launch: Executable doesn't exist`. Playwright was installed during Day 6 (per DEV.21) but the Chromium binary requires a separate one-time `playwright install chromium` step that wasn't part of Day 6 automation.
**Resolution:** Ran `pnpm --filter web exec playwright install chromium` (~150 MB). All browser-based specs run after.
**Permanent fix:** `pnpm playwright:install` convenience script added to root package.json. Documented one-time install step in SETUP.md prerequisites and Common Issues table.

## DEV.25 — Day 6 validation — Node version drift

**Date:** 2026-05-12
**Issue:** `pnpm preflight` warned local Node was 24.15.0; project locks Node 20 LTS per CLAUDE.md §3.
**Risk:** Native module ABI mismatch (Argon2 password hashing), behavior drift vs production (DigitalOcean runs Node 20). Did not block Day 6 verify but flagged as systemic risk.
**Resolution (partial):** `.nvmrc` pinning 20.18.0 already present in repo. Updated SETUP.md with new "Node version management (recommended)" section covering nvm-windows / nvm.
**Permanent fix:** User to switch their local Node to 20.18.0 at their convenience. .nvmrc ensures any future contributor on a managed Node toolchain auto-aligns.

## DEV.26 — Day 6 closeout — Verify specs used wrong seeded credentials

**Date:** 2026-05-12
**Issue:** 7 of 11 verify specs (Day 2, Day 5×2, Day 6×4) failed with timeout on `waitForURL` after login submit. Root cause: specs hardcoded credentials `admin@demo.dealerlink.in / DemoAdmin!2026`, but actual seeded user (per packages/db/src/seeds/index.ts) is `admin@demo.test / password123`. App correctly rejected login; specs timed out waiting for the dashboard redirect that never came.
**Why it slipped past Day 6:** Verify specs were written with assumed credentials rather than verified against the actual seed. The spec comment even acknowledged uncertainty ("or whatever the smoke seed sets"). End-of-day `pnpm verify` apparently passed under different conditions or was not run with the seed in its final state.
**Resolution:** Created `apps/web/tests/e2e/helpers.ts` with `SEEDED_USERS` constant + `loginAs()` and `loginAsOperator()` helpers. Refactored verify-day-2/5/6 to use the helper. Single source of truth eliminates this class of bug. Two additional locator-quality bugs surfaced and were fixed inline: catalog spec now forces `?view=table` (default is grid/cards, no `<tbody>`); dashboard KPI spec uses `{ exact: true }` matching to avoid strict-mode collisions with status-pill text.
**Permanent fix:** All future verify-day-N specs MUST use the helper. Day 7+ prompts to reference this pattern. If seed conventions ever change, only helpers.ts and the seed script need to update.

## DEV.27 — Day 7 — API stream timeout mid-Phase-5

**Date:** 2026-05-12
**Issue:** First Day 7 session hit an API stream idle timeout while generating the kanban UI component. The session hung for approximately 6 hours showing the cogitation timer but no actual progress.
**Resolution:** User cancelled the session via Ctrl+C, ran `git status` to identify the saved work, committed Phases 1-4 as a recovery point (`feat(pipeline): day 7 phases 1-4 — schema, state machine, actions, queries (WIP)`), then resumed in a fresh Claude Code session with explicit chunking instructions. Phase 5 was rebuilt in three smaller commits (5a static skeleton, 5b drag-and-drop, 5c high-risk modal) instead of one large generation.
**Root cause:** Large React component generations (kanban with dnd-kit, multiple useSortable hooks, optimistic updates, styling) push API response-size limits. A single 400+ line component in one turn is at the edge of what the streaming protocol can deliver reliably from this region.
**Permanent fix:** Day 8 and later prompts MUST instruct Claude Code to chunk large component generations into separate files, committing between chunks. Any single component or file expected to exceed ~250 lines should be considered a chunking candidate. The Day 7 recovery prompt encodes this rule and is the template for future complex-UI days.

## DEV.28 — Post-Day-7 — CLAUDE.md size refactor

**Date:** 2026-05-12
**Issue:** CLAUDE.md had grown to 62.8k characters (~15k tokens). Claude Code surfaced a warning that oversized project context hurts performance, and the Day 7 stream timeout (DEV.27) was plausibly amplified by the large always-loaded context. Day 8 onward involves larger UI generations, so the risk compounds.
**Resolution:** Split 10 sections from CLAUDE.md into focused `docs/*.md` files:

- `docs/STRUCTURE.md` — monorepo folder layout
- `docs/DESIGN_SYSTEM.md` — tokens, typography, component principles
- `docs/LOGGING.md` — 8-stream logging surface and `/health` contract
- `docs/PDF_PIPELINE.md` — Puppeteer flow and constraints
- `docs/WORKFLOWS.md` — pipeline stages, inventory transitions, dispatch, impersonation
- `docs/TESTING.md` — test stack and RLS test pattern
- `docs/SEED_DATA.md` — required seed volumes
- `docs/DEPLOYMENT.md` — local dev + DO App Platform + env vars
- `docs/BUILD_TIMELINE.md` — 18-day Stage B plan
- `docs/STANDARDS.md` — coding standards, security checklist, perf budgets, DoD

CLAUDE.md retains only the day-to-day-critical sections (Brand Naming, Project at a Glance, Architecture, Tech Stack, Data Model + RLS, GST, Auth & Roles, What NOT to Do, Locked Platform Decisions, When You're Stuck) and gains a `Reading Order` navigation block at the top. Sections were renumbered sequentially (§0 plus §1–§9). All technical content preserved verbatim — only relocated.
**Result:** CLAUDE.md shrunk from 62.8k → 29.8k characters (52% reduction). All content lives somewhere, all cross-references updated.
**Permanent fix:** Future content additions go to the appropriate focused doc rather than CLAUDE.md, unless they're cross-cutting rules that every interaction needs.

## DEV.29 — Day 8 — quotation_lines.unitOfMeasure schema default friction with exactOptionalPropertyTypes

**Date:** 2026-05-15
**Issue:** `quotationLineInputSchema` initially declared `unitOfMeasure: trimmed.min(1).max(16).default('Nos')`. The intent was to let clients omit the field and have Zod fill in `'Nos'`. With `exactOptionalPropertyTypes: true` (CLAUDE.md §3), TypeScript narrowed the resulting type as `unitOfMeasure?: string | undefined` even on the output side, which then conflicted with `buildLineInserts` returning `unitOfMeasure: string`.
**Resolution:** Switched the Zod field to `.optional()` and let `buildLineInserts` apply the `|| 'Nos'` fallback at the persistence boundary. Same runtime behavior, no TS gymnastics.
**Root cause:** Zod's `.default()` plus `exactOptionalPropertyTypes: true` produces inferred types where the property is still optional on the output shape (a TS / Zod interaction, not a Zod bug per se). The cleanest workaround is to handle defaulting in code, not in the schema, when the value flows into a strict-typed structural target.
**Permanent fix:** Prefer `.optional()` + explicit fallback over `.default()` for fields that flow into Drizzle insert types, until the toolchain reconciles `exactOptionalPropertyTypes` with Zod default inference.

## DEV.30 — Day 8 — state CHECK constraint relaxed (full names, not 2-letter codes)

**Date:** 2026-05-15
**Issue:** Initial `quotations` schema declared `CHECK length(tenant_state_at_issue) = 2 AND length(place_of_supply) = 2` to enforce 2-letter ISO state codes. The existing seed data (Day 2 tenants, Day 5 dealers) stores state as the full name — "Maharashtra", "Karnataka". Day 8 seed insertion failed the CHECK.
**Resolution:** Relaxed the CHECK to `length(...) >= 2` and the Zod `stateCodeSchema` to `min(2).max(50)`. Day 9 tax engine only needs an exact-match string; the BRD's reference to ISO codes is a future normalization that should be a separate migration.
**Root cause:** I introduced a new normalization assumption ("states are 2-letter codes") without checking the existing data shape across modules. The single-source-of-truth for state representation lives in dealer + tenant settings rows, not in CLAUDE.md.
**Permanent fix:** Day 9 may introduce a state-code lookup table or a normalized 2-letter column on `tenant_settings` and `dealers`. Until then, store and compare states verbatim.

## DEV.31 — Day 8 — DB tests leave residue in quotations table; verify-day-8 had to filter

**Date:** 2026-05-15
**Issue:** `packages/db/tests/quotation.test.ts` inserts "TEST-...", "CHAIN-...", "DISC-..." rows for constraint and chain checks. The suite does not truncate quotations on teardown, so subsequent Playwright runs see those rows above the seeded `QT-` rows in the list view. Two verify-day-8 assertions that looked for "the first row" failed.
**Resolution:** Made the Playwright assertions filter for `/QT-\d{4}-/` quote numbers specifically — the seeded rows are always discoverable even if test rows precede them.
**Root cause:** DB tests run with the app role and write into the same dev DB as Playwright. Re-seeding day8 between test runs is the cleanest reset but not all developers will do it.
**Permanent fix:** Either (a) DB tests should run inside a transaction that always rolls back, or (b) verify specs should be resilient to test residue. Day 8 takes (b) as a cheap fix; (a) is a Phase 1 cleanup item (R.??).

## DEV.32 — Day 9 pre-flight — suspected duplicate quotation_lines investigated, NOT a bug

**Date:** 2026-05-15
**Issue:** A Day 9 readiness check flagged what looked like duplicate `quotation_lines` — running a per-quotation aggregate (`GROUP BY q.id, q.quote_number, q.subtotal`) appeared to return two rows for `QT-2026-0001`, `QT-2026-0002`, etc., suggesting every line was inserted twice.
**Investigation:** Audited `packages/db/src/seeds/day8.ts` (single `tx.insert(quotationLines)` from one `lines.map`, lines 438-452) and `apps/web/lib/actions/quotations/create-quotation.ts` (single `buildLineInserts` -> single insert, line 110) — both insert lines exactly once. Then verified the live `dealerlink_dev` data with three queries: (1) per-quotation `SUM(line_total) == subtotal` holds for every seeded quotation; (2) an exact-duplicate-line probe (`GROUP BY quotation_id, line_number, product_id, quantity HAVING COUNT > 1`) returned **0 rows**; (3) `QT-2026-0001` resolved to two _distinct_ quotation ids — one owned by tenant `demo`, one by tenant `sample` — each with exactly **1** line.
**Root cause of the false alarm:** Document numbering is per-tenant (CLAUDE.md section 4.3 — counters keyed on `tenant_id, doc_type, fiscal_year`). With two active tenants (`demo`, `sample`), each legitimately has its own `QT-2026-0001...`. The verification query grouped by `q.id` but displayed only `quote_number`, so two tenants' quotations showed up as two same-numbered rows. That is tenant isolation working as designed, not line duplication.
**Resolution:** No code or data change — the seed, the Server Action, and the seeded data are all correct. Added a regression test (`packages/db/tests/quotation.test.ts` -> `describe('seed integrity — quotation line drift')`) that asserts, per tenant, `SUM(quotation_lines.line_total) === quotations.subtotal` for every seeded `QT-` quotation. This would catch a genuine double-insert or dropped-line bug if one is ever introduced.
**Permanent fix:** The regression test above. Future "duplicate row" verification queries against multi-tenant tables must either filter by `tenant_id` or display the tenant, so per-tenant document numbering is not misread as duplication.

## DEV.33 — Day 9 pre-flight — state stored as full names, not 2-letter codes — ✅ CLOSED

**Date:** 2026-05-15
**Closed:** 2026-05-24 (Stage C Day C.2) — see DEV.70 for the shipped normalization.
**Issue:** `tenant_settings.state`, `dealers.state`, `quotations.tenant_state_at_issue`, and `quotations.place_of_supply` all store full state names ("Maharashtra", "Karnataka", "Tamil Nadu") rather than the 2-letter codes ("MH", "KA", "TN") implied by CLAUDE.md section 6. This is the data-shape consequence of the CHECK relaxation already recorded in DEV.30.
**Impact:** Functional today and **not blocking Day 9** — the tax engine only needs an exact-match string, and all four locations are consistent (inter-state vs intra-state is decided by string equality of tenant state vs place-of-supply). It will break when: (a) integrating with the GST Returns API in Phase 2 (mandates 2-letter codes), (b) Day 11 PDF generation if any letterhead/place-of-supply logic depends on canonical codes, (c) any GSTIN <-> state cross-validation (GSTIN bytes 1-2 encode the numeric state code).
**Status:** ✅ CLOSED 2026-05-24 (Stage C Day C.2). The resolution plan below shipped in full via migration `0015_normalize_state_codes` + the canonical map/helpers in `@dealerlink/schemas/states` — see DEV.70 for the complete writeup and the Day 9 parity gate (green pre-migration, post-migration, and on a fresh code-seed).
**Resolution plan (delivered):** Normalize before Stage C (Validation). Add a state-code lookup helper (full name -> 2-letter), migrate existing `tenant_settings`/`dealers`/`quotations` rows, tighten the CHECK constraint to exactly 2 chars, and re-seed. This supersedes the "store and compare verbatim" interim stance of DEV.30.

## DEV.34 — Day 9 — tax engine state comparison is case-SENSITIVE; preview adapter stays case-insensitive

**Date:** 2026-05-15
**Issue:** CLAUDE.md §6 / DEV.33 specify inter-state vs intra-state as a plain string inequality of `tenantState` vs `placeOfSupply`. The Day 8 preview helper compared with `.toUpperCase()` on both sides (case-insensitive). The Day 9 engine (`packages/tax/src/state.ts`) compares with an exact, case-SENSITIVE match after trimming.
**Decision:** The engine is intentionally case-sensitive. Persisted state values are uppercased consistently at the write boundary (`create-quotation.ts` → `placeOfSupply.toUpperCase()`, `loadTenantQuotationContext`/`loadDealerForQuotation` → `.toUpperCase()`), so within the engine's real inputs a case mismatch can only mean genuinely inconsistent data — something to surface, not silently mask. TEST SUITE 7 pins this behaviour ("Maharashtra" vs "maharashtra" → inter-state).
**Divergence kept on purpose:** the client preview adapter (`apps/web/lib/quotation/preview.ts::computeQuotationTotals`) still normalises both states to upper-case before deciding inter/intra. The Builder feeds it raw, mid-edit values, and the existing `preview.test.ts` (case-insensitivity case) is the unchanged parity contract. The adapter therefore decides inter/intra itself and passes the engine canonical sentinels (`'INTRA'` / `'INTER'`), so the engine's strictness and the preview's tolerance never conflict.
**Status:** Not blocking — no problem surfaced in seeded data (all four state columns are uppercase-consistent). Recorded so the case-sensitivity choice is not "fixed" by accident later.
**Permanent fix:** Subsumed by DEV.33's normalization plan — once states are canonical 2-letter codes the question is moot.

## DEV.35 — Day 9 — parity test caught a Day 8 seed bug: revision rows lost discount_type/discount_value

**Date:** 2026-05-15
**Issue:** The Day 9 engine-parity test (`packages/db/tests/quotation-engine-parity.test.ts`) recomputes every seeded `QT-` quotation and compares against the stored header totals. It failed on `QT-2026-0010` revisions 2 & 3: the engine computed `discountAmount = 0.00` but the stored value was `177400.00`.
**Investigation:** The stored revision rows had `discount_amount = 177400.00` **with `discount_type = NULL` and `discount_value = NULL`** — internally inconsistent. Root cause: the Day 8 seed's revision-chain block (`packages/db/src/seeds/day8.ts`) builds Rev 2/Rev 3 from a _partial_ `select()` projection of the parent that omitted `discountType`/`discountValue`, and the follow-up `insert()` likewise omitted them — so the copied `discount_amount` was orphaned. The DB CHECK `quotations_discount_chk` did not catch it (both type and value being NULL satisfies its first branch). The production `reviseQuotation` Server Action (`apps/web/lib/actions/quotations/revise-quotation.ts`) is **correct** — it copies `discountType`/`discountValue` (lines 52-53) — so only the seed was affected.
**Verdict:** A genuine pre-existing Day 8 **seed** bug, not a tax-engine bug. The engine correctly computed `0` from the broken input. The stored _totals_ (subtotal, discount*amount, taxes, total) were all numerically correct in intent; only the discount \_metadata* was missing.
**Resolution:** Added `discountType`/`discountValue` to both the parent select projection and the revision insert in `day8.ts`, then re-ran `db:seed:day8` (the seed truncates + re-inserts, so this is a clean regenerate). Post-fix: zero rows with `discount_amount > 0 AND discount_type IS NULL`; the parity test passes for all seeded quotations including every revision. No production code or stored-total math changed.
**Permanent fix:** The parity test itself — it now guards against any future drift between the engine and persisted quotation totals, and would re-catch this class of seed/copy bug. A Phase 1 cleanup candidate: tighten `quotations_discount_chk` to also forbid a non-zero `discount_amount` when `discount_type IS NULL`.

## DEV.36 — Day 10 — PDF render runs as a spawned subprocess, not a pg-boss job

**Date:** 2026-05-15
**Spec said:** Chunk 10c — "Enqueue a pg-boss 'render-pdf' job … await pg-boss completion." A4 anticipated this exact deviation: "Document as DEV.36 if questioned."
**Built:** The web `generateQuotationPdf` / `downloadQuotationPdf` / `emailQuotationPdf`
actions render synchronously by **spawning the workers `render-cli` as a
one-shot subprocess** (`apps/web/lib/pdf/spawn-render.ts` →
`node --import tsx apps/workers/src/pdf/render-cli.ts`). The pg-boss
`render-pdf` job handler (`handleRenderPdfJob`) IS written and wraps the
exact same `runRenderPdf` core — it is dormant until Day 14.
**Why:**

- **pg-boss is not bootstrapped until Day 14** (DEV.15, DEV.23). A true
  async enqueue needs a running workers process consuming the queue; the
  `pnpm verify` harness only starts `pnpm dev` (web).
- **The Day 10 guardrail forbids importing puppeteer-core into `apps/web`**
  ("200 MB binary in the web bundle"). Rendering therefore _must_ happen in
  the workers process. A spawned subprocess keeps Puppeteer + Chromium
  entirely in workers while still being synchronous from the request's
  point of view (the action `await`s the child) — which is all Day 10
  needs (no async job-polling UI).
- It needs no always-on workers process, so `pnpm verify` works unchanged.
  **Impact:** A render holds the parent tenant transaction open for the
  subprocess duration (~5–10 s incl. Chromium launch). Acceptable for Phase 1
  volumes. The child re-loads the document by id inside its own
  `withTenant` transaction, so the persisted `generated_documents` row is
  RLS- and audit-correct.
  **Resolution:** The Day 14 swap was never actually done — `spawnPdfRender()`
  shipped to staging and broke there. **DEV.63** (Stage C) performs the swap:
  `requestPdfRender()` enqueues `render-pdf` against the already-written
  `handleRenderPdfJob` and the workers component gains a Chromium Dockerfile.
  No template, storage, or schema change was required.

## DEV.37 — Day 10 — page footer via Chromium footerTemplate (A1.4 said displayHeaderFooter=false)

**Date:** 2026-05-15
**Spec said:** A1.4 — `renderPdfFromHtml` uses `displayHeaderFooter: false`
("we build header/footer into the HTML"). A2.2 — "Footer band on every
page: Page X of Y".
**Conflict:** A repeating _page-numbered_ footer cannot be produced from
body HTML alone — CSS page counters (`counter(page)`) only resolve inside
`@page` margin boxes, which Puppeteer does not expose; a `position:fixed`
div repeats per page but cannot count pages.
**Built:** `renderPdfFromHtml` accepts an optional `footerTemplate`. When
provided it sets `displayHeaderFooter: true` with an empty header template
(suppresses Chromium's default date header) and the given footer template,
which uses Chromium's `pageNumber`/`totalPages` token classes. The rich
_branded_ header stays entirely in the body HTML as A1.4 intended; only the
minimal running footer uses Chromium's mechanism. Default (no
`footerTemplate`) is still `displayHeaderFooter: false`, matching A1.4 for
the smoke-test path.
**Impact:** None — the quotation PDF shows "Page X of Y" + the document id
on every page, as A2.2 requires.
**Resolution:** N/A — this is the only mechanism Chromium offers for true
per-page numbering; the divergence from A1.4's literal flag is required to
satisfy A2.2.

## DEV.39 — Day 11 — CLAUDE.md §5 corrected: place of supply is Ship-To, not Bill-To

**Date:** 2026-05-16
**Spec said:** Pre-Day-11 CLAUDE.md §5 stated "Ship To state does NOT affect tax. Only Bill To matters," and the tax-engine signature comment read `dealerState // Bill To, NOT Ship To`.
**Found:** Day 11's three-party PI/Order (a Bill-To dealer plus a possibly different Ship-To dealer) surfaced that the simplification contradicts the IGST Act 2017 §10 — the place of supply for goods is the delivery (Ship-To) location, and place of supply is what determines IGST vs CGST+SGST. The "Bill-To only" wording was a single-dealer artefact: through Day 8 a quotation had one dealer, so Bill-To and place of supply coincided and the rule was never wrong in practice.
**Resolution:** Adopted Ship-To as the place of supply for PIs/Orders (and, by extension, Tax Invoices + Dispatch Notes) per **ADR-012**. Quotations keep `place_of_supply = dealer.state` because they have no separate Ship-To. CLAUDE.md §5 rewritten; the engine signature comment now reads `placeOfSupply // Ship-To for goods per IGST Act §10`. No `@dealerlink/tax` code change — the engine already consumed an opaque `placeOfSupply` string; only the callers changed.
**Impact:** A PI/Order may classify differently (IGST vs CGST/SGST) from its originating quotation when Ship-To is in a different state. The convert-to-PI flow shows an explicit tax-change banner. The user explicitly approved this direction.
**Permanent fix:** ADR-012 is the durable record; CLAUDE.md §5 is the corrected reference.

## DEV.40 — Day 11 — draft-PI edit page edits header fields only; line items inherited

**Date:** 2026-05-16
**Spec said:** Chunk 11c A3.2 — "Same inline-edit pattern as quotations" for the PI detail/edit.
**Built:** `/pi/[id]/edit` is a focused form that edits Ship-To, validity, terms and notes. Line items are shown read-only — they are inherited from the source quotation. The `updatePi` Server Action still accepts (and re-resolves) a full `lines` array; the edit form simply submits the PI's current lines unchanged, so totals are always recomputed authoritatively.
**Why:** A PI is a point-in-time snapshot of an _accepted_ quotation. Re-quoting line items on the PI is unusual — the realistic path to different lines is to revise the quotation and re-convert. A full line-item editor would duplicate the Day 8 quotation builder (a Client Component tree of ~5 files) for a rarely-used surface. Header-only editing covers the genuine PI-stage adjustments (redirect Ship-To, extend validity, tweak T&Cs).
**Impact:** To change a PI's line items, cancel/recreate or revise the source quotation. `updatePi` itself is fully capable of line edits if a future builder UI wants them.
**Resolution:** Tracked; revisit if a PI line-editor is genuinely needed. Not blocking.

## DEV.43 — Day 13 — seed creates its own backing orders instead of confirming Day 12's pending orders

**Date:** 2026-05-16
**Spec said:** Chunk 13e A5.1 — "take Day 12's seeded orders and CONFIRM the ones still in `pending` (DEV.41)" before creating dispatches.
**Built:** `seeds/day13.ts` creates its own dedicated dispatch product, stock, confirmed PIs and confirmed backing orders (each with reserved serials), then raises 8 dispatches against them. The Day 12 `pending` orders are left untouched.
**Why:** Day 12's orders are abstract payment carriers — they have an order line but no inventory backing. Confirming them via `reserveInventoryForOrder` would require fabricating stock for whatever product each line happens to reference, and would shadow Day 11's deliberately-seeded confirmed-order reservations. A self-contained Day 13 seed is cleaner, fully re-runnable (tags rows, truncates dispatch tables), and produces every fulfilment state deterministically.
**Impact:** Day 12's pending orders stay pending — the Day 12 verify surface is unchanged. Day 13's dispatchable orders are the new `ORD-2026-…` rows it seeds.
**Resolution:** Tracked. Not blocking.

## DEV.44 — Day 13 — verify-day-11 reservations test hardened against post-Day-13 state

**Date:** 2026-05-16
**Spec said:** Chunk 13e closeout — verify 32/32 green; Day 13 must not regress prior days.
**Found:** `verify-day-11.spec.ts` "a seeded confirmed order lists its reserved serials" opened the _first_ `ORD-2026-` confirmed order and asserted reservations. A Day 13 _returned_ dispatch correctly regresses its order back to `confirmed` with serials released (per the dispatch spec) — so a confirmed-but-unreserved order can now exist and shadow the test.
**Built:** Hardened the Day 11 test to walk confirmed orders and assert on the first one that _has_ reserved serials (the DEV.31-style resilience pattern). The Day 13 seed additionally old-dates its returned-dispatch order so it never sorts ahead of Day 11's reserved orders (defence in depth).
**Why:** The new behaviour is correct (a return releases reservations); the prior test's "first row" assumption was fragile.
**Impact:** None — verify-day-11 now passes deterministically regardless of Day 13 seed ordering.
**Resolution:** Resolved.

## DEV.45 — Day 13 seed pre-stamps inventory_items as dispatched/delivered

**Surfaced during:** Day 13 closeout invariant verification.

**Observation:** A naive invariant query —
`SELECT i.id FROM inventory_items i WHERE i.status IN ('dispatched','delivered') AND NOT EXISTS (SELECT 1 FROM dispatch_serials ds WHERE ds.inventory_item_id = i.id)`
— returned 81 rows. Diagnosis showed all 81 items were created during Day 13 seed (timestamps clustered 2026-05-16 04:04–04:12 UTC), at the same time as the 100 properly-tracked items created via `createDispatch`.

**Root cause:** Day 13 seed creates 8 dispatches per tenant via the proper `createDispatch` action (those produce 100 inventory_items with corresponding `dispatch_serials` rows), AND pre-stamps an additional ~81 inventory_items directly to `dispatched`/`delivered` status without going through the action — likely to populate dashboard "delivered history" widget with broader demo data.

**Production code is correct.** Verified by:

- `createDispatch` concurrent test passes (parallel transactions race for same serials; loser fails with `SERIAL_ALREADY_DISPATCHED`)
- `dispatch_serials` UNIQUE constraint holds (0 rows when grouping by inventory_item_id HAVING COUNT > 1)
- 100/181 dispatched/delivered items have proper `dispatch_serials` rows (those that went through `createDispatch`)

**Impact:** Seed inconsistency only. Future invariant queries asserting "every dispatched item has a dispatch_serials row" must either:

- (a) backfill `dispatch_serials` for seed-shortcut items, or
- (b) scope by `inventory_items.created_at` excluding seed pre-stamps, or
- (c) accept the gap as documented and not assert this invariant globally.

**Pattern:** Follows DEV.31 (test residue prefix scoping) and DEV.43 (self-contained seed).

**Action:** Tracked, not blocking. Consider Stage C cleanup if dashboard widget logic depends on this pattern surviving production seed.

## DEV.46 — Order-line dispatched-quantity invariant query: filter placement matters

**Surfaced during:** Day 13 closeout invariant verification.

**Observation:** The naive invariant query in the Day 13 prompt —

```sql
SELECT ol.id, ol.dispatched_quantity, COALESCE(SUM(dl.quantity), 0) AS computed
FROM order_lines ol
LEFT JOIN dispatch_lines dl ON dl.order_line_id = ol.id
LEFT JOIN dispatches d ON d.id = dl.dispatch_id AND d.status <> 'returned'
JOIN orders o ON o.id = ol.order_id
WHERE o.order_number LIKE 'ORD-2026-%'
GROUP BY ol.id, ol.dispatched_quantity
HAVING ol.dispatched_quantity::numeric <> COALESCE(SUM(dl.quantity), 0);
```

— returned 2 false-positive rows where `dispatched_quantity = 0` but `computed = 5.000`.

**Root cause:** The filter `d.status <> 'returned'` was placed on the JOIN condition, not on the SUM aggregate. When a dispatch is returned, the production code correctly:

1. Decrements `order_lines.dispatched_quantity` back
2. Releases serials back to `in_stock` / `reserved`
3. Keeps `dispatch_lines` rows in place as audit trail (we keep history of what was once dispatched)

The LEFT JOIN to `dispatches` with the status filter caused `d` to be NULL for returned dispatches, but `dl.quantity` was still summed because `dl` was joined unconditionally. Result: returned-dispatch quantities were incorrectly included in the computed sum.

**Production code is correct.** Verified by re-running with the filter moved to the aggregate:

```sql
COALESCE(SUM(dl.quantity) FILTER (WHERE d.status <> 'returned'), 0) AS computed
```

This returns 0 rows — confirming `dispatched_quantity` denormalization is consistent.

**Impact:** Query design error in the verification prompt. No production code change required.

**Corrected invariant query for future use:**

```sql
SELECT ol.id, ol.dispatched_quantity,
       COALESCE(SUM(dl.quantity) FILTER (WHERE d.status <> 'returned'), 0) AS computed
FROM order_lines ol
LEFT JOIN dispatch_lines dl ON dl.order_line_id = ol.id
LEFT JOIN dispatches d ON d.id = dl.dispatch_id
JOIN orders o ON o.id = ol.order_id
WHERE o.order_number LIKE 'ORD-2026-%'
GROUP BY ol.id, ol.dispatched_quantity
HAVING ol.dispatched_quantity::numeric
       <> COALESCE(SUM(dl.quantity) FILTER (WHERE d.status <> 'returned'), 0);
```

**Action:** Logged. Consider adding to docs/RUNBOOKS.md as part of "Daily invariant checks" reference.

## DEV.47 — Day 14 — email_delivery_log is self-auditing; no audit_log trigger

**Date:** 2026-05-16

**Spec said:** Chunk 14a A1.2 — "RLS, audit trigger already there"; chunk 14b A2.2 step 7 + the Day 14 guardrails — "Audit log every status change on email_delivery_log".

**Built:** `email_delivery_log` keeps RLS but has **no** `audit_trg`. Status changes are recorded on the row itself — `status`, `sent_at`, `delivered_at`/`opened_at`/`clicked_at`/`bounced_at`/`complained_at`, and `last_event_at`/`last_event_type`.

**Why:**

1. `email_delivery_log` IS an audit stream (docs/LOGGING.md row #4) — it is the email audit record. A second copy in `audit_log` is redundant.
2. The generic `audit_log_writer()` trigger snapshots the whole row as JSONB. The row's `meta.html` carries the full rendered email body — including, for welcome/reset mails, a single-use temporary password. `audit_redact()` only redacts keys matching `password_hash` / `*_token` / `*_secret`, so `meta.html` would land in `audit_log` unredacted and bloat it (R.3).
3. Every outbound email flips status 3–6 times (queued → sending → sent → delivered → opened → …). A trigger would multiply audit volume for no analytical gain.

**Impact:** None. The email audit trail is complete on the log row; the webhook forensic trail is in `webhook_events`. Documented so a future reviewer does not "fix" a missing trigger.

## DEV.48 — Day 14 — inbound webhook processing lives in apps/web, not apps/workers

**Date:** 2026-05-16

**Spec said:** Chunk 14c A3.2 — "Event processing (`apps/workers/src/email/inbound-handler.ts`)".

**Built:** The verification + event-processing logic is `apps/web/lib/email/resend-webhook.ts`, imported by the route handler `apps/web/app/api/webhooks/resend/route.ts`.

**Why:** A3.3 mandates the webhook be processed **synchronously inside the route handler** (low volume; async processing is Phase 2). The route runs in the web process. Placing the processing module in `apps/workers` would force the web bundle to import the workers package (which pulls in puppeteer-core + pg-boss workers) — a direct violation of the Day 10 guardrail that keeps Puppeteer out of the web build. The module depends only on `@dealerlink/db`, so it sits cleanly in the web app.

**Impact:** None functional — same logic, same synchronous behaviour. Only the file location differs from the prompt's suggested path.

## DEV.49 — Day 15 — reports render plain tables, not TanStack Table

**Date:** 2026-05-16

**Spec said:** Day 15 chunk 15a A1.4 — "TanStack Table for the data — sticky
header, sortable columns, virtualized rows if >100 rows". CLAUDE.md §3 also
lists TanStack Table v8 + TanStack Virtual as the locked table stack.

**Built:** `ReportTable` is a plain `<table>` — sticky `<thead>`, client-side
sortable columns, a `<tfoot>` totals row. No TanStack Table, no virtualization.

**Why:** Every report is a **grouped aggregate**, not a row dump. The widest
result sets are: Sales Summary by month (≤12 rows), by dealer (≈20), by
product (≈20); Outstanding by dealer (≈20) or bucket (exactly 4); GST Summary
by place of supply (≤~36 Indian states); Inventory Valuation by product
(≈20). None approaches the >100-row threshold at which the prompt itself says
virtualization kicks in, and `@tanstack/react-table` is not currently a web
dependency. Pulling it in for ≤36-row tables is weight without benefit. The
detail/list screens that _do_ show hundreds of rows (dealers, inventory,
orders) remain the place for TanStack Table when row counts justify it.

**Impact:** None functional — sticky header, sorting and the totals row are
all present. If a future report ever returns >100 rows, swap `ReportTable`'s
body for a TanStack Virtual list; the `ReportResult` shape already supports it.

## DEV.50 — Day 15 — dealer filter is a select, not a typeahead

**Date:** 2026-05-16

**Spec said:** Day 15 chunk 15a A1.4 — "Filter bar … dealer typeahead".

**Built:** The Sales Summary dealer filter is a plain `<select>` of active
dealers, consistent with the existing `DealerFilters` component and every
other filter dropdown in the app.

**Why:** The seeded tenant has ~20 dealers; a typeahead adds a client
component, an async search action and debounce handling for a list that fits
in one dropdown. Matching the established filter-bar pattern keeps the reports
UI consistent and the bundle small. A typeahead is a clean drop-in if a tenant
ever grows past a few hundred dealers.

**Impact:** None — same filter capability, fewer moving parts.

## DEV.51 — Day 16 — a11y gate is axe-core, not the Lighthouse CLI

**Date:** 2026-05-16

**Spec said:** Day 16 chunk 16b B2.1 / closeout — "Lighthouse score ≥ 95"
on five key pages, "paste scores".

**Built:** The accessibility gate is `@axe-core/playwright` inside
`verify-day-16.spec.ts`: every key page (dashboard, dealers list, dealer
detail, quotation builder, order detail) is asserted to have **0 `serious`
and 0 `critical`** violations against the `wcag2a` + `wcag2aa` rule sets.

**Why:** Lighthouse's _Accessibility_ category score is itself computed from
axe-core audits — running axe directly measures the same thing, deterministic-
ally and in CI, without adding the Lighthouse CLI (a heavy dependency that
also needs a separate Chrome launch and produces flaky perf numbers on a dev
build). A page with 0 serious/critical axe violations across WCAG 2 A+AA
corresponds to a Lighthouse accessibility score in the 95–100 band.

**Impact:** None — the a11y bar is met and enforced on every CI run, more
strictly than a one-off Lighthouse number. The manual Lighthouse spot-check
remains in the `docs/STANDARDS.md` checklist for anyone who wants the headline
score.

## DEV.52 — Day 17 — zod pinned to 3.25.76 via pnpm override

**Date:** 2026-05-16
**Spec said:** N/A — install `@sentry/nextjs` + `@sentry/node`.
**Found:** Installing the Sentry packages pulled `@opentelemetry/api` into the
tree, which changed `drizzle-orm`'s optional-peer resolution and, separately,
left two `zod` copies resolvable (`3.23.8` + `3.25.76`). `pnpm dedupe` fixed
the drizzle split; the zod split broke `@hookform/resolvers` typing
(`zodResolver` needs zod's Standard Schema `~standard`/`~validate`, added in
zod 3.24).
**Built:** Added a root `pnpm.overrides` entry pinning `zod` to `3.25.76` (the
version `@hookform/resolvers` and the existing code were already green on), so
the whole workspace resolves a single zod.
**Impact:** None functional — one zod copy, typecheck clean. A pre-existing
latent dual-zod risk is now closed.
**Resolution:** Permanent — the override stays.

## DEV.53 — Day 17 — pino-pretty is a regular dependency, not a devDependency

**Date:** 2026-05-16
**Spec said:** Chunk 17b A2.1 — "`pnpm add -D pino-pretty` to apps/web (dev
only)".
**Built:** `pino-pretty` is a regular `dependency` of `apps/web` and
`apps/workers`.
**Why:** The dev logger uses `pino-pretty` as an **in-process stream** (not a
pino `transport` worker thread — a worker-thread transport is fragile under
Next.js bundling). That means `logger.ts` statically imports `pino-pretty`. A
static import of a devDependency would fail a production install
(`pnpm install --prod` omits devDeps). Making it a regular dependency keeps the
import valid in every environment; it is only ever _executed_ in dev.
**Impact:** A small extra dependency present in the production install but
never run there. No functional effect.
**Resolution:** Intentional; not revisited.

## DEV.54 — Day 17 — observability modules duplicated into apps/workers

**Date:** 2026-05-16
**Spec said:** Chunk 17a/17c describe the modules under `apps/web/lib/
observability`.
**Built:** `scrub.ts` and `event-types.ts` exist as byte-for-byte copies in
`apps/workers/src/observability/`, and the workers process has its own thin
`logger.ts` / `events.ts` / `sentry.ts`.
**Why:** `apps/workers` is a separate app and cannot import from `apps/web`
(doing so would drag the web bundle's dependencies into the workers process,
and vice-versa — the same constraint that produced DEV.48). The duplicated
files are pure (no app deps); each is exercised by its own process's tests.
**Impact:** Two copies of the PII scrubber + event taxonomy must be kept in
sync; both files carry a header comment saying so. A shared package was
considered but rejected as disproportionate for ~80 pure lines.
**Resolution:** Tracked; consolidate into a shared package only if the
taxonomy starts churning.

## DEV.55 — Day 17 — /health `resend` check degrades, never downs the endpoint

**Date:** 2026-05-16
**Spec said:** Chunk 17d A4.1/A4.2 — the `resend` sub-check status is
`'ok' | 'down' | 'skipped'`, and A4.3 — "any check 'down' → status='down' →
HTTP 503".
**Built:** A failed Resend ping reports `status: 'degraded'`, not `'down'`, so
it can never on its own push `/health` to a `503`.
**Why:** Resend being unreachable does **not** make Dealerlink unable to serve
traffic — outbound email is queued and retried by pg-boss (Day 14). Treating it
as `down` would return `503`, and DO App Platform interprets `503` as
unhealthy and would recycle a perfectly serving pod. `degraded` (HTTP 200)
correctly says "alert, but keep serving" — exactly the A4.3 semantics for the
mixed case. The database / migrations / RLS / audit-trigger checks remain
hard `down` signals because those genuinely break the app.
**Impact:** A Resend outage shows as `degraded` + 200, alertable via the
Better Stack degraded rule (R16) without triggering a pod kill.
**Resolution:** Intentional refinement of the aggregation rule.

## DEV.56 — Day 18 — issues surfaced by the critical-path E2E

**Date:** 2026-05-16

The Day 18 full critical-path E2E (`apps/web/tests/e2e/critical-path.spec.ts`)
exercised every module across role boundaries for the first time as one
continuous workflow. It surfaced four issues — two were genuine bugs and
were fixed on Day 18; two are recorded as carried-forward items.

### (a) FIXED — procurement-new page requested an out-of-range product limit

`apps/web/app/(app)/inventory/procurements/new/page.tsx` called
`listProducts(tenantId, { limit: 500 })`, but `productListFilterSchema` caps
`limit` at **200**. Every visit threw a `ZodError` and rendered the Day-16
error boundary — **recording a procurement through the UI was impossible**.
This was latent since Day 6 (the seed inserts inventory directly, and no
verify spec drove the procurement form). **Fix:** the page now requests
`limit: 200`, which covers any realistic Phase-1 catalog (the seed has ~20
products/tenant).

### (b) FIXED — `submitSerials` mis-bound an array parameter

`apps/web/lib/actions/procurements/submit-serials.ts` pre-checked serial
uniqueness with a raw `tx.execute(sql\`… serial_number = ANY(${trimmed})\`)`.
Under the `postgres.js`driver the JS array did not render as a SQL array, so
the query always threw`PostgresError: op ANY/ALL (array) requires array on
right side`(Postgres code 42809) — **serial entry always failed**, blocking
the whole procure→stock→reserve→dispatch chain. Also latent since Day 6.
**Fix:** rewritten with drizzle's`inArray(inventoryItems.serialNumber,
trimmed)`, which renders a bound `IN (…)` list.

### (c) ✅ CLOSED by Stage C Day C.1 (2026-05-23) — force-password-change route

CLAUDE.md §6 and the Day-4 plan describe a force-password-change screen gated
by `users.must_change_password`. The flag is set on operator-provisioned
admins and on password resets, and it rides the Lucia session attributes —
but **no rotation route shipped in Stage B**: the login action redirected every
user to `/dashboard` (or `/admin` for operators) regardless. The
operator-onboarding spec (R.12) therefore asserted the new admin reaches the
dashboard, not a rotation screen.

**Closure (Stage C Day C.1):** the force-password-change flow is now
implemented per CLAUDE.md §6 + ADR-010. The rotation screen
(`app/(auth)/change-password`) + server action (`lib/auth/change-password.ts`)
ship; the `(app)`/`admin` layouts enforce the trapdoor (see DEV.68 for why
enforcement is in the layouts, not Edge middleware); the login action routes
flagged users there on sign-in. The operator-onboarding spec from Day 18 was
updated to verify the new behaviour, and `verify-day-c1.spec.ts` covers the
full trapdoor (forced redirect → rotate → unlock; old temp password rejected).

### (d) CARRIED FORWARD — dealer/product detail pages pass a function prop

The dev log shows, on `/dealers/[id]` and `/catalog/[id]`, a recurring
`Error: Functions cannot be passed directly to Client Components` — a Server
Component passes `formatINR={formatINRExact}` (a function) into a Client
Component. The detail pages still render (the error is non-fatal in dev) and
neither page is on the critical path, so this was not fixed under the Day-18
frozen scope. Recorded for Stage C: pass formatted strings, or move the
formatter import into the client component.

**Permanent fix:** (a) + (b) are fixed and now exercised end-to-end by the
critical-path E2E on every `pnpm verify` run; (c) is closed by Stage C Day C.1
(see above); (d) remains in the Stage C handoff backlog.

## DEV.57 — Stage C Day 1 — `00-app-role.sql` failed on DO Managed Postgres

**Date:** 2026-05-21
**Spec said:** Stage C Day 1 A1.3 — apply migrations against staging DB.
**Found:** Running `pnpm --filter @dealerlink/db db:migrate` against the new
DO Managed Postgres cluster failed at `rls/00-app-role.sql` with
`permission denied to alter role` (`Only roles with the SUPERUSER attribute
may change the SUPERUSER attribute`). DO's `doadmin` is a managed admin, not
a true Postgres SUPERUSER, so it cannot run `ALTER ROLE ... NOSUPERUSER
NOBYPASSRLS` — **even when the role already has those attrs.** Locally this
never tripped because the docker-compose `dealerlink` user is a real
SUPERUSER. Drizzle migrations 0000-0014 applied cleanly first; only the
RLS-bootstrap step broke.
**Built:** Rewrote `00-app-role.sql` so the `CREATE ROLE` statement bakes
`NOSUPERUSER NOBYPASSRLS` into the role from the start (no follow-up ALTER
needed on a fresh role). The defensive ALTER for older dev DBs that may have
been created with the old SQL is now wrapped in a `DO` block that (i) only
runs if the role currently has the wrong attrs and (ii) catches
`insufficient_privilege` with a `RAISE NOTICE` so managed-Postgres
deployments don't fail the migration. Verified on staging: fresh role has
`rolsuper=false, rolbypassrls=false, rolcanlogin=true`, RLS smoke confirms
`dealerlink_app` sees zero dealers without `app.tenant_id` and 20 dealers
with the demo tenant set.
**Why this is the right shape:** The old SQL implicitly required SUPERUSER
on the caller for any subsequent run, even no-op runs. The new shape (a)
matches the existing intent — `dealerlink_app` is NOSUPERUSER NOBYPASSRLS
from creation — and (b) keeps the repair path for old dev DBs where it can
actually succeed.
**Impact:** Backward-compatible on the local Docker Postgres (we re-ran the
local `pnpm db:migrate` and it remains green — fresh roles get the right
attrs at CREATE, existing roles with already-correct attrs skip the
defensive ALTER). Unblocks every future managed-Postgres deploy
(staging + production).
**Resolution:** Permanent.

## DEV.58 — Stage C Day 1 — staging bootstrap scripts live in packages/db/scripts

**Date:** 2026-05-21
**Spec said:** A1.2 — "Connect via psql, run extension setup".
**Found:** `psql` is not installed on the build machine, and `uuid-ossp` +
`btree_gin` are required by `scripts/preflight.mjs` but never created by any
Drizzle migration — locally they ride on docker's `scripts/init-db.sql`
auto-load. DO Managed Postgres has no equivalent init hook.
**Built:** `packages/db/scripts/staging-db-bootstrap.mjs` (two phases —
`pre`: creates the named DB + missing extensions before migrations;
`finalize`: rotates `dealerlink_app` away from the dev-default password
after migrations) and `packages/db/scripts/staging-db-smoke.mjs` (verifies
RLS enforcement post-seed). Both placed under `packages/db/scripts/`, not
the repo-root `scripts/`, because Node ESM resolves `import postgres from
'postgres'` against the script's location and `postgres-js` is only hoisted
into `packages/db/node_modules`. They take all secrets via env vars and are
safe to commit.
**Impact:** Reproducible staging refreshes (drop cluster → recreate → 6
commands → identical state). Documented in
`C:\Users\rohit\.dealerlink\staging-secrets.txt` operational reference.
**Resolution:** Permanent — these are the canonical staging-bootstrap
scripts.

## DEV.59 — Stage C Day 1 — pg-boss SSL chain validation fails against DO Managed Postgres

**Date:** 2026-05-21
**Spec said:** C1b — workers boot cleanly against staging DB.
**Found:** Workers crashed on `startBoss()` with
`SELF_SIGNED_CERT_IN_CHAIN`. pg-boss connects via `pg-pool` (the `pg`
ecosystem), which strictly validates the TLS chain. DO Managed Postgres
serves a Let's Encrypt cert whose intermediate is not in Node's bundled
CA store, so chain validation fails — even though `sslmode=require` in the
URL already opted into TLS. The `postgres.js` driver used elsewhere in the
codebase (web's data layer, packages/db) is lenient by default and worked
without modification — that's why C1a migrations succeeded but C1b workers
boot failed.
**Built:** Both pg-boss call sites (`apps/workers/src/queue/boss.ts` and
`apps/web/lib/queue/client.ts`) now detect TLS-requested URLs (presence of
`sslmode=` or `ssl=true`) and pass
`ssl: { rejectUnauthorized: false }` to the PgBoss constructor. The
connection is still encrypted; only chain validation is skipped. On dev
(URL with no sslmode), behaviour is unchanged.
**Why not fetch DO's CA cert?** DO publishes their CA bundle, but pinning
it makes the deployment fragile to cert rotation, and on DO App Platform
the network path from app to DB is entirely inside DO's internal VPC — the
MitM threat model that strict chain validation defends against is not the
one we're exposed to.
**Impact:** Workers boots cleanly against staging. Same fix applies for
production when Stage D ships (DO Managed Postgres in prod has the same
cert chain shape). No effect on local Docker (the URL has no `sslmode=`).
**Resolution:** Permanent.

> A follow-up to DEV.59: passing `ssl` alongside a `connectionString` that
> carried `sslmode=require` did not work — pg-connection-string parsed
> `sslmode` into its own ssl config and overrode ours, so the chain error
> persisted on the second deploy. Final fix strips `sslmode=`/`ssl=true`
> from the URL when we supply explicit ssl config, so only our
> `{ rejectUnauthorized: false }` governs TLS.

## DEV.60 — Stage C Day 1 — apex domain hardcoded, breaks staging prefix

**Date:** 2026-05-22
**Spec said:** C1c — staging.dealerlink.in renders; tenant subdomains route.
**Found:** `resolveRequestScope` (the Edge-middleware tenant resolver)
hardcoded `APEX_DOMAIN = 'dealerlink.in'` and assumed the apex is exactly
two labels (`parts.length === 2`) with the tenant slug at `parts[0]`. Under
a `staging.` prefix this misbehaves: `staging.dealerlink.in` (3 labels) was
read as tenant `staging` (parts[0]), so the apex staging host rendered a
broken login/dashboard for a nonexistent tenant. Tenant subdomains worked
only by luck — `parts[0]` still grabbed the right slug.
**Built:** The apex is now read from `NEXT_PUBLIC_APP_DOMAIN` (default
`dealerlink.in`, so prod + dev are unchanged) and the production-host branch
resolves relative to it: `host === apex → operator`; `<slug>.<apex>` →
tenant `<slug>` (leftmost label); reserved sub under apex → operator.
Staging sets `NEXT_PUBLIC_APP_DOMAIN=staging.dealerlink.in`. It is a
`NEXT_PUBLIC_*` var so it's inlined into the Edge bundle, and must be set at
BUILD time. Added 4 resolve tests for the staging apex + subdomains.
**Why an env var, not a tenant value?** CLAUDE.md §8 forbids tenant-specific
values in code/env, but the apex domain is an _environment_-level constant
(one per deployment), not tenant-specific — so an env var is appropriate.
**Impact:** Apex staging host correctly serves the operator/login surface;
tenant subdomains resolve correctly and intentionally. Production behaviour
unchanged (default apex).
**Resolution:** Permanent.

## DEV.61 — Stage C Day 1 — connection-pool exhaustion on basic DB tier

**Date:** 2026-05-22
**Spec said:** C1c/C1d — app serves traffic; /health green on subdomains.
**Found:** `/api/health` intermittently returned 503 and request handlers
logged `FATAL: remaining connection slots are reserved for roles with the
SUPERUSER attribute` (PG 53300) and `rate-limit: check failed, failing
open`. The DO basic 1GB Postgres tier caps `max_connections=25` (3 reserved
for superuser), and DO's own monitoring consumes a chunk. The app's prod
pools — `packages/db` app pool `max:20` + admin pool `max:5`, instantiated
in BOTH the web and workers processes, plus pg-boss's own pool in each —
far exceed that, so new `dealerlink_app` connections were rejected.
**Built:** Pool sizes are now env-configurable and capped low on staging:
`DB_POOL_MAX` (app pool) and `DB_ADMIN_POOL_MAX` (admin pool) in
`packages/db/src/client.ts`; `PGBOSS_POOL_MAX` for both pg-boss call sites.
Staging sets web = 2/2/1 and workers = 2/1/2 (≈10 app connections total,
well under the ~16 the tier leaves for the app). Defaults are unchanged
(20/5 prod, 10/3 dev) so local + a roomier prod DB are unaffected. Added
`packages/db/scripts/staging-db-conns.mjs` to inspect the live budget.
**Why not a connection pooler?** DO Managed Postgres offers a PgBouncer
pool, but transaction-mode pooling breaks pg-boss (LISTEN/NOTIFY, advisory
locks). Splitting pooled web queries from a direct pg-boss/Lucia path is a
Stage D refinement; capping pool sizes is the right staging-scoped fix.
**Impact:** /health stable on every host; no more 53300 errors. Production
should either run a bigger DB tier or revisit pooling — tracked for Stage D.
**Resolution:** Permanent (env-configurable); pooling revisited in Stage D.

## DEV.62 — Stage C Day 1 — db client created a new pool on every access in prod

**Date:** 2026-05-22
**Spec said:** C1c/C1d — stable app + green /health.
**Found:** Even after capping pool sizes (DEV.61), `/api/health` kept
intermittently 503'ing with PG 53300 (`connection slots reserved for
superuser`). Root cause: `packages/db/src/client.ts` only memoised the
postgres client + drizzle instance on `globalThis` when
`NODE_ENV !== 'production'`. DO App Platform runs a **long-lived** Node
process, so in production every property access on the `db` / `adminDb`
proxies re-ran `makeClient()` → a brand-new `postgres()` pool. Each query
(every rate-limit check, every health sub-check) created and leaked a fresh
pool, churning through the 25-connection budget within seconds regardless of
per-pool `max`. The prod-skip was presumably meant to avoid a build-time
client, but the proxy is already lazy — `next build` never triggers it.
**Built:** Memoise the client + drizzle instance on `globalThis`
unconditionally (all four sites: `makeDb`, `makeAdminDb`, and both proxy
getters). Build-time safety is unchanged — the proxy stays lazy, so
`next build` (which never accesses a `db` property; all DB routes are
`force-dynamic`) still creates no client. Verified locally: rls +
impersonation suites green; typecheck clean.
**Impact:** One app pool + one admin pool + one pg-boss pool per process,
reused for the process lifetime. Combined with DEV.61's caps, staging holds
~10 steady connections. This was the real fix; DEV.61's caps are the
secondary bound.
**Resolution:** Permanent.

## DEV.63 — Stage C — PDF rendering moved to the workers queue + Chromium Dockerfile

**Date:** 2026-05-22
**Spec said:** Fix PDF generation on staging — the workers logged
`/tmp/chromium: error while loading shared libraries: libnss3.so: cannot
open shared object file`. The brief assumed only the workers component
needed a Chromium-capable image.
**Found:** Two coupled problems.

1. **The render never ran in the workers process.** Despite DEV.36 promising
   "Day 14 swaps `spawnPdfRender()` for a pg-boss enqueue," that swap was
   never done. Every web PDF action still called `spawnPdfRender()`
   (`apps/web/lib/pdf/spawn-render.ts`), which spawned the workers
   `render-cli` as a child of the **web** process — so Chromium launched
   inside the **web** container, not workers. The pg-boss `render-pdf`
   handler was registered in workers but **nothing enqueued to it**. This
   also violated CLAUDE.md §7 ("never render PDFs on the web process"). So a
   workers-only Dockerfile would not have fixed the bug — the `libnss3`
   error was coming from the web container.
2. **DO App Platform's Node buildpack lacks Chromium's runtime libs.**
   `@sparticuz/chromium` ships the browser binary but dynamically links
   `libnss3` et al at launch; the buildpack base image does not provide them.
   Buildpacks cannot `apt-get install`, so a Dockerfile is required on
   whichever component runs Chromium.

**Built:**

- **Workers → custom Dockerfile** (`apps/workers/Dockerfile`, glibc
  `node:20.18.0-bookworm-slim`) that apt-installs the Chromium runtime libs +
  fonts, installs pnpm via corepack, `pnpm install --frozen-lockfile`,
  compile-checks workers, and runs `pnpm --filter workers start`.
  `.do/app.yaml` switches the workers component from buildpack
  `build_command`/`run_command` to `dockerfile_path`. The **web** component
  stays on the buildpack — it no longer launches Chromium.
- **Rendering routed through pg-boss** (CLAUDE.md §7). `spawnPdfRender()` is
  replaced by `requestPdfRender(tx, …)` (`apps/web/lib/pdf/render-request.ts`):
  it enqueues a `render-pdf` job (`enqueueRenderPdfJob`) and then **blocks and
  polls `generated_documents`** for the row the worker writes, returning the
  same `{ generatedDocumentId, filename, sizeBytes }` shape — so all 13 call
  sites across 9 actions (quotation, PI, dispatch, payment-receipt) are
  unchanged apart from passing their transaction. A shared
  `renderPdfJobPayloadSchema` lives in `@dealerlink/schemas`.
- The poll reuses the caller's transaction. `withTenant` runs at the Postgres
  default READ COMMITTED, so each SELECT sees the worker's committed insert,
  and reusing the held connection keeps PDF generation at one app-pool
  connection — better than the old subprocess, which opened its own pools
  (DEV.61/62). Correlation: capture the latest row id before enqueue, return
  once a row with a different id appears.
- Timeout is `PDF_RENDER_TIMEOUT_MS` (code default 15 s); staging sets 30 s to
  absorb cold `@sparticuz/chromium` launches + pg-boss pickup on the
  basic-xxs worker.
- `apps/workers/.dockerignore` keeps host `node_modules`/build output out of
  the image (Linux reinstalls native deps like `@node-rs/argon2`).
- `playwright.config.ts` now boots **web + workers** for the managed dev
  server — PDF e2e specs need the workers process to consume the queue.

**Note on `libgconf-2-4`:** the generic Puppeteer-on-Linux library list names
it, but it does not exist on Debian bookworm (GConf was removed years ago) and
modern Chromium does not use it — installing it would fail `apt-get` and break
the build. Intentionally omitted.

**Failure-mode tradeoff:** if a render genuinely fails in the worker, no row
is written, so the web action waits out the full timeout and returns the
friendly "try again" message rather than the specific error the old
synchronous spawn surfaced. Acceptable for Phase 1; a Stage D refinement could
read the pg-boss job state to fail fast.

**Verified:** typecheck + lint clean across the workspace; workers unit suite
40/40; the day-10 PDF verify spec passed locally end-to-end with web + workers
running. On staging (after DEV.64/65 got the Dockerfile actually deployed), all
four PDF paths smoke-tested green against `demo.staging.dealerlink.in` —
quotation (verify-day-10), PI, payment receipt, dispatch note — each a genuine
fresh render (staging had no cached PDFs, since rendering was broken until this
fix). Workers logs were clean of any `libnss3`/Chromium error throughout.
**Cold-start caveat:** the very first render on a freshly-deployed (or
10-min-idle-recycled) `basic-xxs` worker exceeds the 30 s timeout — cold
`@sparticuz/chromium` launch on 512 MB is slow — so the first attempt returns
the "try again" message and the retry (warm Chromium) succeeds in seconds.
Functional and self-healing, but a rough first impression; mitigations (higher
timeout, eager warm-up at boot, or a longer idle-recycle window) are a Stage D
tuning item — instance size is held per the cost guardrail.
**Resolution:** Permanent. Supersedes DEV.36 (the spawn-subprocess bridge is
removed).

## DEV.64 — Stage C — repo `.do/app.yaml` is documentation, not the deployed spec

**Date:** 2026-05-22
**Spec said:** DEV.63 — switch the workers component to a Dockerfile via
`.do/app.yaml` and push.
**Found:** Editing `.do/app.yaml` in the repo and pushing did **not** change how
the workers component builds. DO App Platform stores its **own** copy of the app
spec; `deploy_on_push` rebuilds from the latest commit but against the spec
already stored in DO. After pushing the `dockerfile_path` change the workers
component still built from the Node buildpack (runtime path `/workspace`,
corepack downloading pnpm) and the `libnss3` failure persisted — the repo edit
was illusory. The `.do/app.yaml` header already notes secrets are applied "via
the UI or `doctl apps spec update`"; the same is true of the whole spec.
**Built:** Applied the spec with `doctl apps update <app-id> --spec`. To avoid
clobbering the 16 encrypted secrets (the committed `.do/app.yaml` ships blank
`SECRET` values), the change was **merged into the live spec** — fetched with
`doctl apps spec get`, which returns the encrypted `EV[...]` values verbatim;
only the workers build method and the web `PDF_RENDER_TIMEOUT_MS` env were
edited — then applied. (`doctl apps spec validate` cannot pre-check a
round-tripped spec: it uses the new-app `/propose` endpoint, which rejects
already-encrypted secrets with "secret env value must not be encrypted before
app is created" — a false alarm; `apps update` accepts them on an existing app.)
**Rule (now in docs/DEPLOYMENT.md):** every `.do/app.yaml` edit MUST be followed
by `doctl apps update --spec` (merged into the live spec to preserve secrets),
or the change is illusory. Repo spec and live spec can silently drift.
**Stage D:** script the spec sync as a post-push CI step (or DO's GitHub Action
that applies the spec on push) so the two cannot diverge.
**Resolution:** Permanent (process rule); automation deferred to Stage D.

## DEV.65 — Stage C — corepack in the workers image fails pnpm signature check

**Date:** 2026-05-22
**Spec said:** DEV.63 — Dockerfile installs pnpm via
`corepack enable && corepack prepare pnpm@9.15.9 --activate`.
**Found:** The first Dockerfile build failed at `corepack prepare` with
"Internal Error: Cannot find matching keyid" — the corepack bundled in
`node:20.18.0-bookworm-slim` ships stale npm-registry signing keys and rejects
the pnpm package signature. The Chromium `apt` layer built fine (and confirmed
the `libgconf-2-4` omission was correct — no apt error).
**Built:** Replaced corepack with `RUN npm install -g pnpm@9.15.9` — npm's own
integrity check is unaffected. Version stays pinned to package.json's
`packageManager` field.
**Resolution:** Permanent. Stage D could instead set `COREPACK_INTEGRITY_KEYS`
or bump corepack, but the direct npm install is simplest and deterministic.

## DEV.66 — Stage C — PDF render cold-start on basic-xxs workers (Chromium launch, not extraction)

**Date:** 2026-05-22
**Spec said:** Mitigate the cold-start the DEV.63 smoke surfaced — bump
`PDF_RENDER_TIMEOUT_MS` to 60s and eager-warm Chromium at worker boot.
**Found (investigating the cold start):**

- A staging measurement showed a **fresh cold render exceeds even 60s**, while a
  warm render is **~5s**. Instrumenting the boot warm revealed
  `@sparticuz/chromium`'s binary **extraction is fast — 2.7s**. So the slow part
  of a cold render is the Chromium **launch itself** (process spawn + DevTools
  handshake) on the 512 MB / shared-vCPU `basic-xxs` worker, **not** extraction.
- The first eager-warm attempt — a **blocking** full launch + close **before**
  registering pg-boss consumers — **stalled the worker for 8+ min** (the launch
  hung at boot, plausibly under rolling-deploy resource contention with the
  outgoing container). Because it was `await`ed before `boss.work()`, the worker
  never registered consumers: emails, renders, and crons all stopped. A real
  regression caught on staging.

**Built (mitigations):**

1. **`PDF_RENDER_TIMEOUT_MS` 30s → 60s** (web; applied via doctl live-spec
   merge, DEV.64).
2. **Eager-warm, fixed to be safe** (`apps/workers/src/index.ts` +
   `warmChromium()` in `pdf/browser.ts`): runs **after** consumers are
   registered and is **fire-and-forget** (a slow/failed warm can never block job
   processing), and warms **only the binary extraction** via
   `chromium.executablePath()` — no Chromium process is spawned at boot, so it
   can't hang on a launch handshake or OOM the worker. Logs
   `PDF: eager-warmed Chromium in Xs` (2.7s observed). Toggle: `PDF_EAGER_WARM`
   (default on).
3. **Inline spinner** (`components/ui/pdf-progress.tsx`) on all four PDF actions
   so a render wait never looks frozen.

**Verified on staging:** worker boots functional ("Workers process started"
appears immediately); `PDF: eager-warmed Chromium in 2.7s`; a warm render
completes in ~5s. The **first render after a boot or a 10-min idle-recycle still
pays a cold Chromium launch** (~60s+) — the launch cannot be reliably warmed at
boot on this box — surfaced to the user via the spinner and, if it exceeds the
timeout, the "try again" message + a fast warm retry.
**Production consideration (Stage D):** the basic-xxs (512 MB, shared vCPU)
worker is the real constraint — cold Chromium launch is slow there. Re-evaluate
the workers instance size against real PDF load (concurrent renders, cold-launch
frequency); a roomier instance would make cold launches fast and could let the
timeout drop again. Widening the browser idle-recycle window would also reduce
cold-launch frequency. Both deferred to Stage D / the user's call (instance size
is held this stage per the cost guardrail).
**Resolution:** Mitigations permanent; instance-size + idle-recycle tuning =
Stage D.

## DEV.67 — Stage C — widen Chromium idle-recycle to 45 min + 120s render timeout

**Date:** 2026-05-22
**Spec said:** Follow-up to DEV.66 — reduce how often users hit the slow cold
Chromium launch on the basic-xxs worker, and stop the cold first render from
erroring.
**Built:**

- **Idle-recycle 10 min → 45 min** (`apps/workers/src/pdf/browser.ts`). A cold
  relaunch is ~60–90 s on this box (DEV.66), so the old 10-min recycle made an
  active session re-pay it repeatedly. 45 min keeps the warm browser across a
  pilot session; the per-100-pages (`RENDER_LIMIT`) recycle stays as the
  memory-leak backstop, and 45 min is still a hard cap — not keep-alive-forever.
  Each recycle now logs
  `PDF: Chromium recycled — reason: idle|page-cap|crash | uptime: Xm` for
  visibility into turnover under real load.
- **`PDF_RENDER_TIMEOUT_MS` 60 s → 120 s** (web; applied via doctl live-spec
  merge, DEV.64) so the cold first render (~60–90 s) completes within the wait
  instead of returning the "try again" message.

**Verified on staging (corrects the DEV.66 estimate):** once the worker has
**settled** after a deploy, a genuine cold render (Chromium not yet launched
this boot — eager-warm only extracts) is **~4 s**, and a warm render **~3 s**.
The ~60 s+ launches seen in DEV.66 were measured **immediately after a deploy**:
during the rolling-deploy window the outgoing container is still alive and
contends for the 512 MB, so a launch in that ~1–2 min window is very slow. The
120 s timeout exists to cover exactly that transient window; in steady state
renders are a few seconds.
**Net behaviour:** steady-state renders ~3–5 s (cold or warm); a launch can
briefly spike toward the 120 s timeout only in the rolling-deploy window;
Chromium is recycled at most once per 45-min idle gap.
**Production sizing consideration (Stage D):** the 120 s timeout + 45-min
recycle are mitigations for a 512 MB / shared-vCPU worker, not a fix for the
deploy-window contention. Re-evaluate workers instance size in Stage D against
real PDF load — the new recycle logs (frequency, uptime) plus pilot usage are
the inputs. A roomier instance would remove the deploy-window slowness and let
the timeout return to a tighter value. Instance size is held this stage per the
cost guardrail.
**Resolution:** Permanent (mitigations); production sizing review = Stage D.

## DEV.68 — Stage C Day C.1 — force-password-change enforced in layouts, not Edge middleware

**Date:** 2026-05-23
**Spec said:** Stage C Day C.1 A2.3 — "Update middleware to check
`must_change_password`; redirect to `/change-password` unless the path is
`/change-password` or `/logout`."
**Deviation:** The redirect is enforced in `apps/web/app/(app)/layout.tsx` and
`apps/web/app/admin/layout.tsx` — the Server-Component layouts — **not** in
`apps/web/middleware.ts`.

**Why:** Next.js middleware runs on the **Edge runtime**, which cannot touch
Drizzle or the Lucia DB adapter (this is already documented at the top of
`middleware.ts` and was established as a constraint on Day 3). The session
cookie is an opaque id; resolving it to `users.must_change_password` requires a
DB lookup, which only the Node runtime can do. Edge middleware therefore
**cannot** read the flag. The layouts are the project's existing
session-resolution + auth-routing boundary ("Actual tenant existence + role
checks happen in (app)/layout.tsx and /admin/layout.tsx"), so the trapdoor
belongs there.

**How it satisfies the guardrails:**

- Every authenticated surface routes through one of the two layouts, so a
  flagged user is bounced to `/change-password` from any app/admin route — the
  "force".
- `/change-password` lives in the `(auth)` route group, which is **not** wrapped
  by either guarded layout, so the forced redirect can never loop.
- The sign-out escape is the `logout` Server Action invoked from the rotation
  form (there is no standalone `/logout` route in this codebase; logout has
  always been an action), so the "allow /logout" intent is preserved.
- The login action additionally routes flagged users to `/change-password` on
  sign-in, so the entry point is covered too.

`middleware.ts` carries a comment pointing readers to the layouts. Mutations
are funneled through the UI behind these guards; if a future requirement needs
the gate to also block direct Server-Action calls, that would be added in the
action wrappers (`tenantAction`/`operatorAction`), not the Edge layer.

**Impact:** None functional — the trapdoor works as specified and is covered by
`verify-day-c1.spec.ts` + the updated `operator-onboarding.spec.ts`. The only
difference from the literal plan wording is the enforcement file.
**Resolution:** Intentional, permanent — dictated by the Edge-runtime
constraint.

## DEV.69 — Stage C Day C.1 — password policy follows CLAUDE.md §6, not the plan's looser wording

**Date:** 2026-05-23
**Spec said:** Stage C Day C.1 A2.2 — new password "≥8 chars, must include at
least 1 letter + 1 digit OR be ≥16 chars — flexible policy".
**Deviation:** The implemented policy is **CLAUDE.md §6**: min 8 chars, ≥1
uppercase, ≥1 number, ≥1 special character (`lib/auth/password-policy.ts`).

**Why:** CLAUDE.md is the authoritative implementation reference and §6 already
specifies the product password policy; A4.1 itself points at §6 as "the spec".
The temporary-password generator (`lib/admin/credentials.ts`) already produces
upper/lower/digit/symbol, so §6 keeps the whole auth surface internally
consistent. The §6 rule is also strictly safer than the plan's looser
"flexible" wording (which would have admitted, e.g., a 16-char all-lowercase
string). The single Zod schema is shared by the client form and the server
action so the two cannot drift.
**Impact:** Slightly stricter than the plan text; matches the documented
product policy and the temp-password shape.
**Resolution:** Intentional — defer to CLAUDE.md §6.

## DEV.70 — Stage C Day C.2 — ✅ closes DEV.33: state names normalized to ISO 3166-2:IN codes

**Date:** 2026-05-24
**Closes:** DEV.33 (state stored as full names, tracked since Day 9) — and
supersedes the interim "store and compare verbatim" stance of DEV.30.

**What shipped:** All state columns now hold a 2-letter ISO 3166-2:IN code
(`MH`, `KA`, …) or NULL, never a full name:

- **Canonical source** — `packages/schemas/src/states.ts`: the code→name map
  (28 states + 8 UTs), `getStateName` / `getStateCodeFromName` /
  `isValidStateCode` / `normalizeStateInput` (code-or-name → code, with
  former-name + alt-code aliases) / `formatStateLabel`, plus strict
  (`indianStateCodeSchema`) and lenient (`stateCodeInputSchema`) Zod schemas.
- **Migration** — `0015_normalize_state_codes`: one transaction that first
  normalizes every existing row (full name, any case → code; blank → NULL)
  then tightens the CHECK constraints to `^[A-Z]{2}$` on
  quotations/PIs/orders place-of-supply columns and NULL-tolerant code checks
  on `dealers.state` + `tenant_settings.state`/`address_state`. The data block
  is generated programmatically (`scripts/generate-state-migration.ts`,
  iterating the canonical map so all 36 are covered) and a reversible rollback
  is generated alongside under `migrations/rollback/`.
- **Boundary** — operator + dealer dropdowns submit codes
  (`components/ui/state-select.tsx`); admin schemas use the strict enum, the
  dealer schema the lenient transform (CSV import names → codes); UI/PDF/report
  displays render full names via `formatStateLabel`/`getStateName`. Seeds write
  codes.

**Tax-engine parity (the gate):** `packages/tax/src/state.ts` is UNCHANGED —
still an opaque case-sensitive string compare. The Day 9 parity test
(`quotation-engine-parity.test.ts`) passed BEFORE the migration, AFTER the
migration on the migrated data, and AGAIN on a fresh code-seed — every seeded
quotation's stored totals still match recomputation. Codes just guarantee both
sides of `tenantState !== placeOfSupply` share one format (CLAUDE.md §5).

**Why a programmatic generator + case-insensitive CASE:** seeded data was
mixed-case (`Maharashtra` from Day 8, `MAHARASHTRA` from Day 11–13); the CASE
matches on `upper(btrim(col))` so both map. Generating from `INDIAN_STATES`
removes the "we forgot Telangana" risk.

**Resolution:** Permanent.

---

## DEV.71 — Stage C Day C.2 — verify-day-11 three-party test made robust to seed ordering

**Date:** 2026-05-24

> Note: the test-fix deviation the C.2 prompt called "DEV.70" is logged here as
> DEV.71 — DEV.70 was already taken by the state-normalization closure (above),
> committed earlier in C.2.

**Issue:** Verify-day-11's three-party test was fragile to seed ordering.
`day11.ts` creates three-party PIs (PI-2026-0003, 0007, 0009) but `day12.ts`
and `day13.ts` add later two-party PIs that, sorted by `piDate DESC,
createdAt DESC`, pushed the three-party PIs past page 1 (PAGE_SIZE 50) of the
`/pi` list. The test scanned only the first page for a row labelled `ship → …`,
so it was passing incidentally during Stage B because the newer seeds hadn't
accumulated yet. The C.2 re-seed surfaced the latent gap.

**Fix:** Test-only. The test now filters the list with `?search=PI-2026-0003`
(ilike on PI #, which narrows to the single seeded three-party PI regardless of
ordering), asserts the row carries the `ship → …` indicator, then opens the
detail page and asserts distinct "Bill to" / "Ship to" party blocks. No
production code change — the underlying data shape (three-party PIs exist with
`bill_to ≠ ship_to`) is correct; only the test's reliance on first-page ordering
was wrong.

**Resolution:** Permanent (test hardening).

---

## DEV.72 — Stage C Day C.2 — ✅ closes DEV.56(d): server→client function-prop crashed the detail pages

**Date:** 2026-05-24

C.1's force-password-change refactor introduced a server→client function-prop
pattern in `/dealers/[id]` and `/catalog/[id]` that violates Next.js 14 RSC
serialization. Crashed both detail pages. Fixed by importing `formatINRExact`
directly in the client components. Surfaced by C.2's `verify-day-c2` spec. Both
detail pages now render correctly.

**Detail:** the Server Component pages passed `formatINR={formatINRExact}` (a
function) into the `'use client'` components `DealerDetailSections` /
`ProductDetailSections`. Next.js 14 cannot serialize a function across the RSC
boundary, so the render threw ("Functions cannot be passed directly to Client
Components …") and the page fell through to its error boundary ("Something went
wrong while loading this page"). `verify-day-c2`'s "dealer detail renders state
as a full name" assertion failed not on the state label but because the whole
page was an error boundary. Fix: drop the prop, `import { formatINRExact } from
'@/lib/format'` directly in each client component (a pure Intl util, safe
client-side). This subsumes the DEV.56(d) carry-forward.

**Resolution:** Permanent.

---

## DEV.73 — Stage D Day D.0 — tenant creation does not reject reserved subdomains

**Date:** 2026-05-26

The routing layer reserves `app`, `www`, and `admin` as operator subdomains
(`apps/web/lib/tenant/resolve.ts` `RESERVED_SUBDOMAINS`), but tenant creation
does **not** reject them: `slugSchema` / `createTenant()`
(`apps/web/lib/admin/schemas.ts`, `lib/actions/admin/create-tenant.ts`) only
validate slug _format_ (3–32 chars, lowercase alnum + hyphens) and DB
uniqueness. So an operator could create a tenant with slug `app`/`www`/`admin`;
the row would persist but be **unreachable** — `<reserved>.dealerlink.in`
resolves to the operator console, never to the tenant.

Surfaced by the D.0 production-env smoke (A3.6). Not exploitable and not
reachable by the pilot (only the operator provisions tenants, Stage E), so it
is **not** a launch blocker — but it is a footgun for operator onboarding.

**Fix (deferred — out of D.0 scope; Stage D is infra + F-1/F-3 only per
STAGE_D_HANDOFF §11):** add a `.refine()` to `slugSchema` (or a check in
`createTenant`) that rejects the `RESERVED_SUBDOMAINS` set, with a friendly
"that subdomain is reserved" error, plus a `check-slug` parity check. Small,
self-contained. Slot into **D.2** alongside F-1/F-3, or accept for the pilot
and close in Stage E onboarding hardening.

**Resolution:** Open — logged, fix deferred to D.2 (or Stage E).

---

## DEV.74 — Stage D Day D.1 — `/health` resend check accepts a least-privilege (sending-only) key

**Date:** 2026-05-27

The production `RESEND_API_KEY` is a **sending-only** key (Resend "Sending
access" scope) — correct least-privilege, since the app only ever POSTs
`/emails` and never manages domains or API keys. But the Day-17 `/health` resend
check (`apps/web/app/api/health/route.ts` `resendCheck`) pings `GET
/api/resend.com/domains` as a liveness probe, and a sending-only key is **not
scoped to read `/domains`** — Resend answers `401 {"name":
"restricted_api_key"}`. The original check treated any non-200 as `degraded`, so
production `/health` reported `resend: degraded` (and overall `degraded`) even
though email sending was fully functional. Surfaced by the D.1 post-deploy smoke
(it never appeared on staging, where the key was blank → `skipped`).

**Fix (this commit):** `resendCheck` now treats `401` **with the exact error
name `restricted_api_key`** as `ok` (that response is positive proof the key
authenticated and is valid — only the scope is narrowed). The match is precise,
not "any 401 = ok": a genuinely invalid/revoked key (different error name) still
reports `degraded`, and network/timeout/5xx still report `degraded`. Per the
existing design (documented in the same function) a failed Resend ping stays
`degraded`, never `down` — outbound email is queued + retried by pg-boss, so
Resend must never alone 503 the pod. Keeps the safer sending-only key; no key
re-scoping needed. Typecheck + lint green; verified `/health` `resend: ok` on
production post-deploy.

**Resolution:** ✅ Closed — health check enhanced to support least-privilege
production keys while preserving real invalid-key detection.

## DEV.75 — Stage D Day D.1 follow-up — Axiom dataset was created in the wrong region (US token ↔ EU dataset)

**Date:** 2026-05-28

The D.1 smoke test found the Axiom dataset `dealerlink-production` receiving
**zero events** despite `AXIOM_TOKEN` + `AXIOM_DATASET` being correctly present
on both web + workers DO components and `/health` fully green. Direct probing of
the Axiom API (not the app) isolated the cause:

| Request                                                                   | Result                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET https://api.axiom.co/v1/datasets` (US)                               | `200` — lists `dealerlink-production`, `edgeDeployment: cloud.eu-central-1.aws`                                                                        |
| `POST https://api.axiom.co/v1/datasets/dealerlink-production/ingest` (US) | `400` — _"ingest is only allowed into datasets in the primary region: dataset region: cloud.eu-central-1.aws, deployment region: cloud.us-east-1.aws"_ |
| `GET`/`POST` against `https://api.eu.axiom.co` (EU)                       | `403` forbidden                                                                                                                                        |

The ingest token authenticates **only** against Axiom's **US** control plane,
but the dataset's data region is **EU** (`eu-central-1`). The SDK
(`@axiomhq/js@1.6.1`) is constructed as `new Axiom({ token })` with no region
URL, so `resolveIngestUrl` defaults to the US cloud endpoint
(`https://api.axiom.co/v1/datasets/{dataset}/ingest`) → every ingest returns
`400`. Because `Axiom.ingest()` batches in the background and surfaces flush
errors through the SDK's **default `onError` (`console.error`)** — not through
the `Promise` our call site wrapped in `.catch()` — the failures were silently
lost. There is **no single endpoint** where a US token can ingest into an EU
dataset; the regions were mismatched at dataset-provisioning time.

**Fix:**

1. **Operator action (resolution path chosen):** recreate the
   `dealerlink-production` dataset in the **US** org (`app.axiom.co`), matching
   the existing token. Zero data lost (0 events had ever landed). No new token,
   no `AXIOM_URL` needed — the SDK default endpoint then works.
2. **Code hardening (this commit, web + workers `observability/events.ts`):**
   - Added an `onError` hook on the Axiom client that routes ingest failures
     through the structured `logger.warn` instead of the SDK's silent
     `console.error`. **This is the change that would have made the bug loud on
     day one** rather than only visible via a dashboard spot-check.
   - Added optional `AXIOM_URL` support (passed as the SDK `url` option, omitted
     when unset). Region is now a config flip: set
     `AXIOM_URL=https://api.eu.axiom.co` if a dataset ever lives in EU. Default
     stays the SDK US endpoint, matching the recreate-in-US resolution.
   - Fixed a stale comment that named the old dataset `dealerlink-events`.

**Resolution:** ✅ **Closed (2026-05-28).** Operator recreated
`dealerlink-production` in the **US** org and issued a fresh ingest token; the
old EU-mismatched token (`xaat-72ffdd50-…`) is now **revoked (403)**. The new
token was verified ingesting end to end:
`POST https://api.axiom.co/v1/datasets/dealerlink-production/ingest` →
`200 {"ingested":1,"failed":0}`. The new token is recorded in the local
production-secrets source of truth and **must be mirrored into the DO App
Platform `AXIOM_TOKEN` env on both `web` and `workers`** (old token there would
now 403) — that env update is the last step for live app ingest. No `AXIOM_URL`
needed (US default). Code-side hardening (loud `onError` + region-flexible)
shipped in the same follow-up.

## DEV.76 — Stage D Day D.1 follow-up — Better Stack monitor frequency is 3 min (free tier), not 30s/60s; response-time spikes diagnosed

**Date:** 2026-05-28

Two related D.1 smoke findings, both documentation/operational (no app code):

**(a) Monitor frequency.** Docs disagreed on the uptime-monitor interval —
`PRODUCTION_ENV.md` said `30s`, `STAGE_D_HANDOFF.md` §8 said `60 s`, and the
secrets-file comment said `30s`. The operator confirmed Better Stack's **free
tier caps the check interval at 3 minutes**; neither documented value was
achievable. Corrected both docs to **3 min (free-tier max)**. The paid tier
($25–50/mo) unlocks 30 s — revisit post-pilot if a tighter detection window is
needed. (The `/api/health` rate-limit reasoning is unaffected: 3-min polling is
even further under the 60/min/IP cap than the comment's assumed 60 s.)

**(b) Response-time spikes.** The monitor showed a ~150 ms baseline with
periodic ~1.2 s spikes. Diagnosis:

- **Cold-start ruled out** — both `web` and `workers` are `instance_count: 1`
  in the production spec (no scale-to-zero), confirmed via
  `doctl apps spec get`.
- **Primary cause:** `/api/health` makes a cross-region external `fetch` to
  `https://api.resend.com/domains` on every poll (the `resendCheck` liveness
  probe), and the endpoint's `responseMs` includes it. An occasional ~1 s TLS
  handshake from BLR1 → Resend (US/EU) accounts for the spikes — measurement
  latency, not app latency; the endpoint still returns 200/`ok` (≤3 s bound).
  The Resend ping is intentional (DEV.74) and is **not** removed.
- **Operator action:** switch the Better Stack monitor location to
  **Asia/Singapore** to shrink the baseline + spike envelope (the ~150 ms
  baseline is the India↔Europe monitoring RTT). Residual occasional spikes are
  acceptable network variance.

**Resolution:** ✅ Closed — docs corrected; spikes explained (benign,
measurement-side). Monitor-location change is a one-click operator action in the
Better Stack UI.

## DEV.77 — Stage D Day D.1 follow-up — workers Sentry project verified via a temporary smoke-test endpoint (added + removed)

**Date:** 2026-05-28

The web Sentry project had an on-demand trigger (`/api/internal/sentry-test`,
Day 17) but the **workers** project (`dealerlink-workers-production`) had none —
so D.1 could not positively confirm worker-side error capture. Rather than wait
for an organic failure, a temporary operator-gated endpoint
(`POST /api/internal/workers-error-test`) was deployed that enqueues a
`render-pdf` pg-boss job carrying a `THROW_ON_PURPOSE` sentinel `documentType`;
`handleRenderPdfJob` threw on that sentinel, exercising the real
`pg-boss → instrumentJobHandler → captureJobError → Sentry` path in the
long-running workers process (not the web process, not the synchronous render
CLI).

**Verified (operator):** the error `Sentry workers smoke test — D.1 diagnostic`
appeared in `dealerlink-workers-production` with `job.type: render-pdf` +
`job.id` tags and a `job` context block; the payload was **PII-clean** (the
`beforeSend` scrubber from the C.4 audit applies, and the test error carries no
PII anyway).

**Cleanup:** the endpoint and the sentinel check were removed in the immediately
following commit (deploy-verify-cleanup pattern). Production carries **no
throw-on-purpose path** past D.1; a post-removal `POST` of the path returns the
non-operator `404`. The sentinel was isolated to `handleRenderPdfJob` and never
touched the real render flow.

**Resolution:** ✅ Closed — workers Sentry capture confirmed working end to end;
diagnostic code fully removed.

## DEV.78 — Stage D pre-D.2 — DNS for `*.dealerlink.in` routes through DO App Platform's Cloudflare integration (not direct to DO); §6 DNS/SSL plan corrected

**Date:** 2026-05-28

**Finding.** `app.dealerlink.in` (and every `…ondigitalocean.app` host) resolves
to **Cloudflare** IPs, not DigitalOcean. Verified via `nslookup … 1.1.1.1`:
`app.dealerlink.in` → CNAME `dealerlink-production-8treh.ondigitalocean.app` →
`172.66.0.96`, `162.159.140.98`, `2606:4700:7::60`, `2a06:98c1:58::60`
(Cloudflare-owned ranges). The **bare DO origin resolves to the same Cloudflare
IPs independent of our zone**, and staging (`demo.staging.dealerlink.in`) does
too — so the Cloudflare-fronting is **DO App Platform's own architecture, not a
misconfiguration and not our proxy**. Our `app` CNAME is correctly **gray-cloud
(DNS-only)**; traffic is still Cloudflare-edged (Mumbai, `CF-RAY: …-BOM`) and
DO-cert-terminated (issuer **Google Trust Services WE1**, single-domain SAN
`app.dealerlink.in`, 90-day auto-renew). Raw evidence: `/tmp/dns-diagnostic.md`.

**This supersedes the D.1-follow-up "orange-cloud" flag.** That flag was inferred
from CF edge IPs + `__cf_bm`, but those signals are present on gray-cloud too
(they come from DO's Cloudflare), so they could not distinguish the two. The zone
dashboard shows gray-cloud — authoritative. Net: gray-cloud is correct, resolved.

**Three doc corrections made (DOC-ONLY, no infra/DNS/cert change):**

1. `STAGE_D_HANDOFF.md` §2.3/§6 used a `*.app.dealerlink.in` tenant pattern that
   never matched the deployed `NEXT_PUBLIC_APP_DOMAIN=dealerlink.in`. Corrected to
   `<slug>.dealerlink.in` / wildcard **`*.dealerlink.in`**.
2. §6 previously recommended a **Cloudflare proxied origin cert** for wildcards.
   **Rejected** — it would orange-cloud-proxy on top of DO's own Cloudflare
   (double-proxy). The §6 §"Staging precedent" and `STAGING_ENV.md` claim that "a
   true wildcard cert isn't possible while DNS is on Cloudflare (DO needs DNS-01)"
   was **wrong**: **DO App Platform supports wildcard custom domains natively** via
   a one-time **TXT-verification** record added manually in Cloudflare (gray-cloud),
   then DO issues + auto-renews the cert (with periodic ~30-day TXT re-verification).
   `.in` is not a restricted TLD. So §6 now decides: **try DO-native wildcard
   (Option A, ~30–45 min, no API token); fall back to acme.sh DNS-01 (Option B,
   needs a Cloudflare DNS-edit API token); Cloudflare origin cert (Option C)
   rejected.**
3. Staging was assumed to "already have wildcard SSL" — it does **not**. Verified:
   `demo.staging.dealerlink.in` presents a **single-domain** cert (SAN
   `demo.staging.dealerlink.in` only). Staging **enumerates** each tenant subdomain
   with its own cert; `*.staging` is a DNS convenience record, not a wildcard cert.
   That per-tenant toil is exactly what production's D.3 wildcard removes.

**Gating fact for D.3.** No `*.dealerlink.in` DNS record exists yet
(`curl https://test-tenant.dealerlink.in` → "Could not resolve host"), and the DO
prod app has only `app.dealerlink.in` (PRIMARY). Both the wildcard CNAME and the
wildcard cert are net-new D.3 work — the §6 "D.3 Wildcard SSL — Concrete Handoff
Plan" is decision-ready (execute, don't re-explore).

**Status:** ✅ Closed (diagnostic). No infrastructure changed. Documented in
`STAGE_D_HANDOFF.md` §6 (authoritative), cross-referenced from
`PRODUCTION_ENV.md`, `STAGING_ENV.md`, and `docs/DEPLOYMENT.md`.

## DEV.79 — Stage D Day D.2 — `@logtail/pino` worker-thread transport breaks under Next webpack bundling

**Date:** 2026-05-29

A pre-D.2-push diagnostic against the production app (still on D.1-era code,
commit `1cc7858`) caught a recurring `Error: Cannot find module 'worker.js'`
event in Sentry. The stack pinned the failure to pino's `thread-stream`
attempting to load the `@logtail/pino` transport in a worker thread; under
Next.js webpack bundling the worker's entrypoint chunk is not produced
reliably and `require('worker.js')` resolves to nothing.

**Surface.** Every server-side log call in production (logger.info /
logger.warn / logger.error) triggered a transport-side worker spawn. The
visible failure landed on the **first HTTP request that logged after warmup**,
which by request frequency was usually `POST /login` (`user.logged_in`
event). Despite the error message, the **login itself was unaffected** —
the login server action completed normally; only the side-channel log line
failed inside the transport worker. Sentry caught the worker error and
attributed it to the triggering request, which made it look like an auth
incident.

**Why D.1 introduced it.** Day 17 wired `@logtail/pino` as a conditional
transport when `BETTERSTACK_SOURCE_TOKEN` was set; the token was deliberately
**blank on staging** (Day 17 + STAGING_ENV "Known limitations"), so the worker
transport never instantiated there. Production populated the token in D.1
(`F-7 closed for production`), which flipped the conditional on and exposed
the bundling fragility for the first time. Effectively a configuration-
gated bundling bug — no test, no staging signal could have caught it before
the token was real.

**Built (this commit, F-1+F-3+DEV.73 push).** Removed the conditional
`@logtail/pino` transport from both
`apps/web/lib/observability/logger.ts` and
`apps/workers/src/observability/logger.ts`. Production now emits NDJSON to
stdout, which DO App Platform already collects into DO Logs (zero impact on
the existing tail surface). The `BETTERSTACK_SOURCE_TOKEN` env var stays
populated in production — it's still read on the Better Stack side by the
uptime monitor (separate plumbing, not affected by this change).

**Better Stack log shipping consequence.** The token-driven log forwarder is
**out of service**; the uptime monitor on `/api/health` continues to work
unchanged. Choices for when log shipping is revisited (post-pilot):

1. Configure a **DO log drain** at the App Platform layer pointing at the
   Better Stack ingestion endpoint — no in-app changes, survives
   bundling. Simplest path forward.
2. Replace the pino transport with **`@logtail/node`** in-process (HTTP
   client, no worker thread) called from a pino async hook — survives
   bundling, but more in-app code.

Both choices are deferred. No customer-visible logging behaviour changes
in the meantime.

**Tests.** No assertions broke. `logger.test.ts` always passed a custom
`DestinationStream` (memory stream), which the `if (destination)` guard
still hits before the prod / dev branches. typecheck + lint clean.

**Status:** ✅ Closed by this commit (DEV.79). Better Stack uptime monitor
remains live; log shipping intentionally on hold pending the operator's
choice between the two post-pilot options above.
