# Engineering Standards & Definition of Done

> **Scope:** Coding standards, git workflow, security checklist, performance budgets, per-module Definition of Done, and recurring patterns. Back to [CLAUDE.md](../CLAUDE.md).

This section closes the practical gaps between "code that runs" and "code that ships". Treat it as a checklist, not background reading.

## 1. Coding Standards

**Naming**

- **Files:** `kebab-case.ts` for everything (components, modules, utilities). Exception: Next.js convention files (`page.tsx`, `layout.tsx`, `route.ts`) follow Next.js rules.
- **Components:** `PascalCase` for component names, `kebab-case` for filenames. Component `<DealerTable />` lives in `dealer-table.tsx`.
- **Variables / functions:** `camelCase`. Booleans prefixed with `is`, `has`, `can`, `should`.
- **Constants:** `SCREAMING_SNAKE_CASE` only for true module-level constants. Inline values stay camelCase.
- **Types & interfaces:** `PascalCase`. Prefer `type` over `interface` unless declaration merging is needed. **No `I` prefix.**
- **Database:** `snake_case` for table and column names. Drizzle schema uses `camelCase` in TS, mapped to `snake_case` in DB.

**File organization**

- **No barrel files** (`index.ts` re-exports) except at package public boundaries (e.g., `packages/tax/index.ts`). They break tree-shaking and slow IDE indexing.
- **One component per file.** Co-locate small helpers in the same file only if they're not used elsewhere.
- **Imports order:** (1) React/Next, (2) third-party, (3) `@/` internal, (4) relative. Use ESLint `import/order` rule with auto-fix.

**Error handling**

- **Server Actions and tRPC procedures** return discriminated union results: `{ ok: true, data } | { ok: false, error: AppError }`. Never throw across the network boundary except for genuinely unexpected errors (which Sentry catches).
- **Define `AppError` once** in `lib/errors.ts` with codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`. UI maps codes to user-facing messages.
- **Always `await` promises.** No floating promises. ESLint `no-floating-promises` enabled.
- **Catch and rethrow with context** when wrapping external SDK calls (Resend, Spaces, Puppeteer): `throw new AppError('INTERNAL', 'Failed to upload PDF', { cause: err })`.

**TypeScript**

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **No `any`.** Use `unknown` then narrow. ESLint `no-explicit-any` enabled as error.
- **No `as` casts** except for `as const` and narrowing after a runtime check (e.g., Zod parse). Never `as SomeType` to silence the compiler.
- **Zod schemas first**, types derived via `z.infer`. Don't write a TS type and a Zod schema for the same shape.

**Comments**

- Comment **why**, not **what**. The code says what.
- **JSDoc on public package exports** (`packages/tax/`, `packages/db/`, `packages/schemas/`).
- **`// TODO(yourname):`** with a note. Naked `// TODO` is banned — ESLint rule.

## 2. Git Workflow

**Branch naming**

- `feat/<short-slug>` — new feature
- `fix/<short-slug>` — bug fix
- `chore/<short-slug>` — tooling, deps, refactor without behavior change
- `docs/<short-slug>` — docs only
- Examples: `feat/quotation-builder`, `fix/gst-rounding`, `chore/upgrade-drizzle`

**Commit messages — Conventional Commits**

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

- **Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`
- **Scope:** the module or area, e.g., `inventory`, `tax`, `pipeline`, `auth`, `pdf`
- **Examples:**
  - `feat(quotation): add live tax recalc on dealer change`
  - `fix(tax): correct IGST rounding for sub-rupee values`
  - `chore(deps): bump drizzle-orm to 0.30`

**PR rules**

- **One PR per logical change.** No mega-PRs.
- **Squash on merge.** Final commit message is the PR title; PR title follows Conventional Commits.
- **PR description must include:** what changed, why, screenshots if UI, and a checklist (see Definition of Done below).
- **Required CI checks before merge:** lint, typecheck, tests, build. Phase 1 is solo-dev, but the bot enforces.
- **No direct commits to `main`.** Even hotfixes go through a PR.

## 3. Security Checklist

Apply to every feature. This is non-negotiable for a CRM that stores GSTINs, financial data, and dealer information.

**Input validation**

- ☐ Every Server Action and tRPC procedure validates input with Zod **before** any business logic.
- ☐ GSTIN format + checksum validated, not just length.
- ☐ Pincode, mobile, email validated with format-specific regex.
- ☐ Numeric inputs (amounts, quantities) bounded with min/max.

**SQL injection**

- ☐ All queries go through Drizzle's parameterized API.
- ☐ Any raw SQL (`sql\`...\``) uses Drizzle's tagged template — **never** string concatenation with user input.
- ☐ No dynamic table or column names from user input. Use an allowlist if needed.

**XSS**

- ☐ React escapes by default — never use `dangerouslySetInnerHTML` with user-derived content.
- ☐ **PDF templates** rendered by Puppeteer: same rule. Email subject lines rendered into HTML must be escaped.
- ☐ Rich text fields (notes, T&Cs) sanitized with **DOMPurify** before storage and again before render.

**CSRF**

- ☐ Next.js Server Actions are CSRF-safe by default (origin check). Don't disable.
- ☐ Webhook endpoints (Resend) verify HMAC signature before processing.

**Auth**

- ☐ Every mutation calls `requireRole([...])` before doing work.
- ☐ Session cookies: `httpOnly`, `secure`, `sameSite: 'lax'`.
- ☐ Password hashing: Argon2id with sane defaults (don't tune unless you know why).
- ☐ Failed login attempts logged to `auth_events`; rate-limited after 5 failures from same IP in 15 min.

**Rate limiting**

- ☐ Login endpoint: 5 attempts / 15 min per IP.
- ☐ `/api/health`: 60 / min per IP (it's public for monitoring, but no need to be unbounded).
- ☐ Webhook endpoints: signature verification is the gate; rate limit as defense-in-depth.
- ☐ Use a simple Postgres-backed rate limiter (`pg-boss` queue overkill for this — use a `rate_limit` table with `(key, window_start, count)`).

**Secrets**

- ☐ Never log API keys, session tokens, or passwords. Sentry, Axiom, and `console.log` all checked.
- ☐ Never commit `.env*` files. Pre-commit hook (`gitleaks`) catches accidental commits.
- ☐ Production secrets only in DO App Platform env vars; never in source.
- ☐ Rotate `SESSION_SECRET` on tenant compromise.

**Multi-tenancy (most critical)**

- ☐ RLS policies present and tested on **every** table — see CLAUDE.md §4 (Data Model).
- ☐ Tenant context set per request via `SET LOCAL app.tenant_id` inside a transaction.
- ☐ **Cross-tenant data leak test** in CI: query as Tenant A, assert zero rows from Tenant B.
- ☐ Audit log queries also tenant-scoped (admins see only their own tenant's logs).

## 4. Performance Budgets

If a feature exceeds these, fix it before merging. These are Phase 1 launch targets — appropriate for the first wave of tenants. Tighten as scale grows.

| Surface                                          | Budget                                     | Measurement                                        |
| ------------------------------------------------ | ------------------------------------------ | -------------------------------------------------- |
| **First Contentful Paint** (logged-in dashboard) | < 1.5s on 4G                               | Lighthouse, real-user via Sentry Performance       |
| **Time to Interactive** (logged-in dashboard)    | < 3s on 4G                                 | Lighthouse                                         |
| **Page bundle size** (per-route JS)              | < 200 KB gzipped                           | Next.js bundle analyzer                            |
| **Inventory list — 10K rows**                    | < 100ms scroll latency                     | TanStack Virtual handles this if used correctly    |
| **Pipeline kanban — 200 deals**                  | < 200ms initial render                     | React profiler                                     |
| **PDF generation — single quote**                | < 5s end-to-end (enqueue → file in Spaces) | `document_log` timestamps                          |
| **DB query p95** (any user-facing query)         | < 100ms                                    | Sentry Performance + Postgres `pg_stat_statements` |
| **DB query p99**                                 | < 500ms                                    | Same                                               |
| **Server Action / tRPC query response**          | < 300ms p95                                | Sentry Performance                                 |
| **Quotation Builder live recalc**                | < 50ms after debounce                      | Manual; React profiler                             |
| **Health endpoint response**                     | < 100ms                                    | Better Stack monitor                               |
| **Worker job pickup latency**                    | < 5s after enqueue                         | pg-boss metrics                                    |

**When you blow a budget:** measure first (don't guess), fix the actual bottleneck, document the trade-off in the PR if you choose to defer.

## 5. Definition of Done — Per Module

A module is **not done** until every box is checked. Use this as the PR checklist for each of the 12 BRD modules.

```
## Definition of Done — Module M_ <name>

### Functional
- [ ] All fields from BRD spec implemented with correct types and validations
- [ ] All business rules from BRD enforced server-side (not just UI)
- [ ] CRUD operations: create, read (list + detail), update, delete (or soft-delete)
- [ ] List view supports search, filter, sort, pagination, CSV export
- [ ] Empty states designed (no data, search returns nothing, error)
- [ ] Loading states (skeleton, not spinner) on all async surfaces
- [ ] Error states surface a useful message + recovery action

### Data
- [ ] Drizzle schema with `tenant_id` + standard columns
- [ ] Migration generated and committed
- [ ] RLS policy enabled and tested
- [ ] Seed data for sample tenant per BRD §7

### Security
- [ ] Zod validation on every server input
- [ ] requireRole() on every mutation
- [ ] Audit log fires on create/update/delete (via Postgres trigger)
- [ ] No sensitive data in console / Sentry / Axiom logs

### UI
- [ ] Matches design prototype pixel-perfect (or PR explains the deviation)
- [ ] Mobile responsive down to 375px
- [ ] All numbers use Plex Mono + tabular-nums + formatINR
- [ ] Status pills, action buttons, and dialogs follow design system

### Performance
- [ ] Meets all relevant budgets in docs/STANDARDS.md §4
- [ ] Tables virtualized if > 100 rows possible
- [ ] No N+1 queries (verify in pg_stat_statements)

### Tests
- [ ] Vitest unit tests for utility functions and pure logic
- [ ] Integration test for at least the happy path (create + read)
- [ ] RLS isolation test (Tenant A cannot see Tenant B)
- [ ] Playwright E2E for primary user flow if module is user-facing

### Observability
- [ ] Sensitive routes write to access_log
- [ ] Errors surface meaningful messages to Sentry
- [ ] Health endpoint reflects this module's dependencies if applicable

### Docs
- [ ] CLAUDE.md updated if any architectural decision changed
- [ ] PR description includes screenshots and a "what changed" summary
- [ ] Conventional Commit message
```

## 6. Daily Engineering Practice

A short list of habits that keep the codebase healthy.

- **Run `pnpm typecheck` and `pnpm lint` locally before every commit.** A pre-commit hook (Husky + lint-staged) enforces this.
- **Keep PRs under 400 lines of diff** when possible. Large changes split into prep PRs (refactor) + the actual change.
- **Re-read the relevant prototype screen** before implementing it. Memory drifts; the prototype doesn't.
- **Write the test first** for tax math, document numbering, and stage transitions. These are the bug-prone areas.
- **One TODO ages out per week.** Either resolve it or convert to a tracked issue.

## 7. Recurring patterns established in early days

A handful of cross-module patterns were settled in Days 4-5. Reuse them instead of re-inventing.

- **Per-tenant document numbering.** `document_counters` holds `(tenant_id, doc_type, fiscal_year)` with a `last_value`. Use the `nextCounter()` / `nextDealerCode()` helpers in `@dealerlink/db` — they perform an atomic `INSERT ... ON CONFLICT DO UPDATE` so two concurrent calls cannot allocate the same number. `fiscal_year=0` is reserved for non-fiscal counters (dealer code), all other doc types use the tenant's fiscal year per BRD §4.3.
- **JSONB specs editor.** Vertical-specific fields (panel wattage, inverter capacity, etc.) live in `products.specs` as JSONB rather than separate columns. The catalog detail page uses a `humanize()` helper to render snake_case keys with friendly suffixes (`wattage` → `Wattage (W)`). Always default to `{}` so the JSONB is never NULL.
- **Bulk import is atomic.** Both dealers and products use the same shape: a `bulkImport*Schema` Zod array cap at 500 rows, a single `tenantAction` transaction that pre-checks conflicts, then inserts each row, and rolls back on any single failure. No partial imports in Phase 1 — the operator UI guarantees this contract.
- **Inline-edit sections.** The dealer + product detail pages use the same "Edit / Save / Cancel" section pattern established by the tenant settings page in Day 4. Each section maps to a Zod schema; commercial terms (`creditLimit`, `creditPeriodDays`, `discountPercent`) require `admin` while profile edits accept `sales`.
- **Access logging on detail views.** Dealer detail pages call `recordAccess('dealer', id, 'view')` from a Server Component. Payment, dispatch, and export routes will do the same per docs/LOGGING.md.
