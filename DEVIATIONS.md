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

## DEV.33 — Day 9 pre-flight — state stored as full names, not 2-letter codes (tracked)

**Date:** 2026-05-15
**Issue:** `tenant_settings.state`, `dealers.state`, `quotations.tenant_state_at_issue`, and `quotations.place_of_supply` all store full state names ("Maharashtra", "Karnataka", "Tamil Nadu") rather than the 2-letter codes ("MH", "KA", "TN") implied by CLAUDE.md section 6. This is the data-shape consequence of the CHECK relaxation already recorded in DEV.30.
**Impact:** Functional today and **not blocking Day 9** — the tax engine only needs an exact-match string, and all four locations are consistent (inter-state vs intra-state is decided by string equality of tenant state vs place-of-supply). It will break when: (a) integrating with the GST Returns API in Phase 2 (mandates 2-letter codes), (b) Day 11 PDF generation if any letterhead/place-of-supply logic depends on canonical codes, (c) any GSTIN <-> state cross-validation (GSTIN bytes 1-2 encode the numeric state code).
**Status:** TRACKED, not blocking. Day 9 tax engine works with whatever string format as long as all sides stay consistent.
**Resolution plan:** Normalize before Stage C (Validation). Add a state-code lookup helper (full name -> 2-letter), migrate existing `tenant_settings`/`dealers`/`quotations` rows, tighten the CHECK constraint to exactly 2 chars, and re-seed. This supersedes the "store and compare verbatim" interim stance of DEV.30.

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
  **Resolution:** Day 14 swaps `spawnPdfRender()` for a pg-boss
  `boss.send('render-pdf', …)` against the already-written `handleRenderPdfJob`.
  No template, storage, or schema change required.

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
