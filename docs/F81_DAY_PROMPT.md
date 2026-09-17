# F.81 — Multi-rate seed data + mixed-rate reference case

> **STATUS: AMENDED.** Drafted by `prompt-drafter` and amended by the operator
> on 2026-09-17. Q3, Q4 and Q7 are **settled** and now appear as instructions,
> not questions. Q1, Q2, Q5 and Q6 remain open and can be settled on the
> morning of. The scope narrowed: this day ships **seed data only**.

**Goal:** make a multi-rate, multi-HSN GST document exist in the seed corpus and
in the reference-PDF matrix, so F.3 and F.4 can be _tested_ rather than merely
built. Seed and fixture work only.

**Estimated time:** 1 day, plus reseed/render cycles (each full `pnpm db:seed`
plus a 14-case render is minutes, and this day runs it at least four times).

---

## Why this task exists

F.3/F.4 build a rate-wise GST summary and an HSN/SAC table. Against today's
corpus every assertion they add would pass whether or not the feature works,
because no seeded document carries two rates or two HSNs:

- `packages/db/src/seeds/day5.ts:259-337` — `generateProducts()` returns 20
  products; `gstRate: '18'` at `:270`, `:295`, `:320` and `hsnCode: '85414300'`
  at `:269`, `:294`, `:319`. Read in full; there is no other rate in that
  function.
- `packages/db/src/seeds/day13.ts:173-182` adds a **21st** product per tenant —
  `hsnCode: '85414011'`, `gstRate: '18.00'`. So the catalogue after a full seed
  is 21 products, two HSNs, **one rate**. (The F.81 notes and
  `docs/F3_F4_AUDIT.md` §7.4 say "20 products / one HSN"; that is true of
  `generateProducts()` and understates the seeded catalogue by one product and
  one HSN. Neither correction changes the conclusion: one rate.)
- `apps/workers/scripts/typst-matrix.json` — 14 cases, read in full. None is
  mixed-rate.
- `docs/SEED_DATA.md:22` already asks for "real GST rates (5%, 12%, 18%, 28%)".
  The single-rate catalogue is drift from the seed spec, not only a gap.

Authority for _what to produce_: `docs/F3_F4_SPEC.md` §1 — at least one product
at 5% with a distinct HSN, one at 18%, both purchasable onto one document, and a
reference case exercising the result; a third rate preferred, because three
groups catch ordering and pluralisation bugs two do not.

## Read before starting

- `docs/F3_F4_SPEC.md` §1 (the requirement), §2 (the target output), §3
  (grouping/money rules), §6 (determinism), §9.2 (the open item this day
  answers).
- `docs/F3_F4_AUDIT.md` §7.4 (the fixture problem), §5 (HSN absent), §1.3 (the
  rate label degrades to an empty string on a mixed-rate PDF), §8.3.
- `docs/stage-f-tasks.json` — F.81, F.3, F.4, F.6, F.55, F.67.
- `CLAUDE.md` §5 (tax + state), §10.1 (stop-and-ask), §11.1 rulings 1, 4, 7, 8.
- `docs/STAGE_F_BUILD_v3.md` §9 (protected surfaces), §7 (client evidence).
- `docs/pdf-references/README.md` in full, and `docs/RUNBOOKS.md` R25/R26.
- Seeds, in full: `packages/db/src/seeds/` — `index.ts`, `day5.ts`, `day6.ts`,
  `day7.ts`, `day8.ts`, `day11.ts`, `day12.ts`, `day13.ts`, `clock.ts`,
  `pin-created-at.ts`, `smoke-auth.ts` (11 files, the complete directory).

---

## Phase A — the work

### A.0 — Install `typst`, then establish TWO baselines. Before any seed work.

**The first action of this day is installing the `typst` binary.** Nothing else
starts until `pnpm --filter workers test` can actually render. The binary is
absent from the dev container — `resolveTypstBinary`
(`apps/workers/src/pdf/typst.ts:44`) throws "typst binary not found. Set
`TYPST_BIN` or put `typst` on PATH". The workers image installs it; the pinned
version is in `docs/RUNBOOKS.md` R26. **Use that pinned version** — a different
one re-baselines every reference case for reasons that have nothing to do with
this task.

**Why this is first and not later.** A post-change run that passes proves the
renders _work_. It does not prove they are _unchanged_, which is the actual
question. Without a pre-change run there is nothing to compare against, and
"green afterwards" silently substitutes for "identical before and after".

**Baseline 1 — verify commit `e32c350`, which was never render-checked.**
That commit switched `day8`'s `computeTotals` to per-line rounding (Q4, option
d). It was verified against the database — all 182 money values byte-identical,
a control run proving zero tables differ because of it, 172 db tests green —
but **its effect on the rendered PDFs was never measured**, because `typst` was
unavailable when it was made. Close that gap first:

```
git stash push packages/db/src/seeds/day8.ts   # or check out e32c350^ for that file alone
pnpm db:seed
psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f apps/workers/scripts/long-serial-fixture.sql
cd apps/workers && pnpm exec tsx scripts/determinism-check.ts     # expect MATCH
pnpm --filter workers test                                        # 14/14 green
sha256sum docs/pdf-references/*.pdf | sort -k2 > /tmp/f81-pre-e32c350.sha
# restore the change, then repeat the four commands above into
# /tmp/f81-post-e32c350.sha and diff the two. Empty diff => e32c350 is render-neutral.
```

If that diff is **not** empty, stop and report it. It means the rounding fix
moved a rendered document, which contradicts the database evidence and is a
finding, not something to re-baseline.

**Baseline 2 — the pre-seed-work baseline for this task.** With `day8` back in
its committed state, record the same hashes again as the _before_ set that this
day's own seed changes will be measured against. Re-run the full sequence after
the seed module lands and diff. Any movement in any of the 14 is a finding, not
a re-baseline (CLAUDE.md §11.1 rulings 1 and 4).

### A.1 — New seed module, running AFTER every document-producing module

**Do not add the new products inside `generateProducts()` (day5).** Every
downstream seed module picks products positionally out of an unordered select,
so a new row in day5 perturbs documents that already have reference PDFs:

- `day7.ts:229` — `pick(productRows, seed * 19 + j * 5)` is `index % arr.length`
  (`:96-98`), over `select(...).from(products)` with **no ORDER BY** (`:120-122`).
  Changing the row count changes every deal's product lines.
- `day8.ts:357` — `usableProducts[lineIdx % usableProducts.length]`, over an
  unordered select (`:321-331`). The `lineIdx` values in `PLANS` are only 0, 1
  and 2, so this survives _appending_ — but only because physical row order
  happens to be insertion order. That is an unpinned assumption.
- `day12.ts:113-116` and `day13.ts:161-165` each take `LIMIT 1` with no
  `ORDER BY`.

The safe shape is a **new module that runs after `day13.ts` and before
`pin-created-at.ts`**, so nothing that already exists can pick up the new
products:

1. Create `packages/db/src/seeds/multi-rate.ts` (name open — see Open
   questions). It must follow the house pattern of `day12.ts` / `day13.ts`:
   dotenv bootstrap, `DATABASE_DIRECT_URL ?? DATABASE_URL`, loop over active
   tenants, `set_config('app.tenant_id', …, true)` per transaction, and a
   tag-based idempotent cleanup at the top so a re-run is clean.
2. Register it in `packages/db/package.json`: add `db:seed:multi-rate` and
   insert it into the `db:seed` chain (`:16`) **between `day13.ts` and
   `pin-created-at.ts`** — so `pin-created-at` pins its rows automatically.
3. Every date it writes comes from `packages/db/src/seeds/clock.ts` —
   `seedNow()`, `daysAgo(n)`, `isoDaysAgo(n)`, `seedFiscalYear()`. No
   `new Date()`, no `Date.now()`, anywhere in the file. `SEED_EPOCH_ISO`
   (`clock.ts:39`) is the single pinned instant, default
   `2026-09-11T17:30:00.000Z`, overridable by the `SEED_EPOCH` env var; CI and
   any capture run use the default.
4. Because the module runs **before** `pin-created-at.ts`, its rows are pinned
   for free: `pin-created-at.ts:63-79` lists the 15 tables it rewrites, which
   includes `products`, `quotations`, `performa_invoices`, `orders` and their
   line tables. **This is the whole reason for the placement.** Anything
   inserted _after_ that pass escapes it — which is exactly the trap
   `apps/workers/scripts/long-serial-fixture.sql` fell into and now documents at
   `:18-27`: it inserts post-`db:seed` and so pins `\set pinned_ts
'2026-04-01 10:00:00+00'` by hand on every row (`:73`, `:78`, `:84`, `:89`,
   `:97`, `:104`). If any part of this day's work has to be a `.sql` fixture run
   after `pnpm db:seed`, it must do the same — explicit timestamps on every
   insert, business date at 10:00 UTC, the rule `pin-created-at.ts:56-57` uses.

### A.2 — The products

Add new products in the new module (one set per tenant), leaving the existing 21
untouched. Required by spec §1: one at 5%, one at 18%, with distinct HSN codes.
See Open questions for the third rate and for the HSN assignment.

Constraints that are facts, not preferences:

- The rate must come from `{0, 5, 12, 18, 28}`. **3% is out until F.55 lands.**
  This is not only the type union: `packages/tax/src/compute.ts:7` is
  `const VALID_GST_RATES = [0, 5, 12, 18, 28];` and it throws; the PDF loaders
  have their own copies at `apps/workers/src/templates/quotation.tsx:46` and
  `performa-invoice.tsx:35` and they throw too
  (`quotation.tsx:49-53`, used at `:207`); `packages/schemas/src/product.ts:4`
  and `quotation.ts:42` reject it at the Zod layer; the two `<select>` arrays at
  `catalog/new/new-product-form.tsx:125` and
  `catalog/[id]/product-detail-sections.tsx:259` omit it. A 3% product would
  seed and then make its own document un-renderable.
- `gst_rate` is `decimal(5,2)`; write it as a string (`'5.00'`), as every other
  seed does, and expect it back as `'5.00'` (DEV.135 / audit §8.1).
- HSN must match `^[0-9]{4,8}$` (`packages/schemas/src/product.ts:18`).
- State values stay 2-letter ISO codes (CLAUDE.md §5). This day introduces no
  new dealer, so nothing new to get wrong — do not add one.

### A.3 — The mixed-rate documents

Create, in the same module, using the counters via the same
`INSERT … ON CONFLICT … RETURNING last_value` pattern day11/day12/day13 use:

- **One mixed-rate quotation** (intra-state, so it exercises the CGST/SGST pair
  split) with at least one line per rate.
- **One mixed-rate PI** derived from it, three-party or not as you like, but
  leave place-of-supply derivation exactly as ADR-012 specifies — this day
  changes no tax rule.
- **One mixed-rate order**, if the operator takes that option — see Open
  questions. F.3's GST-report work (spec §7) groups over `orders`
  (`apps/web/lib/reports/gst-summary.ts:87`, `FROM orders o` at `:83`), so
  without a mixed-rate order that half of F.3 is as untestable as F.4 is today.

Rules for how these documents are built:

1. **Line order must not already be ascending by rate.** Spec §3 requires rate
   groups ordered ascending; if line 1 is the lowest rate the sort is untested.
   Put the highest rate first.
2. **SETTLED (Q4) — fix `computeTotals` to round per line, then seed with it.**
   `day8.ts`'s local `computeTotals` (`:235-284`) rounds the tax totals at
   **document** level (`:271-273`), while `packages/tax` rounds **per line**
   and sums (`compute.ts:15-20`). `packages/tax/src/round.ts` documents
   line-level rounding as _the_ Indian GST convention, citing the BRD reference
   PO and Tally — so the seed is the one that is wrong, and it writes stored
   totals no production path would ever write. The 18%-only corpus has hidden
   this for the whole project. **Change `computeTotals` to round each line's
   tax to 2dp and sum the rounded values**, mirroring `compute.ts`'s model
   (round the line subtotal, round the line discount, round each line's
   CGST/SGST/IGST), then seed the new documents with it.

   _Why this is safe, measured 2026-09-17 rather than deduced._ The change was
   applied and the database reseeded from scratch on both sides. All 182
   money values across `quotations`, `quotation_lines`, `performa_invoices`,
   `performa_invoice_lines`, `orders` and `order_lines` were **byte-identical**.
   A wider content hash over all 35 tables (every non-UUID column) showed 14
   tables differing — but a **control run with identical code** produced
   **exactly the same 14**, so every observed difference is reseed
   nondeterminism (password salts, tokens) and **none is attributable to the
   edit**. `pnpm --filter @dealerlink/db test`: 172 passed, including
   `quotation-engine-parity.test.ts`. NOT verified here: the 14 reference PDFs,
   because the `typst` binary is absent from the dev container — **run
   `pnpm --filter workers test` and `scripts/determinism-check.ts` on the day
   to close that gap.**

   _Why it matters for this task specifically._ 5% is one of only two rates in
   the allowed set that is rounding-sensitive under the intra-state CGST/SGST
   split, and this day is required to introduce it. Measured over integer line
   subtotals: CGST at half of 3% (1.5%) and half of 5% (2.5%) lands off 2dp for
   50% of integers; 0, 12, 18 and 28 are exact on every integer because their
   halves are whole percentages. Divergence needs **two or more lines at a
   sensitive rate on one document** — with a single 5% line the two models agree
   trivially. A sweep of 3-line mixed-rate documents (two 5% lines + one 18%),
   integer prices, no discount, found **500 of 1500 diverge** by ₹0.01 on CGST
   and SGST and ₹0.02 on the total. Inter-state is safe: IGST at 5% is the full
   rate and is exact on every integer.

3. **Stored totals must satisfy the existing parity invariant.**
   `packages/db/tests/quotation-engine-parity.test.ts:51-96` re-runs `computeTax`
   over **every** seeded `QT-%` quotation and asserts exact string equality on
   all seven header money columns. `day8.ts`'s local `computeTotals`
   (`:235-284`) rounds the tax totals at document level (`:271-273`), while
   `packages/tax` rounds per line and sums (`compute.ts:15-20`) — the two agree
   on today's single-rate corpus, and mixed rates plus a discount is exactly
   where they could stop agreeing. See Open questions for which way to resolve
   it. Whichever is chosen, the parity test decides it, and a red parity test is
   a finding to report, not a number to adjust.
4. Do not give the new quotation a `deal_id`, and do not change `day8.ts`'s
   `PLANS`, `day11.ts`'s `PLANS` or any counter allocation that runs earlier.
   Allocating a PI or an order number before `day13.ts` shifts **ORD-2026-0019**,
   which `apps/workers/scripts/long-serial-fixture.sql:46` pins by name and
   raises on at `:59-63`, and which `dispatch-note.typ:50` prints on the face of
   DSP-2026-0005.

### A.4 — NO reference case (SETTLED, Q3)

**This day adds no matrix entry and captures no PDF.** Operator decision,
2026-09-17; `docs/F3_F4_SPEC.md` §1 and §6 were amended to match.

The reasoning, so it is not re-opened: the 14 files in `docs/pdf-references/`
are **Chromium output forming a cross-renderer contract** that the Typst
templates must match (`docs/pdf-references/README.md:1-9`). Anything captured
now is a **Typst self-capture** — a regression freeze against our own renderer.
Those are different guarantees, and filing both in that directory at equal
status is a category error. Capturing a mixed-rate baseline before F.4 would
additionally freeze audit §1.3's defect — the empty rate label on a mixed-rate
totals block — as though it were correct.

**F.4 creates the mixed-rate golden file**, as a Typst snapshot, once the
rendering is right, landing with the snapshot tests that assert on it.

Two consequences for this day:

- `apps/workers/tests/pdf-snapshots.test.ts:57` reads the matrix and `:129`
  reads the PDF named by each case's label, from `docs/pdf-references/`. Since
  no case is added, **all 14 existing cases must still pass unchanged** — any
  movement in any of them is a finding, not a re-baseline.
- The capture tool both `docs/pdf-references/README.md:21-22` and
  `docs/RUNBOOKS.md:1667` name, `apps/workers/scripts/capture-references.ts`,
  **does not exist** — it went with the Chromium pipeline on Day 27. Filed as
  **F.83**; not this day's to fix. When F.4 does capture, model it on
  `apps/workers/scripts/determinism-check.ts:51-70`, which renders through the
  production path (`renderTypstPdf` + `buildViewModel` + `resolveGeneratedAt`),
  **not** on `scripts/render-typst.ts`, whose view model is a duplicate
  (`:90-110`, `:236-238`) of `src/pdf/view-model.ts` and can drift.

### A.5 — Documentation the day owns

- `docs/SEED_DATA.md` — the catalogue is no longer single-rate. `:22` already
  asks for "real GST rates (5%, 12%, 18%, 28%)", so this closes drift from the
  seed spec rather than introducing something new.
- **Not** `docs/pdf-references/README.md` — no case is added, so there is
  nothing to record there. **Not** `docs/RUNBOOKS.md` R25 — its capture recipe
  names a script that no longer exists, which is filed as **F.83** and is not
  this day's to fix.

## What this day does NOT do

- No schema change, no migration, no new column, no money column.
- Nothing in `packages/tax` — not the engine, not `compute.test.ts`, not its
  inline fixtures. (Importing `computeTax` from a seed is _use_, not change;
  it is still flagged below.)
- No rate-wise or HSN-wise grouping, no template change, no screen change, no
  report change. Those are F.3 and F.4.
- No round-off (F.6), and nothing that disturbs the insertion point at
  `apps/workers/src/templates-typst/quotation.typ:107-108`.
- No fix for the 3% mismatch (F.55), the `<select>` defect at
  `product-detail-sections.tsx:255` (F.3/spec §5), or the empty rate label on a
  mixed-rate PDF (audit §1.3, F.4). **The last one will now be visible in a
  rendered document for the first time. Report it; do not fix it.**
- No `ORDER BY` added to the unordered selects named in A.1, and no other
  determinism hardening of existing seed code. Adding one reorders products and
  would change existing references — it is a separate row, not a drive-by.

---

## Phase B — verification

Must stay green (state which ran locally and which in CI):

- `pnpm --filter workers test` — all 14 existing `pdf-snapshots.test.ts` cases,
  by name. Any change in any of the 14 is a finding, not a re-baseline.
- `cd apps/workers && pnpm exec tsx scripts/determinism-check.ts` — MATCH.
  `determinism-expected.json` must **not** be re-recorded (`:18-19`).
- `pnpm --filter @dealerlink/db test` — in particular
  `quotation-engine-parity.test.ts` (now covering the new mixed-rate quotation)
  and `quotation.test.ts:372-416`.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm verify`, `pnpm check:paths`,
  `pnpm check:ids`, `pnpm plan:check`.

New coverage this day adds:

- A seeded mixed-rate quotation (+ PI, + order if in scope), asserted by a test
  that the corpus contains at least one document with two distinct
  `gst_rate` values and two distinct `hsn_code` values on its lines. Put it
  where the other corpus-shape assertions live, `packages/db/tests/`.
- The two-reseed reproduction below.

**The two-reseed check, as a command sequence.** Run twice, from an empty
database each time, and compare:

```
# pass 1
pnpm db:seed
psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f apps/workers/scripts/long-serial-fixture.sql
cd apps/workers && pnpm exec tsx scripts/determinism-check.ts        # MATCH
pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/mr-pass1
sha256sum /tmp/mr-pass1/*.pdf | sort -k2 > /tmp/mr-pass1.sha

# pass 2 — identical, into /tmp/mr-pass2
# then
diff /tmp/mr-pass1.sha /tmp/mr-pass2.sha       # must be empty
```

All 14 cases must hash identically across the two passes. No case is added by
this day, so this is a **regression check on the existing corpus**, not the
qualification of a new baseline — that qualification belongs to F.4, per spec
§6. If any case moves, **report which field moved** — do not exclude it and do
not re-baseline (CLAUDE.md §11.1 rulings 1 and 4).

Add a `verify-*.spec.ts` only if the day produces a user-visible surface. It
does not, so state that and say why rather than adding an empty spec.

---

## Phase C — closeout

Follow `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" in full.
Unusual for this day:

- C2/C4 ordering matters more than usual: `pnpm test` writes to the shared dev
  database, and this day's evidence is all seed-state-dependent. Reseed
  deliberately between steps and say when you did.
- C5: F.81's own row, plus a follow-up row (via `plan-keeper`) for a 3% seed
  product once F.55 lands — filed, not done (CLAUDE.md §11.2).
- C6: a deviation entry is likely here — the day will touch at least one claim
  in the notes that the code contradicts (see Found while reading).
- C7a: `verifier` before the PR. A FAIL stops the day.

---

## Acceptance criteria

Each names what decides it.

1. The seeded catalogue contains, per tenant, at least one product at 5.00 and
   at least one at 18.00, with at least two distinct HSN codes among the
   multi-rate set. → `psql "$DATABASE_DIRECT_URL" -c "select sku, hsn_code,
gst_rate from products order by sku"` after `pnpm db:seed`; the enumeration
   is read in full, not counted.
2. At least one seeded quotation has lines at two distinct rates and two
   distinct HSNs. → the new test in `packages/db/tests/`, run by
   `pnpm --filter @dealerlink/db test`.
3. Its PI carries the same two rates. → same test.
4. Every one of the 14 existing reference cases still passes text comparison. →
   `pnpm --filter workers test` (`pdf-snapshots.test.ts`, 14 named cases).
5. DSP-REF-0500 still hashes to the value in `determinism-expected.json`. →
   `cd apps/workers && pnpm exec tsx scripts/determinism-check.ts` prints MATCH,
   with the file unmodified (`git diff --stat
apps/workers/scripts/determinism-expected.json` empty).
6. All 14 rendered cases are byte-identical across two independent full
   reseeds. → the `diff /tmp/mr-pass1.sha /tmp/mr-pass2.sha` sequence above,
   empty output.
7. `quotation-engine-parity.test.ts` passes on the new mixed-rate quotation. →
   `pnpm --filter @dealerlink/db test`.
8. `long-serial-fixture.sql` still resolves ORD-2026-0019. → the fixture runs
   without raising (`:59-63`); it fails loudly if the seed shifted.
9. No file under `packages/tax/`, no migration, and no schema file is modified.
   → `git diff --name-only main` contains nothing under `packages/tax/`,
   `packages/db/migrations/` or `packages/db/src/schema/`.
10. **No reference case was added** and `docs/pdf-references/` is untouched. →
    `git diff --name-only main` contains nothing under `docs/pdf-references/`
    and nothing in `apps/workers/scripts/typst-matrix.json`.
11. `computeTotals` rounds per line, and the existing corpus is unmoved. →
    `pnpm --filter @dealerlink/db test` green, and the 14 reference cases
    unchanged per criterion 4.

Criteria 4, 5 and 6 are deliberately three separate statements: 4 is content
against the Chromium contract, 5 is bytes against a recorded hash, 6 is bytes
against a second seed. They can all hold at once, and each can fail without the
others.

---

## STOP AND ASK — before the day starts

Three earlier items here are now **settled** and have moved into the body: the
reference case (Q3 → A.4), the mixed-rate order (in scope → A.3), and how the
totals are produced (Q4 → A.3). What remains:

- **If `quotation-engine-parity.test.ts` goes red at any point**, stop. It is a
  finding to report, not a number to adjust (CLAUDE.md §11.1 rulings 1 and 4).
- **If the day needs `computeTax` imported from `@dealerlink/tax`** after all —
  it should not, since Q4 fixes `computeTotals` in place — say so before doing
  it. That is use, not modification, but `packages/tax` is named in
  CLAUDE.md §10.1 and belongs in front of the operator, not in the diff.
- **Any deviation from this scope**, including an `ORDER BY` that "obviously
  should be there".

---

## Open questions for the operator

**Q1 — The third rate.** Spec §1 prefers three groups. 5 and 18 are certain. The
third must come from `{0, 12, 28}`; all three are accepted by every rate list on
the render path, so none of them depends on F.55. `docs/SEED_DATA.md:22` names
5/12/18/28 as the intended seed rates. _Recommendation: 12%_, three groups
5/12/18, which also gives an ascending-sort test with a non-trivial middle
element. 28% is equally clean mechanically. 0% is a distinct case worth having
eventually (a zero-tax group that must still appear, or must not) but it
interacts with rendering decisions F.3/F.4 have not made, so it is the wrong one
to introduce blind. If the answer is "two rates only", F.3/F.4 lose the ordering
and pluralisation coverage §1 asks for and nothing else.

**Q2 — HSN assignment, and whether HSN should be 1:1 with rate.** Spec §2's
reference table is 1:1 (85414300 → 5%, 85359090 → 18%), taken from the client's
PFI-2033. Note what that implies about our own catalogue: the client bills HSN
85414300 at **5%**, while all 21 seeded products carry 85414300 at **18%**.
Two shapes:
(a) **1:1** — the new 5% product gets a new HSN, the new 18% product another.
The document's HSN table then mirrors spec §2 exactly, so F.4's output can
be checked against a written target.
(b) **Deliberately not 1:1** — give the new 5% product HSN 85414300 (as the
client does) and the new 18% product 85359090, then put an existing 18%
panel (also 85414300) on the same document. HSN 85414300 then holds two
rates, which catches an HSN grouping implemented by grouping on rate — a
bug (a) cannot detect.
_Recommendation: (a) for the primary reference document, and (b) as a second
seeded document if a mixed-rate order is in scope anyway._ On the HSN itself:
85359090 is plausible for this catalogue — heading 8535 is switching/protective
apparatus and the client's own voucher (`docs/client-evidence/1.png`) bills a
`PEDLER LB SWITCH-40A` — so name the product something a reader would expect
under it (an isolator/switch, not a panel). I have not verified the statutory
rate for 8535 goods and am not asserting one; the product-to-rate mapping in a
fixture is fixture realism, and if the operator wants it to be demo-credible
they should confirm it.

**Q3 — Where the reference case lands. SETTLED: nowhere in this task.** F.81
ships seed data only; F.4 creates the mixed-rate golden file as a Typst
snapshot once rendering is correct. Full reasoning in **A.4**, and in
`docs/F3_F4_SPEC.md` §1 and §6. The missing capture script is filed as F.83.

**Q4 — How the new documents' stored totals are produced. SETTLED: fix
`computeTotals` to round per line, then seed with it.** The seed must produce
what production would produce; document-level rounding writes stored totals no
production path would ever write, and the parity test passes on internally
consistent wrong data only because the 18%-only corpus hides it. Full
instruction, the measured no-op evidence, and the rate-sensitivity table are in
**A.3 rule 2**.

**Q5 — Both tenants, or only `demo`?** Every other seed module loops over active
tenants. Only `demo` carries the reference cases that matter here.
_Recommendation: both_, for symmetry and because `sample` is where RLS and
cross-tenant tests read from; note that this also gives F.3 an inter-state
mixed-rate document for free (`sample` is `KA`, `index.ts:75`).

**Q6 — Module name and placement.** `packages/db/src/seeds/multi-rate.ts`, added
to the `db:seed` chain between `day13.ts` and `pin-created-at.ts`. The existing
files are `dayN.ts` plus two named helpers (`clock.ts`, `pin-created-at.ts`), so
a named module is consistent — but the chain position is the load-bearing part,
not the name.

**Q7 — Ordering against F.55. SETTLED: F.81 first, F.55 second, both before
F.3.** F.81 needs only rates from `{0, 5, 12, 18, 28}`, all of which every
rate-list constant already accepts, so it does not depend on F.55. No 3%
product is seeded here; the 3% fixture is filed as **F.84**, to land after F.55
has widened the union so the widened type acquires a fixture the same day
something can exercise it. Recorded in `docs/F3_F4_SPEC.md` §1 and on both task
rows.

**Still open — settle on the morning of:** Q1 (third rate — `{0, 12, 28}`;
drafter recommends 12), Q2 (HSN 1:1 with rate, or deliberately not), Q5 (both
tenants or only `demo`), Q6 (module name; the chain position is fixed by A.1).
