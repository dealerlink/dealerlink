# F.55 — Shape-only GST rate validation (Option A)

> **STATUS: APPROVED — run as written.** Drafted by `prompt-drafter` against
> `docs/F55_SPEC.md` (the authority on *what* and *why*), `docs/F55_AUDIT.md`
> and `docs/GST_RATE_MODEL_AUDIT.md` (the authority on *where*). All seven open
> questions are settled under **Settled decisions** at the end, together with
> the three scoped protected-surface authorisations and two corrections to the
> spec — both of which are the operator's errors, and the record says so.

**Goal:** make a GST rate *tenant data* rather than *application knowledge*.
Validation becomes shape-only per `docs/F55_SPEC.md` §1; the four DB CHECK
constraints, the eight rate-list constants, the two PDF-loader read gates and the
two catalogue `<select>`s stop encoding a statutory claim. No number on any
existing document moves.

**Estimated time:** not set by this draft. The work spans a migration, two files
inside `packages/tax`, two Zod schemas, two worker loaders, two client
components, a new query, a new invariant test, and five deliberate test
inversions. Size it before starting; it is visibly larger than F.81's one day.

## Read before starting

- `docs/F55_SPEC.md` **in full** — the decision, the rule, the scope table, the
  acceptance list, and §6's out-of-scope list.
- `docs/F55_AUDIT.md` §1 (the eight constants), §2 (the single engine throw and
  its five production call paths), §3 (the four CHECKs), §4 (protected split),
  §5 (the 18 surfaces and what tests each today).
- `docs/GST_RATE_MODEL_AUDIT.md` §0.1–§0.5 (measured), §1.2 (the
  `ADD CONSTRAINT`-without-`NOT VALID` pattern), §3.3 (read validation), §5.3
  (the site-by-site option table), §5.4/§5.4a/§5.4b (inverting tests, the
  no-bound ruling, the warning-not-rejection ruling).
- `docs/stage-f-tasks.json` — F.55, F.3, F.4, F.6, F.81, F.84, F.87, F.89, F.90.
- `CLAUDE.md` §5 (rates + the `gstRate`-string hazard, which lands squarely on
  this day's new suggestion list), §6 (role gating on the catalogue actions),
  §10.1 (stop-and-ask), §10.4 (who writes what), §11.1 rulings 1, 3, 4, 7, 8,
  §11.2.
- `docs/STAGE_F_BUILD_v3.md` §9 (standing guardrails — `packages/tax` **and its
  fixtures** and `critical-path.spec.ts` are named protected).
- `docs/pdf-references/README.md` — the 14 files are **read-only input**.

---

## READ THIS FIRST — five places where the code contradicts or under-determines the spec

Each is `file:line`-evidenced. Do not draft around them and do not "correct" the
spec: they are either open questions (below) or facts the day must carry.

**C-1 — FIVE existing tests invert, not three or four.**
`docs/GST_RATE_MODEL_AUDIT.md` §5.4/§5.4a enumerate four:
`packages/db/tests/dealers.test.ts:153` (rejects 10),
`packages/db/tests/quotation.test.ts:152` (rejects `'9.00'`),
`packages/tax/tests/compute.test.ts:324` (10), `:328` (100).
A fifth is absent from that table and inverts identically:
`packages/schemas/src/product.test.ts:48-56` — *"rejects GST rate not in
{0,5,12,18,28}"*, `gstRate: 10`, `expect(r.success).toBe(false)`. Under Option A,
10 is shape-valid, so this assertion becomes false. `docs/F55_AUDIT.md` §5 row 1
records the same test as "Rejects 10 (`:48-56`)", so the two audits are
consistent with each other and only §5.4's *inverting-test table* is short by
one. **Inverting all five is expected and in scope. A red test in that set is
not a regression — say so in the commit message so nobody re-narrows anything to
get green (CLAUDE.md §11.1 ruling 1).** Also drifting but *not* inverting:
`packages/schemas/src/product.test.ts:58-59` ("accepts canonical GST rates 5,
12, 18, 28"), `packages/tax/tests/compute.test.ts:21` (helper param type),
`:151` (test title), `packages/db/tests/quotation.test.ts:152`'s inline comment.

**C-2 — §3's catalogue change breaks a protected spec.**
`apps/web/tests/e2e/critical-path.spec.ts:166` is
`await page.getByLabel('GST rate').selectOption({ label: '18%' });`. Replacing
the `<select>` at `apps/web/app/(app)/catalog/new/new-product-form.tsx:119-131`
with a numeric input makes `selectOption` fail. `critical-path.spec.ts` is
protected (`docs/STAGE_F_BUILD_v3.md:436`). The spec is silent on it.
**STOP AND ASK before touching either file.**

**C-3 — §3 and §6 cannot both be honoured literally at the pricing editor.**
§6 puts the `'18.00'`-vs-`'18'` select defect out of scope, "already inside F.3's
screen work". That defect *is* the `<select>` at
`apps/web/app/(app)/catalog/[id]/product-detail-sections.tsx:253-265` —
`value={form.gstRate}` at `:255` is the raw DB string `'18.00'`
(`product-detail-sections.tsx:24` types it `string`;
`apps/web/lib/queries/products.ts:14,63` never `Number()`s it) while the options
render integer literals at `:259`. §3 replaces that `<select>` with a numeric
input, which **removes the defect by removing the affordance**. So either §3
applies only to `catalog/new` and the pricing editor keeps its broken select, or
§3 applies to both and F.3 loses a scoped item. Settled: **D-2**.

**C-4 — §2's "Read validation (the five §3.3 sites) — Delete" is only true of
two of them.** The five sites in `GST_RATE_MODEL_AUDIT.md` §3.3 are:
`apps/workers/src/templates/quotation.tsx:46,49-56` (used `:207`),
`apps/workers/src/templates/performa-invoice.tsx:35,37-44` (used `:135`),
`apps/web/lib/actions/pi/helpers.ts:62`, `apps/web/lib/quotation/preview.ts:83`,
`apps/web/lib/actions/quotations/helpers.ts:179`. Only the first two are
deletable validation (the `VALID_GST_RATES` arrays plus `toGstRate`). The other
three are `as GstRate` type widens with no runtime effect, and the try/catch
around two of them (`pi/helpers.ts:77-80`, `quotations/helpers.ts:184-189`) also
routes `EMPTY_LINES`, `NEGATIVE_QUANTITY`, `NEGATIVE_UNIT_PRICE`,
`NEGATIVE_DISCOUNT`, `DISCOUNT_EXCEEDS_SUBTOTAL`, `DISCOUNT_PERCENT_OUT_OF_RANGE`
and `EMPTY_STATE` to `AppError('VALIDATION')`. **Do not delete those catches.**
The casts may be left as harmless no-ops — ESLint is not type-aware
(`/workspace/.eslintrc.js:12-14` uses the non-type-checked recommended set), so
`no-unnecessary-type-assertion` is off and nothing forces the churn.

**C-5 — §4's invariant as worded and §1's 2dp rule cannot both hold.**
§4 asks the test to assert *"Any value the DB accepts, the code accepts"*. The
column is `numeric(5,2)` (`packages/db/src/schema/product.ts:38` and the three
line tables), and Postgres **accepts** the input `0.125` — it stores `0.13`
(`GST_RATE_MODEL_AUDIT.md` §0.2, measured). §1's shape rule is "at most two
decimal places", so Zod would **reject** `0.125`. Read literally, the two
criteria contradict. The satisfiable form is over the **stored** domain: *every
value that can be read back out of a rate column is accepted by every code
layer*. Settled: **D-5**.

---

## Phase A — the work

### A.0 — Install `typst`, then establish the "nothing moved" baseline. Before any other change.

This day's hardest claim is spec §2/§5.4: **no existing fixture changes and no
number on any existing document moves.** That is a before/after measurement and
there is no "after" without a "before".

1. `pnpm typst:install` then `pnpm typst:check`. Use the pinned version
   (`scripts/install-typst.mjs`, `docs/RUNBOOKS.md` R26); a different binary
   re-baselines all 14 cases for reasons unrelated to this task. `~/.local/bin`
   may not be on `PATH` — if `command -v typst` is empty, export it or set
   `TYPST_BIN`.
2. From the unchanged tree:

```
pnpm db:seed
psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f apps/workers/scripts/long-serial-fixture.sql
cd apps/workers && pnpm exec tsx scripts/determinism-check.ts        # expect MATCH
pnpm --filter workers test                                           # pdf-snapshots green
# HASH RENDERED OUTPUT INTO A FRESH DIRECTORY — never docs/pdf-references/.
pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/f55-pre
( cd /tmp/f55-pre && sha256sum *.pdf | sort -k2 ) > /tmp/f55-pre.sha
```

3. Repeat step 2 into `/tmp/f55-pre2` from a **second independent reseed** of the
   still-unchanged tree and `diff` the two `.sha` files. That control is what
   makes a later movement attributable to this day rather than to reseed
   nondeterminism.

**Why the fresh directory matters.** `docs/pdf-references/*.pdf` is 14
git-tracked, read-only input: `apps/workers/tests/pdf-snapshots.test.ts:46,129`,
`scripts/compare-typst.mjs`, `scripts/compare-figures.mjs` read it and nothing
writes it. Hashing that directory pre/post yields an empty diff **by
construction** and cannot detect a moved document — the falsifying result could
not have appeared. That is DEV.136 exactly (the C6c / DEV.124 family: a real
command with real output is not evidence until you know what would have
falsified it). `scripts/render-typst.ts` carries a duplicate view model
(`:90-110`, `:236-238`) that can drift from `src/pdf/view-model.ts` (F.83) — that
does not matter here, because both sides of the diff use the same tool.

Any movement in any of the 14 at any later point is **a finding to report, not a
baseline to re-record** (CLAUDE.md §11.1 rulings 1 and 4).

### A.1 — The migration. STOP AND ASK BEFORE WRITING IT.

A schema change is CLAUDE.md §10.1 stop-and-ask, and spec §2 is right that
without it the task delivers nothing: all four constraints are an enum of six
values, verified today at `packages/db/src/schema/product.ts:72`,
`quotation.ts:171`, `performa-invoice.ts:175`, `order.ts:172` — each
`sql\`${t.gstRate} IN (0, 3, 5, 12, 18, 28)\`` — and in the migration of record
`packages/db/migrations/0017_friendly_logan.sql:5-8`. A tenant cannot enter 40%
while those stand, whatever the code does.

What a drop-and-re-add to `>= 0` touches, enumerated:

- the four `check(...)` predicates in the four schema files above;
- a new migration, which will be **0018** — `packages/db/migrations/*.sql` is 18
  files, `0000`–`0017`, full listing read, so `0017` is the highest;
- `packages/db/migrations/meta/_journal.json` and a new
  `meta/0018_snapshot.json` (generated by `drizzle-kit generate`, not hand-written);
- nothing else. Keep the four constraint **names** unchanged, or
  `packages/db/tests/quotation.test.ts:156`'s `/gst_rate_chk/` matcher and any
  operator runbook referring to them break for a second reason.

**Does `ADD CONSTRAINT` validate existing rows in the widening direction?**
`0017_friendly_logan.sql` uses `DROP CONSTRAINT` + `ADD CONSTRAINT` with no
`NOT VALID`, so Postgres validates every existing row — that is what made
`GST_RATE_MODEL_AUDIT.md` §0.3's *narrowing* probe abort against the seeded 12%
rows. Widening to `>= 0` is a **superset** of `IN (0,3,5,12,18,28)`, so every
existing row satisfies it and the validation scan cannot fail on data. That is
reasoning from Postgres semantics, **not a measurement** — the day must measure
it, in a rolled-back transaction, before writing the migration:

```sql
begin;
alter table quotation_lines drop constraint quotation_lines_gst_rate_chk;
alter table quotation_lines add constraint quotation_lines_gst_rate_chk check (gst_rate >= 0);
rollback;
```

Then confirm with `pg_get_constraintdef` that the six-member form is back.
Report the result either way; if it *does* abort, stop — that contradicts the
premise and is a finding.

Note also: the scan takes an ACCESS EXCLUSIVE lock per table. Row counts are
small on dev and staging; say what they are rather than assuming.

### A.2 — `packages/tax`. STOP AND ASK. Two files, both protected.

Spec §2 requires the enum check removed and a shape guard kept. Both sites are
inside the protected surface (`CLAUDE.md` §10.1,
`docs/STAGE_F_BUILD_v3.md:435-437`), and so is `packages/tax/tests/`
("`packages/tax` **and its fixtures**"):

- `packages/tax/src/types.ts:7` — `export type GstRate = 0 | 5 | 12 | 18 | 28;`,
  consumed at `types.ts:17,45`, `serialize.ts:13`, re-exported at `index.ts:10`.
  Complete consumer enumeration outside the package (`\bGstRate\b` over
  `/workspace/apps` and `/workspace/packages`, unlimited, read in full): the two
  worker `VALID_GST_RATES` arrays, five `as GstRate` casts
  (`apps/web/lib/actions/quotations/helpers.ts:179`,
  `apps/web/lib/actions/pi/helpers.ts:62`,
  `apps/web/lib/quotation/preview.ts:83`,
  `packages/db/tests/quotation-engine-parity.test.ts:77`,
  `packages/db/src/seeds/multi-rate.ts:312`), and one local seed type
  (`multi-rate.ts:169`). There is **no** `Record<GstRate, …>` and **no**
  exhaustive `switch` on it anywhere in that set — so widening it changes no
  exhaustiveness check, contrary to what F.55's own notes predicted.
- `packages/tax/src/compute.ts:7` + the guard at `:135-139`, plus the message at
  `:138` and the doc comment at `types.ts:16` (and the miscitation of "CLAUDE.md
  §6" at `types.ts:4` and `compute.ts:10`, where rates live in §5).

**One design point the spec under-determines, because it changes behaviour.**
`compute.ts:135` is `VALID_GST_RATES.includes(line.gstRate)` — an `includes()`
over a **number** array with no adjacent `Number()`. That makes the raw driver
string `'18.00'` throw, which F.55's notes record as a deliberate fail-loud
backstop guaranteeing every caller coerces. A shape guard written as
`Number(x) < 0 || …` silently **accepts** `'18.00'` and destroys that property. A
shape guard written as `typeof x !== 'number' || !Number.isFinite(x) || x < 0 ||
x > 999.99` preserves it. Settled: **D-3**.

### A.3 — Write validation (Zod). Not protected.

- `packages/schemas/src/product.ts:4` — `GST_RATES`, and the refine at `:19-24`
  with its message at `:23`. **Measured, unlimited grep over
  `/workspace/packages`: the only two occurrences of `GST_RATES` in the whole
  package tree are its own declaration and its own refine.** It is nevertheless
  re-exported as public API through the barrel
  (`packages/schemas/src/index.ts:4`, `export * from './product'`), so deleting
  it is an API removal with zero importers. Settled: **D-4** (delete) (was: delete vs demote to a
  suggestion list).
- `packages/schemas/src/quotation.ts:42-44` — the inline
  `[0, 5, 12, 18, 28].includes(n)` refine on `quotationLineInputSchema`, which
  `packages/schemas/src/performa-invoice.ts:14` re-exports as
  `piLineInputSchema` and `:46` wires into `updatePiSchema`. **One site, two
  document kinds.**
- The shape refinement replacing both must match §1 exactly and nothing stricter:
  non-negative, ≤ 2dp, ≤ 999.99. `numeric(5,2)` confirmed at
  `packages/db/src/schema/product.ts:38` and the three line tables.

Note the write path already tolerates a fractional rate:
`apps/web/lib/actions/products/create-product.ts:42` writes
`String(input.gstRate)`, and `apps/web/lib/actions/quotations/helpers.ts:228` /
`apps/web/lib/actions/pi/helpers.ts:222` write `gstRate.toFixed(2)`.

### A.4 — Read validation on the render path. Not protected.

Delete both `VALID_GST_RATES` arrays and both `toGstRate` functions:
`apps/workers/src/templates/quotation.tsx:46,49-56` and
`performa-invoice.tsx:35,37-44`. Each is called once
(`quotation.tsx:207`, `performa-invoice.tsx:135`) to feed `computeTax`, and the
rendered line already uses `Number(l.gstRate)` two lines later
(`quotation.tsx:227`, `performa-invoice.tsx:155`) — so the replacement is
`Number(l.gstRate)` at the call site and nothing else moves. Both are live on
the Typst path: `apps/workers/src/jobs/render-pdf.ts:33-34` imports them and
`:84`/`:86` calls them.

Downstream of them is already rate-agnostic and needs no change — enumerated by
an unlimited grep for `gstRate|gst_rate` over `apps/workers/src`, read in full:
`view-model.ts:131-133` derives `halfRateLabel`/`fullRateLabel` arithmetically
(a 3% doc yields `"1.5%"`, a 40% doc `"20%"`), `templates-typst/quotation.typ:78`
prints `str(l.gstRate) + "%"`, and the distinct-rate `Set`s at
`quotation.tsx:234` / `performa-invoice.tsx:161` already key on `Number`.

**F.89 is not in scope.** The bare-`Error` class stays; Option A only makes it
unreachable for shape-valid rates (spec §5.3, §6).

### A.5 — The catalogue form (spec §3). STOP AND ASK — see C-2 and C-3.

What exists today, read directly:

- `apps/web/app/(app)/catalog/new/new-product-form.tsx` is `'use client'` and
  `NewProductForm()` **takes no props**. Its `<select>` is `:119-131`, the option
  array `:125`, and the initial value `gstRate: '18'` at `:23`.
- `apps/web/app/(app)/catalog/new/page.tsx` is an async Server Component,
  `export const dynamic = 'force-dynamic'` (`:9`), renders `<NewProductForm />`
  with no props (`:31`), and carries the help copy *"GST rate: 0, 5, 12, 18, or
  28"* at `:28`.
- `apps/web/app/(app)/catalog/[id]/product-detail-sections.tsx` is `'use client'`
  and takes `{ product, canEdit }` only (`:114-120`); its `<select>` is
  `:253-265`.
- `apps/web/app/(app)/catalog/[id]/page.tsx` is an async Server Component,
  `force-dynamic` (`:18`), already awaits `getProductById` and `getAuditTrail`,
  and constructs the `product` prop at `:63-84`.

**The suggestion source does not exist and must be built. Concretely:**

1. A new exported query in `apps/web/lib/queries/products.ts` — that module has
   no distinct-value query today (read in full: `listProducts`,
   `getProductById`, `searchProducts`). Shape: inside `withTenant`, one
   `SELECT DISTINCT gst_rate FROM products WHERE tenant_id = $1` (decide whether
   to exclude `deleted_at IS NOT NULL` and `status <> 'active'` — the existing
   `listProducts` filters neither). No new index: the tenant-leading
   `products_tenant_status_ix` (`packages/db/src/schema/product.ts:68`) serves
   it, over a catalogue of 25 rows per tenant after F.81.
2. One extra query per page load on **two** routes, both already `force-dynamic`
   and both already issuing 1–2 queries. That is the whole runtime cost; it is
   not "small" by assertion, it is one indexed DISTINCT over tens of rows.
3. A new prop on each of the two client components, threaded from its page. **No
   new server action is implied** — both parents are Server Components.
4. **The rates come back as strings `'5.00'`, `'12.00'`, `'18.00'`** (the columns
   are `decimal(5,2)`; DEV.135). This is exactly the live hazard CLAUDE.md §5
   names: a DB-read rate string compared against a hand-written or typed
   literal. `['5','18'].includes('18.00')` is `false`. Normalise to a number on
   the boundary, in the one place, and say where.
5. The §3/§5.4b warning affordance does not exist in either file. It must be a
   **warning, not a rejection** — a rejection is a bound wearing different
   clothes. **D-6** decides its shape, because the choice determines whether it
   is testable at all: `apps/web` has **no jsdom/testing-library/component test
   harness** (`apps/web/package.json` lists `vitest` and nothing else of the
   kind), so the only mechanical check on this UI is Playwright.

Also on this day's desk, and both currently hardcode 18% rather than a list:
`new-product-form.tsx:23` and
`apps/web/app/(app)/catalog/import/product-import-form.tsx:46`
(`Number(r.gstRate ?? 18)`). Neither is a rate *list*; changing them is not
required by §1. Say what you did and why.

### A.6 — The prose that becomes false. Two of the five are protected.

`GST_RATE_MODEL_AUDIT.md` §1.1 enumerates five human-readable strings that go
stale with the constants: `packages/tax/src/types.ts:16` **(protected)**,
`packages/tax/src/compute.ts:138` **(protected)**,
`packages/schemas/src/product.ts:23`, `packages/schemas/src/quotation.ts:43`,
`apps/web/app/(app)/catalog/new/page.tsx:28`.

Additionally, and the spec does not mention it: **`CLAUDE.md` §5's closing
sentence — "The allowed rates are `0, 3, 5, 12, 18, 28` (the `*_gst_rate_chk`
constraints)" — becomes false the moment A.1 lands.** F.82 deliberately left it
because it was accurate *about the constraints*; this day changes the
constraints. `CLAUDE.md` is main-thread-only (§10.4). Settled: **D-7**.

**Not this day's:** `docs/RUNBOOKS.md` R8 (`:244`, `:274`) is F.90 — and note
that F.90's one residual dependency is §3, because R8 step 3 (`:250-254`) routes
a rate change through the dropdown this day replaces. Report that R8's step 3 is
now wrong in a *new* way; do not fix it (CLAUDE.md §11.2).

### A.7 — The §4 invariant test. Read C-5 first; then note what is and is not mechanical.

Where it goes: `packages/db/tests/` is 16 files, full listing read, and **none**
asserts a constraint's definition. Precedent for catalogue introspection in that
suite: `packages/db/tests/dealers.test.ts:53-55` queries `pg_class`. Both
`@dealerlink/tax` and `@dealerlink/schemas` are dependencies of
`packages/db` (`packages/db/package.json:34-35`), and
`quotation-engine-parity.test.ts:11` already imports `computeTax` — so a single
new file in `packages/db/tests/` can assert across all three layers.

**What it can assert mechanically:**

- **The DB side, strongly.** `pg_get_constraintdef` for the four named
  constraints equals the shape predicate. If anyone re-narrows one, the string
  changes and the test goes red. Non-vacuous and cheap.
- **Cross-layer acceptance, by probe.** For each of a named probe set, assert
  the INSERT succeeds *and* `createProductSchema` accepts *and*
  `quotationLineInputSchema` accepts *and* `computeTax` computes; and for a
  rejection set, that all four refuse. This is a **sample**, not a proof over the
  domain — state that in the test's own comment.
- **A non-vacuity control, which §4's "fails if either side is narrowed"
  requires and which must be *executed*, not asserted.** Re-narrow one
  constraint inside a rolled-back transaction (or on a throwaway commit), run the
  test, show it red, roll back. DEV.129's lesson is that a criterion checked for
  intent and never executed is worth nothing.

**What it cannot assert, said plainly.** The negative *"no enumerated rate list
exists on the rate path"* is not mechanically checkable in general. The only
mechanical form is a source scan over the audit's hand-maintained eight-path
list, asserting no `[0, 5, 12, 18, 28]`-shaped literal appears — and **that is
precisely the vacuous instrument CLAUDE.md §11.1 rulings 7 and 8 warn about**: it
passes when a new list appears in a new file, it passes when the list is spelled
differently, and it proves nothing about behaviour. It has exactly one virtue
worth keeping if the operator wants it: keyed to explicit paths, it fails
**loudly** (`readFileSync` throws) when a file is renamed, rather than silently.
The behavioural probes above are the real instrument. Do not present a source
scan as satisfying §4 on its own.

The two `<select>` sites cannot be covered by any unit test in this repository
(no component harness, A.5 point 5). Playwright is the only mechanical route.

### A.8 — Render and request coverage (spec §5.1). Read this before promising it.

Spec §5.1 requires end-to-end reach — catalogue → quotation → PI → order →
dispatch → PDF — and says F.84's fixture reaches the data layers only. Confirmed,
and here is what the remaining reach actually costs:

- **Dispatch cannot exercise a rate at all.** An unlimited grep for
  `gstRate|gst_rate` over `apps/workers/src`, read in full, returns hits only in
  the quotation loader, the PI loader, `templates/types.ts`, `view-model.ts`, the
  Typst quotation template and the two dead React components. The dispatch-note
  and payment-receipt paths carry **no rate**. The render exposure of this whole
  task is the quotation PDF and the PI PDF, and the PI inherits the quotation's
  totals block (`templates-typst/performa-invoice.typ:15,22`).
- **Adding a matrix entry is not available as render coverage.**
  `apps/workers/tests/pdf-snapshots.test.ts:129` reads
  the reference PDF named after each case's `label`, under
  `docs/pdf-references/`, for every case in
  `apps/workers/scripts/typst-matrix.json` (14 entries, read in full), so a case
  without a reference file fails on `readFileSync`. Those 14 are **Chromium**
  output forming a cross-renderer contract; the Chromium pipeline and its capture
  script are gone (F.83), and F.81's own ruling assigns the first Typst golden
  file to **F.4**. So: **do not add a matrix entry on this day.**
- **The cheap render check that is available:** a new test in
  `apps/workers/tests/` that renders a seeded document at a novel rate through
  the production path — `loadQuotationPdfData` → `buildViewModel` →
  `renderTypstPdf`, the same chain `pdf-snapshots.test.ts:69-93` uses — and
  asserts (a) the loader does not throw, and (b) the extracted text contains the
  expected rate strings (e.g. `3%` and its `1.5%` half). No golden file needed.
  **This requires a seeded document at that rate, which is F.84.** Which side of
  the F.55/F.84 boundary it lands on is settled by **D-1**.
- **There is no request-layer test harness.** `apps/web/lib/actions/wrap.test.ts`
  mocks `@dealerlink/db`, `next/headers` and the auth layer
  (`wrap.test.ts:12-31`); it exercises the wrapper, never a real action against
  a database. The only mechanical route to `createProduct` at a novel rate is
  Playwright — a **new** `verify-day-N.spec.ts` under `apps/web/tests/e2e/`,
  which is unprotected, **not** `critical-path.spec.ts`, which is.

## What this day does NOT do

- **Not** F.89 — the PDF loaders' bare `Error` class (spec §6).
- **Not** the `'18.00'`-vs-`'18'` select defect as a defect (spec §6) — but see
  C-3, which says §3 cannot leave the pricing editor untouched and still replace
  its select.
- **Not** the re-stamp-from-product-master behaviour
  (`apps/web/lib/actions/quotations/helpers.ts:215-216,228`,
  `apps/web/lib/actions/pi/update-pi.ts:55`) contradicting the stated contract at
  `packages/schemas/src/quotation.ts:31-32` (spec §6).
- **Not** an as-of / regime concept (spec §6; `GST_RATE_MODEL_AUDIT.md` §3.7).
- **Not** R8's text (F.90), **not** a new matrix entry or reference PDF (F.4),
  **not** a 3% or 0% seed fixture (F.84, F.87). **D-1** confirms that.
- **Not** `day8`'s float `computeTotals` (F.86), **not** `.gitignore` (F.88),
  **not** a rate-wise summary or HSN table (F.3/F.4).
- **No** bound above `numeric(5,2)`'s own — no `<= 100`, no `<= 40`
  (`GST_RATE_MODEL_AUDIT.md` §5.4a, operator ruling).

---

## Phase B — verification

**Must stay green** (state which ran locally and which in CI):

- `pnpm --filter workers test` — all 14 `pdf-snapshots.test.ts` cases by name,
  text-identical against the Chromium references.
- `cd apps/workers && pnpm exec tsx scripts/determinism-check.ts` → MATCH, with
  `git diff --stat apps/workers/scripts/determinism-expected.json` empty.
- `pnpm --filter @dealerlink/db test` — including
  `quotation-engine-parity.test.ts` and `multi-rate-corpus.test.ts`.
- `pnpm --filter @dealerlink/tax test`, `pnpm --filter @dealerlink/schemas test`
  — **with the five C-1 inversions rewritten, not deleted**. An inverted test
  keeps testing the boundary; a deleted one tests nothing.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm verify`,
  `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check`.

**New coverage this day adds:**

- The A.7 invariant test, with its executed non-vacuity control.
- The rewritten five: `dealers.test.ts:153` and `quotation.test.ts:152` now
  assert the CHECK **accepts** a previously-rejected shape-valid rate and still
  **rejects** a shape-invalid one (negative; > 999.99);
  `product.test.ts:48-56` likewise at the Zod layer; `compute.test.ts:324,328`
  likewise at the engine — the last two inside the protected fixture set, authorised by **D-3**.
- No render check per A.8: **D-1** places it in F.84, not here.
- A `verify-day-N.spec.ts` only if the day ships a user-visible surface. §3 does
  ship one, so it should — and it is the only mechanical check on the warning
  affordance.

**The three separate measurements spec §5.5 requires.** Do not collapse them:

```
# 1 — TEXT against the Chromium contract
pnpm --filter workers test                 # pdf-snapshots.test.ts, 14 named cases

# 2 — BYTES against the pre-change render
pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/f55-post
( cd /tmp/f55-post && sha256sum *.pdf | sort -k2 ) > /tmp/f55-post.sha
diff /tmp/f55-pre.sha /tmp/f55-post.sha    # must be empty

# 3 — BYTES across two independent reseeds (full db:seed + long-serial fixture each time)
diff /tmp/f55-reseed1.sha /tmp/f55-reseed2.sha   # must be empty
```

They answer different questions and each can fail without the others: 1 is
content against a foreign renderer, 2 is bytes against this day's own before, 3
is bytes against a second seed. Report all three explicitly.

---

## Phase C — closeout

Follow `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" in full.
Unusual for this day:

- **C2 before C4**, and it matters more than usual: `pnpm test` writes rows to
  the shared dev DB (DEV.91) and the A.7 probe test inserts products. Reseed
  deliberately between steps and say when you did.
- **C5:** F.55's own row; plus unblock F.84 and note whether its scope widened
  (**D-1**). Anything else found goes in as a **row**, never folded in (§11.2).
- **C6:** a deviation entry is near-certain — at minimum for C-1 (the audit's
  inverting-test table was short by one) and for whichever of C-2 to C-5 the
  operator resolves against the spec's literal wording.
- **C6a:** check every new id is free before writing it. **C6c:** if the A.7
  invariant test grows into a scanner over `git ls-files`, `git add` it before
  validating it.
- **C7a:** `verifier` before the PR. A FAIL stops the day (CLAUDE.md §10.3).

---

## Acceptance criteria

Each names the command or file that decides it.

1. All four `*_gst_rate_chk` constraints are shape-only in the live database.
   → the A.7 test's `pg_get_constraintdef` assertion, via
   `pnpm --filter @dealerlink/db test`.
2. A product row at 40 and at 3 inserts and reads back.
   → the A.7 probe INSERTs.
3. `createProductSchema` and `quotationLineInputSchema` accept 3, 40 and 100 and
   reject −1 and 1000. → `pnpm --filter @dealerlink/schemas test`
   (`product.test.ts`, plus a new `quotation.test.ts` — the package has no
   quotation test today; full directory listing read).
4. `computeTax` computes at 3, 40 and 100 and still throws `INVALID_GST_RATE` on
   a negative, a NaN and a > 999.99 value.
   → `pnpm --filter @dealerlink/tax test` (`compute.test.ts`). **Protected
   fixture — authorised by **D-3**.**
5. A quotation PDF for a document at a novel rate renders, and its tax block
   shows the rate and its half. → the A.8 worker test. **Out of scope per D-1 (needs
   F.84's fixture).**
6. All 14 reference cases still match on **text**. → `pnpm --filter workers test`.
7. All 14 renders are **byte-identical** to the A.0 pre-change hashes.
   → `diff /tmp/f55-pre.sha /tmp/f55-post.sha`, empty.
8. All 14 renders are **byte-identical across two independent reseeds**.
   → `diff /tmp/f55-reseed1.sha /tmp/f55-reseed2.sha`, empty.
9. `determinism-expected.json` unmodified and `determinism-check` prints MATCH.
   → `pnpm exec tsx scripts/determinism-check.ts` +
   `git diff --stat apps/workers/scripts/determinism-expected.json`.
10. No file under `docs/pdf-references/` and no entry in
    `apps/workers/scripts/typst-matrix.json` changed.
    → `git diff --name-only main`.
11. The five C-1 tests are **rewritten to assert the new boundary**, and none is
    skipped, `fixme`-d or deleted. → `git diff` on the five files, plus the
    green suites in 3 and 4.
12. The A.7 invariant test goes **red** when either side is narrowed.
    → the executed control in A.7 (re-narrow one constraint in a rolled-back
    transaction, run the test, show red). Report the output.
13. `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check` exit 0; `pnpm lint`,
    `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm verify` green.

Criteria 6, 7 and 8 are deliberately three statements (spec §5.5). Criteria 4
and 11 both bind on `compute.test.ts`. **D-3 authorises editing it**, scoped to
the two inversions plus new acceptance cases at 3, 40 and 100 — so both criteria
are satisfiable. Do not widen that authorisation.

---

## STOP AND ASK — what is authorised, and what still stops the day

Three protected-surface items are **authorised and scoped** by D-3 and D-8. Do
not widen them.

- **The migration** (A.1) — authorised: the four rate CHECKs, drop-and-re-add to
  `>= 0`. No other schema change.
- **`packages/tax/src/compute.ts`** (A.2) — authorised: the shape guard only,
  written exactly as D-3 specifies.
- **`packages/tax/tests/compute.test.ts`** — authorised: the two inversions at
  `:324` and `:328`, plus new acceptance cases at 3, 40 and 100. Nothing else in
  that file, and **no fixture changes anywhere in `packages/tax`**.
- **`apps/web/tests/e2e/critical-path.spec.ts:166`** — authorised: that one
  line, `selectOption` to a fill on the numeric input. That line only.

These still stop the day:

- **`packages/tax/src/types.ts`** if the change is anything beyond widening the
  `GstRate` type — report the shape before writing it.
- **Any movement in any of the 14 reference cases** — a finding, never a
  re-baseline (§11.1 rulings 1 and 4).
- **If the widening `ADD CONSTRAINT` probe aborts**, stop: it contradicts A.1's
  premise.
- **A consumer of `GST_RATES` outside `packages/**`** — see D-4. Stop and
  report; do not adapt it in passing.
- **Any deviation from this scope**, including a "quick fix" to R8 or the CSV
  default. The `'18.00'` select is no longer out of scope — see D-2.
- **Any decision this document does not settle.** Seven were open and seven are
  answered; an eighth is a stop.

---

## Settled decisions

Seven questions, seven answers. Two spec corrections at D-9 and D-10, both of
them the operator's errors.

**D-1 (was Q1) — F.84 carries render and request coverage, not F.55.**
Option (b). This day's diff stays free of seed data, which is the only thing
that can move a rendered document; under (a), validation and seed rows change on
the same day and a moved render could not be attributed to either. F.84's
"hard-blocked on F.55" ordering stands and needs no revisiting.

The consequence must not be glossed: **F.55 lands with spec §5.1 / acceptance
criterion 5 unmet.** Say so plainly in F.55's notes, with the reason and a
pointer to F.84, and re-scope F.84 in the same closeout to carry the fixture,
the render test and the e2e spec.

**D-2 (was Q2) — replace both `<select>`s.**
Option (a). Option (b) would leave the system unable to *edit* a product to a
new rate, which is R8's actual use case and the reason that runbook failed.

Consequence: the `'18.00'`-vs-`'18'` mismatch at
`product-detail-sections.tsx:255` is **dissolved by removing the affordance**,
not fixed. Record it that way. `docs/F3_F4_SPEC.md` §5 currently assigns that
item to F.3 — note the dissolution there rather than deleting the line (D-10).

**D-3 (was Q3) — keep the `typeof` check, and `compute.test.ts` may be edited.**
The guard is:

    typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 999.99

The fail-loud property is worth preserving: it guarantees every caller coerces
rather than silently passing a driver string. A guard written `Number(x) < 0`
would accept `'18.00'` and lose it.

The `compute.test.ts` authorisation is scoped to the two inversions at `:324`
and `:328`, plus new acceptance cases at 3, 40 and 100. Nothing else in that
file. No fixture changes anywhere in `packages/tax`.

**D-4 (was Q4) — delete `GST_RATES`.**
Option (a). A rate list exported from the shared schema package is exactly the
shape §1 removes, and `export *` makes it public API.

One check first: the measurement covered `packages/**`. **Confirm by
enumeration that no consumer exists in `apps/**` before deleting.** If one does,
stop and report rather than adapting it in passing.

**D-5 (was Q5) — restate the invariant over the stored domain.**
Option (a): *every value readable from a rate column is accepted by Zod, by the
engine and by the render path.* Option (b) would have the application silently
alter a tax rate, which is worse than rejecting one. §1's two-decimal rule
stands.

**D-6 (was Q6) — inline warning plus an explicit second click.**
Option (a). A warning nobody can test is indistinguishable from no warning, and
this item sits on Option A's ledger precisely so it would not be discovered
later. `window.confirm` is out.

**D-7 (was Q7) — update `CLAUDE.md` §5 in this PR.**
Option (a). It is the most-read document in the repo, and a row means it states
a false constraint set for however long the row waits (ruling 6). Replace the
enumeration with the shape rule and cite F.55. `docs/STAGE_F_BUILD_v3.md` §9
needs no edit — it points rather than copies, which is the F.80 pattern working.

**D-8 — C-2 resolved: `critical-path.spec.ts:166` may change, that line only.**
`selectOption({ label: '18%' })` becomes a fill on the numeric input. The
protection exists to prevent refactoring, not to freeze a spec against a
deliberate UI change that it asserts on. Nothing else in that file.

**D-9 — spec §2 is wrong and is corrected here.**
"Read validation (the five §3.3 sites) — Delete" is true of **two** of them: the
`VALID_GST_RATES` arrays plus `toGstRate` in the two worker templates. The other
three are `as GstRate` widens with no runtime effect.

**Do not delete the try/catch blocks at `pi/helpers.ts:77-80` and
`quotations/helpers.ts:184-189`.** They route `EMPTY_LINES`,
`NEGATIVE_QUANTITY`, `NEGATIVE_UNIT_PRICE`, `NEGATIVE_DISCOUNT`,
`DISCOUNT_EXCEEDS_SUBTOTAL`, `DISCOUNT_PERCENT_OUT_OF_RANGE` and `EMPTY_STATE`
to `AppError('VALIDATION')`. Deleting them would silently drop six unrelated
validation paths — a worse defect than the one being fixed, and one that would
have passed review because the spec said delete.

Leave the casts as harmless no-ops. Amend `docs/F55_SPEC.md` §2 as a dated
correction carrying the reason, not a silent rewrite.

**D-10 — spec §4's third bullet is unsatisfiable and is corrected here.**
Replace *"Any value the DB accepts, the code accepts"* with D-5's wording.
Postgres accepts the input `0.125` and stores `0.13`, while §1's two-decimal
rule makes Zod reject it — so the two criteria contradict at the input boundary
and agree over the stored domain.

Amend as a dated correction. Amend `docs/F3_F4_SPEC.md` §5 per D-2 in the same
pass.

**D-11 — five inverting tests, not four, is ruling 7 again.**
The audit's §5.4 table carried a count short by one while §5 row 1 carried the
correct enumeration. One line in the day's notes: the enumeration survived, the
count did not. That is the third occurrence.

---

## Before the work starts

File these two rows first. They are findings from the spec rather than work for
this day, and F.78 exists because findings left in prose get lost.

- **Re-stamp from product master on draft save**
  (`GST_RATE_MODEL_AUDIT.md` §3.3) contradicts the stated contract at
  `quotation.ts:31-32`. A defect regardless of which option was chosen.
- **No as-of / regime concept** (§3.7). Option A makes a historical 12% document
  *render*; it does not make it *identifiable* as to the regime it was issued
  under. That matters for F.6 — a tax invoice states the rate applied — and for
  credit notes and reprints against pre-22-September-2025 documents. A
  standalone row with a pointer from F.6; D-1 resolved to (b), so it does not
  fold into F.84.

Then run the day.
