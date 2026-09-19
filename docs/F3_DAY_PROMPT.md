# F.3 — Multi-rate GST summary: data layer, screens, and the GST Summary report

> **STATUS: APPROVED — operator 2026-09-19. Run it.** All eight questions are
> settled as **D-1 to D-8** at the end of this document. Two of the drafter’s
> recommendations were changed: **D-4** (the report axis) because the cost filed
> on F.11 was the wrong cost, and **D-7** (the dead HTML renderer) because
> deferring the marking leaves two tests green and misleading for the whole
> F.3-to-F.4 window.
>
> **D-2 is the one that changed what gets built:** no per-line tax column exists
> at any grain, so `docs/F3_F4_SPEC.md` §3’s money rule was UNFOLLOWABLE as
> written. It has been amended in the spec as a dated correction — read that
> correction before Phase A, because the replacement rule is what this day builds
> against.

**Goal.** Make a mixed-rate document add up _and say so_ on every screen: one row
per distinct GST rate actually present, a rate-wise/HSN-wise axis on the GST
Summary report, and two long-deferred UX findings closed. The PDF is **F.4** and
the round-off row is **F.6**; neither is in this day.

**Primary deliverables**

1. One new computation producing `{ byRate, byHsn, totals }` from a document's
   stored lines — grouped by the distinct rates and HSN codes actually present,
   never by a rate list (there is no rate list any more; see the premise check).
2. A shared on-screen tax-summary component rendering one row per rate group,
   used by the quotation builder preview, the saved quotation view, the PI view
   and the order detail view. Closes `docs/UX_FINDINGS.md` P-7 (`:156`) and P-8
   (`:164`), which `docs/STAGE_F_BUILD_v3.md:409-410` schedules here.
3. Rate-wise and HSN-wise grouping on the GST Summary report
   (`apps/web/lib/reports/gst-summary.ts`), per `docs/F3_F4_SPEC.md` §7.
4. Invariant coverage: the five sum-identities in spec §4, over 1 / 2 / 3 / 4
   distinct rates, intra- and inter-state, **with and without a document-level
   discount** (see A.4 — the seed corpus cannot reach the discount case).
5. A settled, written answer to the zero-rate-group rendering question, because
   **F.87 is blocked on it** (`docs/stage-f-tasks.json:788-794`).

**Read before starting**

- `docs/stage-f-tasks.json` — F.3's row in full (`:131-137`), plus F.4 (`:140-146`),
  F.6 (`:164`), F.81 (`:734-741`), F.84 (`:761-767`), F.86 (`:779-785`),
  F.87 (`:788-794`).
- `docs/F3_F4_SPEC.md` in full — **and the "where the sources are stale" section
  below before you act on any of it.**
- `docs/F3_F4_AUDIT.md` §1 (render sites), §2 (no rate-keyed aggregation), §4
  (per-line storage), §5 (no HSN summary), §7 (money invariants) — **with the same
  caveat; four of its numbered findings are now false.**
- `docs/F84_DAY_PROMPT.md` — A.0 for the baseline recipe (reuse it verbatim, do
  not re-derive), and its "three measurements" block in Phase B.
- `CLAUDE.md` §5 (GST, the `gstRate` string rule as corrected by F.82), §6 (roles),
  §10.1 (stop-and-ask), §11.1 rulings 1, 3, 4, 7, 8, §11.2.
- `docs/STAGE_F_BUILD_v3.md` §7 Findings 1–2 (`:289-315`, the client evidence this
  exists to beat) and §9 (`:433-451`, the protected surfaces).
- `docs/BUILD_PROMPT_TEMPLATE.md`.

---

## PREMISE CHECK — confirmed against the code, 2026-09-19

F.3's central premise holds. **No rate-keyed or HSN-keyed tax aggregation exists
anywhere**, re-established by affirmative enumeration rather than by a clean
search: every `GROUP BY` / `.groupBy(` in `apps/` (15 query sites) and `packages/`
(4) was listed _with its key visible_, and not one key is `gst_rate` or `hsn_code`.
(That is 19 query sites, not the audit's 22; the audit's extra three are two "Group
by" UI labels and one comment, which are not groupings. Re-derive with
`rg -n 'GROUP BY|groupBy\(' apps packages --glob '!**/.next/**'`.)

Corroborating enumerations, each read in full:

- `packages/tax/src/` is exactly six files — `compute.ts`, `decimal.ts`,
  `index.ts`, `round.ts`, `serialize.ts`, `state.ts` — plus `tests/compute.test.ts`.
  There is no `summary.ts`, no grouping module, and `packages/tax/src/index.ts:8-24`
  exports no grouping function.
- `TaxComputationOutput` (`packages/tax/src/types.ts:72-91`) is seven scalars +
  `isInterState` + a **positional** `lines[]`. `TaxLineOutput` (`:50-70`) carries
  `gstRate` but **no `hsnCode`** — the complete field list was read.
- `apps/web/lib/reports/types.ts:50` — `ReportKey` is a closed 4-arm union;
  `ReportResult` (`:41-47`) is `{columns, rows, totals, metadata}` with **no nested
  sub-table slot**.
- `apps/web/components/` is 16 files in three directories (`auth/`, `shell/`,
  `ui/`). There is no tax-summary component and no `components/documents/`.

**F.55 landed, so nothing here widens a type, a constraint or a list.**
`packages/tax/src/types.ts:21` is `export type GstRate = number;`. The engine's
guard is shape-only (`compute.ts:146-153`: finite number, `>= 0`, `<= 999.99`).
All four `*_gst_rate_chk` constraints are `gst_rate >= 0`
(`packages/db/src/schema/{product,quotation,performa-invoice,order}.ts` at
`:72/:171/:175/:172`). `VALID_GST_RATES`, `GST_RATES` and `toGstRate` do not
exist. **If anything in this day appears to need a rate list, a migration or a
`packages/tax` edit, that contradicts the premise — stop and report it.**

**The fixture exists now, for the first time.** `packages/db/src/seeds/multi-rate.ts`
seeds five products per tenant (`:133-192`) across five HSN codes and four chains
(`:713-751`): **A** intra-state 18/5/12/5 → PI (`:348-378`), **B** inter-state
18/5/18 → PI → **order** (`:380-404`), **C** intra-state single-rate 3% → PI
(`:406-427`), **D** 3% quotation only, accepted and unconverted.

---

## READ THIS FIRST — where the two source documents disagree with the code

Both `docs/F3_F4_SPEC.md` and `docs/F3_F4_AUDIT.md` predate F.55, F.81 and F.84.
**The dangerous ones are where the cited line numbers still resolve and the
content at them has changed.**

**R-1 — THE SPEC'S MONEY RULE CANNOT BE FOLLOWED AS WRITTEN. There are no stored
per-line tax columns.** Spec §3 says "Read from stored per-line columns. **Never
recompute tax from rate × taxable value.**" I read the complete column list of all
three line tables: `quotation_lines` (`packages/db/src/schema/quotation.ts:131-174`),
`performa_invoice_lines` (`performa-invoice.ts:139-178`), `order_lines`
(`order.ts:132-183`). Every one carries exactly `quantity`, `unitPrice`, `gstRate`,
`lineTotal` — and `lineTotal` is the **pre-tax** line subtotal (qty × price), which
is why `packages/db/tests/quotation.test.ts:372-416` asserts
`SUM(line_total) ≈ quotations.subtotal`, and why
`multi-rate-corpus.test.ts:435-438` can test `lineTotal` for oddness against
3 × 4165 = 12495. **There is no per-line CGST, SGST, IGST, tax-total, taxable-value
or discount-allocation column anywhere.** Tax exists only as the seven
document-header columns. So a rate-wise or HSN-wise tax amount is not readable; it
must be produced. **D-2 settles how**, and the spec’s §3 correction is the authority.

**R-2 — The spec's §1 blocker table, its §8 exclusion, and its §5 `<select>` item
are all obsolete.** §1's "F.55 — 3% missing from nine rate-list constants", "F.55
widens a union on a protected surface" and "a third rate must come from
`{0, 12, 28}`" describe a world where rate lists existed; they were deleted. §8's
"the CHECK-permits-3%-while-the-engine-rejects-it mismatch (F.55)" excludes a
mismatch that no longer exists. §5's "Fix the live `<select>` defect the audit
identified at `product-detail-sections.tsx:255`" — **the `<select>` is gone.** `:255`
is now `onCancel={...}`; the rate control is a numeric input at `:289` and the
comparison at `:141-146` coerces both sides, with the history recorded in the
comment at `:136-140`. §5's own 2026-09-18 note predicted exactly this and told
you to confirm rather than assume. **Confirmed. Nothing to do; do not re-add a
`<select>`.**

**R-3 — The spec cites `CLAUDE.md §19` for the money rule; there is no §19.**
CLAUDE.md has §0–§11. The money rule's **only** appearance in CLAUDE.md is an
incidental clause at `CLAUDE.md:465`, inside §10's prose about subagent
orchestration — not in §5, where a reader looking for a GST rule would go. Cite
`CLAUDE.md:465` and `docs/STAGE_F_BUILD_v3.md:447` together, and note the
code-level statements at `apps/web/lib/reports/types.ts:8-11` and
`gst-summary.ts:8-12`. (That the project's money rule has no section of its own is
listed under FOUND WHILE READING.)

**R-4 — Four of the audit's numbered findings are now false at line numbers that
still resolve.** Finding 6 (`:40`), §3.4 (`:456-483`) and §4.3 (`:553-554`) say the
engine throws on 3% while the DB accepts it and that the allowed set is
`{0,3,5,12,18,28}` — **inverted**; the engine's guard is now a shape check at
`compute.ts:146-153` and there is no allowed set. Finding 8 (`:42`) and §7.4
(`:881-914`) say "every seeded product is 18% / HSN 85414300" — falsified by
F.81/F.84, **including the in-place CORRECTION block at `:890-903`**. §3.3
(`:410,:417-447`) calls `product-detail-sections.tsx:255` "the one live exposure,
CONFIRMED BY MEASUREMENT" — fixed. The "nine constants" enumeration (`:477-483`)
has eight of its sites deleted (and listed eight while saying nine). The
12-member hazard table (`:395-397`) is now 6 members, and three newer
rate-comparison sites are absent from it — `product-detail-sections.tsx:145`,
`new-product-form.tsx:62`, `queries/products.ts:172-177` — **all three safe, all
three coerce with `Number()` first.** §8.2 (`:1003-1014`) says no test pins the DB
read-back format; `packages/db/tests/multi-rate-corpus.test.ts:87-89` now does
(`toContain('5.00'/'12.00'/'18.00')`). Counts are stale: migrations are 0000–0018
(19), `apps/workers/tests/` is 8 files, `apps/workers/scripts/` is 9.

**R-5 — The defect F.4 exists to fix is real, unfixed, and now reachable.** On a
mixed-rate document the rate label degrades to an empty string:
`apps/workers/src/templates/quotation.tsx:233-234` sets `gstRateLabel` to `null`
unless exactly one distinct rate → `apps/workers/src/pdf/view-model.ts:131-133`
renders `''` → `apps/workers/src/templates-typst/quotation.typ:103-107` prints
`"CGST " + ""`. Chains A and B are mixed-rate, so the seed demonstrates it.
**That is F.4's, not this day's.** Do not fix it here, and do not touch
`quotation.typ`.

**R-6 — `templates/_components/TaxSummary.tsx` is production-dead but TEST-LIVE,
and the spec's "Do not edit it" is therefore not a complete instruction.**
`apps/workers/src/jobs/render-pdf.ts` imports only the four `load*PdfData` loaders
and renders via `renderTypstPdf`; the live build site is `quotation.typ:97-110`.
But **two** test files keep dead React renderers alive, not one:
`apps/workers/tests/quotation-template.test.ts:10` imports `renderQuotationHtml`,
and `payment-receipt-template.test.ts:10` imports `renderPaymentReceiptHtml`. Of
`quotation-template.test.ts`'s eight `it` blocks (`:85, :92, :111, :127, :132,
:142, :153, :158`), **two** assert on the HTML tax block: `:104-105`
(`toContain('IGST 18%')`, `not.toContain('CGST')`) and `:121-123`
(`toContain('CGST 9%')`, `toContain('SGST 9%')`, `not.toContain('IGST 18%')`).
When F.4 makes the Typst block rate-wise, those assertions stay green while
pinning single-rate labels on a renderer nothing ships — a passing test that can
no longer fail for the right reason. **D-7 settles it**, and F.3 marks them;
this day's job is to get the decision recorded.

**R-7 — The spec's §9 open item 2 is ANSWERED: no existing reference case became
mixed-rate.** The 14 cases in `apps/workers/scripts/typst-matrix.json` are
single-rate by construction, and F.81/F.84 measured all 14 byte-identical across
two independent reseeds. **This day must still run the byte control** — not to
discover that, but because a negative is not evidence until something shows it
could have failed (DEV.138).

**R-8 — The spec's §6 says to apply the change to the dispatch note; the schema
forbids it.** `dispatch_lines` has no `hsn_code` and no `gst_rate` column (the
audit's §4.5 table, which I re-confirmed against `packages/db/src/schema/dispatch.ts`),
and `dispatch-note.typ` has no totals block at all. That is F.4's problem, and its
answer is "you cannot without a migration". Flagged, not scheduled.

**R-9 — `resolve.ts`'s docstring is false, and it is a trap for A.3.**
`apps/web/lib/reports/resolve.ts:3-6` claims "Both the report pages (Server
Components) and the CSV export action call `runReport`". **All four report pages
call their report function directly** — `gst-summary/page.tsx:46`,
`sales-summary/page.tsx:67`, `outstanding/page.tsx:30`,
`inventory-valuation/page.tsx:41` — and only `reports/actions.ts:44` goes through
`runReport`. So parameter defaulting is duplicated, and a new `groupBy` must land
in **three** places — the page, `resolve.ts`'s `gst-summary` arm (`:61-70`), and
the `DownloadCsv` params at `gst-summary/page.tsx:83` — or the exported CSV
silently carries a different grouping from the screen.

---

## Phase A — the work

### A.0 — Establish the "nothing moved" baseline. Before any other change.

This day should not move a single rendered document (see A.6). The baseline is
what makes that a _measurement_ rather than an expectation. Take the recipe
**verbatim** from `docs/F84_DAY_PROMPT.md` A.0, substituting `/tmp/f3-*`:

- `pnpm typst:install` then `pnpm typst:check` (root scripts, `package.json:36-37`).
- `pnpm db:seed`, then apply `apps/workers/scripts/long-serial-fixture.sql`, then
  `cd apps/workers && pnpm exec tsx scripts/determinism-check.ts` (expect MATCH),
  then `pnpm --filter workers test`.
- Hash rendered output **into a fresh directory**:
  `pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/f3-pre`
  (flags confirmed at `apps/workers/scripts/render-typst.ts:161-165`), then
  `sha256sum`. **Never hash `docs/pdf-references/`** — it is git-tracked read-only
  input, so a pre/post diff over it is empty by construction. That is DEV.136.
- Repeat into `/tmp/f3-pre2` from a second independent reseed of the unchanged
  tree and diff the two `.sha` files. That control is what makes any later
  movement attributable to this day.
- **Execute the falsifying control** (DEV.138): flip one byte in one copied PDF
  and show the same `sha256sum`/`diff` pipeline reports it. Report the output.
  A clean diff from a pipeline never shown to be capable of a dirty one is not
  evidence.

Also record, before touching anything, the current on-screen totals block for one
mixed-rate document from each chain, so the P-7/P-8 change is visibly attributable.

### A.1 — The computation

Build the `{ byRate, byHsn, totals }` shape in spec §3. **Where it lives is D-1;
where its numbers come from is D-2.** Regardless of those answers:

- **Group by the distinct rates and HSN codes actually present.** A single-rate
  document yields one group — the existing case becomes a subset, not a special
  case. No rate list is consulted, because none exists.
- **Order rate groups ascending by rate; HSN rows ascending by HSN string.**
  Chain A's line order is 18/5/12/5 — deliberately **not** ascending
  (`multi-rate.ts:350-356`) — so a missing sort fails instead of passing.
- **Any grouping key derived from a rate is numeric.** Not because two DB rows can
  disagree — they cannot; all four columns are `decimal(5,2)` and Postgres returns
  the canonical `'18.00'` (DEV.135, `CLAUDE.md` §5) — but because the live hazard
  is a DB value compared against a hand-written literal, and because `'5.0'` and
  `'5.00'` would dedupe as two strings and one number
  (`apps/web/lib/queries/products.ts:155-178` makes exactly this argument).
- **Intra-state populates CGST/SGST and leaves IGST null; inter-state the reverse.
  Never both.** The engine branches on `interState`, not on an amount
  (`packages/tax/src/compute.ts:62-70`).
- **Round-off is computed once at document level and is NOT in this day.** No
  round-off field, no round-off row. F.6 owns it.
- **HSN and rate are different partitions and the fixture proves it.** Chain B puts
  HSN `85414300` on both an 18% line and a 5% line (`multi-rate.ts:380-404`), so an
  HSN table implemented by grouping on rate emits three rows where two are
  correct. `multi-rate-corpus.test.ts:232-265` exists to guarantee such a document
  is in the corpus.

**Not in this day:** SAC handling; any change to place-of-supply derivation
(ADR-012, F.5a); any behavioural change to `computeTax`; any new field on
`TaxComputationOutput` **unless D-1/D-2 authorise it** (they do not).

### A.2 — The screens

One shared component rendering one row per rate group, used at all four sites.
The four sites are the complete set, enumerated by reading every
CGST/SGST/IGST-rendering file under `apps/web/app/(app)/`:

| Site                                      | Tax rows today                                                    |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `quotations/_components/summary-card.tsx` | `:77-96`, label from `:37-45` which returns the literal `'mixed'` |
| `quotations/[id]/page.tsx`                | `:251-258`, `CGST` / `SGST` / `IGST` with **no rate at all**      |
| `pi/[id]/page.tsx`                        | `:248-255`, same                                                  |
| `orders/[id]/page.tsx`                    | `:207-214`, same                                                  |

- **P-7 is the difference between those two rows of the table.** The builder says
  "CGST @ 9%"; the saved view says "CGST". Per-line rates _are_ already shown
  (`quotations/[id]/page.tsx:151`, `pi/[id]/page.tsx:176`,
  `orders/[id]/page.tsx:244`) — what is missing is the rate on the summary rows.
  Closing P-7 is the same code path as making the block rate-wise.
- **P-8's mechanism, confirmed:** `apps/web/lib/format/index.ts:17-24` — `groupedINR`
  uses `minimumFractionDigits: 0`, so ₹19,929.20 renders as `₹19,929.2`, and the
  spec's `₹211.50` would render `₹211.5`. **How to fix it is D-6**, because
  `groupedINR` backs both `formatINR` and `formatINRExact`, which have **121
  occurrences across 30 files** (`rg -c 'formatINRExact|formatINR\(' apps/web
--glob '!**/.next/**'`) — dealers, payments, catalogue, pipeline cards,
  dashboards, and `lib/format/format.test.ts`.
- The live preview must stay live: rate-wise on every line edit, and must still
  flip CGST/SGST ↔ IGST when the Ship-To state changes. **`preview.ts` returns three
  scalars** (`apps/web/lib/quotation/preview.ts:52-61`), so a rate-group array has
  to be added to its output — it is the only surface with a rate-group source
  today, via `computeTax` at `:122`.
- **Component placement** (recommendation, not a question): a new
  `apps/web/components/tax/tax-summary-block.tsx`. `apps/web/components/` has no
  suitable home — `ui/` is primitives, `shell/` is chrome — and three of the four
  call sites are in different route folders, so a co-located `_components/` dir
  would be imported across routes.

**Not in this day:** the catalogue screens. They render the raw DB string as
`18.00%` at `catalog/page.tsx:165`, `:193`, `catalog/[id]/page.tsx:61` and
`product-detail-sections.tsx:332` — real, still live, **not F.3's scope**. Filed
under FOUND WHILE READING.

### A.3 — The GST Summary report

`apps/web/lib/reports/gst-summary.ts` groups by `place_of_supply, is_inter` at
`:87`, and its `FROM` clause is `orders o` alone at `:83` — **it never joins
`order_lines`**, so `gst_rate` and `hsn_code` are not in scope for the query at
all. Rate-wise grouping needs a new join, and **the only mixed-rate order in the
corpus is Chain B's, which is inter-state** (`multi-rate.ts:380-404,:717-720`;
Chain A has `withOrder: false` at `:713-716`). So the intra-state rate-wise path
has single-rate coverage only from the seed — say so rather than implying
otherwise, and cover the intra-state mixed case at unit level in A.4.

**How the grouping is surfaced is D-4**, and it is coupled to the report's own
contract: `gst-summary.ts:8-12` states "this report must **NOT** call
`@dealerlink/tax`", and `reports.test.ts:141-164` enforces agreement with a direct
`SUM` over stored header columns, with `:143` repeating the rule. A rate-wise tax
amount is not a stored column (R-1). **Those two facts cannot both be satisfied by
grouping tax amounts by rate inside this report.** D-4 resolves it: the contract stays.

Whatever the answer: update **all three** parameter sites (R-9), and update
`docs/RUNBOOKS.md` **R14** (`:585-601`), which today tells the reader "Each row is
one place of supply".

### A.4 — Invariants and tests

- **Extend, do not parallel.** Spec §4 item 5 says so and the audit enumerates the
  existing parity tests: `packages/tax/tests/compute.test.ts` Suite 9 (`:487`),
  `packages/db/tests/quotation-engine-parity.test.ts`,
  `packages/db/tests/quotation.test.ts:372-416`,
  `apps/web/lib/reports/reports.test.ts:131-164`.
- **`packages/tax/tests/compute.test.ts` is a protected fixture set.** No existing
  case may change. Suite 3 (`:116-183`) already supplies the inputs a grouping
  test wants — two rates (`:117`), a 0% line (`:133-149`), four rates
  (`:151-167`), mixed inter-state (`:169-182`) — so **add cases that reuse those
  shapes; do not edit the existing ones.** Note what Suite 3 asserts today:
  `:128` expects `'135600.00'` with the comment `// 135000 + 600`, i.e. it
  explicitly expects two rates to be summed. That is correct for the document
  total and says nothing about groups.
- **The discount case is the gap the corpus cannot reach.** Chains A–D pass
  `discount: null` (`multi-rate.ts:232-237`), and every pre-F.81 product is 18%,
  so the only mixed-rate documents in the corpus are undiscounted. Therefore
  per-rate taxable value happens to equal `SUM(line_total)` per rate **for every
  seeded document** — and an implementation that ignores proportional discount
  allocation will pass every seeded assertion and be wrong on the first real
  discounted mixed-rate document. Cover it at unit level, with a discount.
  (This derivation is mine, from two verified facts; it is not a query result.)
- **Give the new assertions an executed control.** F.81 deleted its seed rows and
  confirmed all 7 corpus cases failed; F.84 ran a selective deletion and reported
  five red / seven green. Do the same here: point the new grouping assertions at a
  single-rate 18% document and show them red on the multi-rate expectation, then
  restore. **Report the output.** A control that is described but not run is
  DEV.139's defect.
- **One new `apps/web/tests/e2e/verify-day-f3.spec.ts`.** Smoke-level per
  `docs/BUILD_PROMPT_TEMPLATE.md`: open the saved Chain A quotation and the Chain B
  PI, assert the totals block shows more than one rate row and that a `.50`-ending
  amount renders with two decimals. **Do not touch
  `apps/web/tests/e2e/critical-path.spec.ts`** — protected
  (`docs/STAGE_F_BUILD_v3.md:436`); F.55's one-line authorisation was scoped to
  F.55.
- **Resolve documents by shape, not by number, in new tests.** Join the line table
  and count distinct rates. The mixed-rate order's number is reported elsewhere as
  `ORD-2026-0022`; I could not verify that without a database, and shape-resolution
  removes the dependency. (F.84's D-3 kept number-addressing for the _matrix_
  cases, on the ground that append-after-Chain-B keeps prior counters fixed
  (`multi-rate.ts:722-737`) — that argument protects the 14 references, not a new
  assertion about a document this day did not seed.)

### A.5 — Documentation

`docs/RUNBOOKS.md` R14 (`:585-601`). Spec §4 also says "Add the extended invariant
queries to `docs/RUNBOOKS.md`" — note that R14`:600` already points at "the
invariant query in the verification checklist", and no such query exists
(`docs/STAGE_F_HANDOFF.md:254-283`, read in full, has none). Put the queries in R14
itself and fix the dangling pointer, or leave the pointer alone and file it — but
do not add a third indirection.

### What this day does NOT do

- **Not the PDF.** No file under `apps/workers/` is edited. Not
  `templates-typst/quotation.typ`, not `pdf/view-model.ts`, not the loaders in
  `templates/`, not `scripts/render-typst.ts`. That is **F.4** — including the
  mixed-rate golden file, the HSN/SAC table on the document, the empty-rate-label
  defect (R-5), and page-break behaviour.
- **Not round-off.** Leave `quotation.typ:107`/`:108` viable and untouched; F.6.
- **Not the tax invoice** (F.6), **not** `dealer_addresses` / place of supply
  (F.5a, ADR-012), **not** SAC.
- **Not a migration, not a schema change, not a `*_gst_rate_chk` change.**
- **Not** the catalogue's `18.00%` display, **not** `resolve.ts`'s false docstring,
  **not** `listTenantGstRates`, **not** F.86, **not** F.87's 0% fixture (this day
  _decides_ the rendering; F.87 seeds it).
- **No number on any existing document may change.** A single-rate document must
  render byte-identically before and after.

---

## Phase B — verification

**Must stay green** (say which ran locally and which in CI):

- `pnpm --filter @dealerlink/tax test` — including any new grouping cases, with
  **no existing case modified** (`git diff` on the file must show additions only).
- `pnpm --filter @dealerlink/db test` — `quotation-engine-parity.test.ts`,
  `multi-rate-corpus.test.ts` (12 cases: 7 from F.81 at `:74-266`, 5 from F.84 at
  `:285-448`), `quotation.test.ts`, `gst-rate-invariant.test.ts`.
- `pnpm --filter web test` — `apps/web/lib/reports/reports.test.ts` and
  `apps/web/lib/format/format.test.ts` (the latter does NOT apply — D-6 chose option c).
- `pnpm --filter workers test` — all `pdf-snapshots.test.ts` cases by name, plus
  `three-percent-render.test.ts`, plus `quotation-template.test.ts` unchanged
  (D-7: mark them, do not delete them).
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm verify`,
  `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check`.

**The three measurements, kept as three statements** — they answer different
questions and each can fail alone:

```
# 1 — TEXT against the Chromium reference contract
pnpm --filter workers test                 # pdf-snapshots.test.ts, 14 named cases

# 2 — BYTES against the pre-change render (fresh dir; never docs/pdf-references/)
cd apps/workers && pnpm exec tsx scripts/render-typst.ts \
  --manifest scripts/typst-matrix.json --out /tmp/f3-post
( cd /tmp/f3-post && sha256sum *.pdf | sort -k2 ) > /tmp/f3-post.sha
diff /tmp/f3-pre.sha /tmp/f3-post.sha      # must be empty

# 3 — BYTES across two independent reseeds
diff /tmp/f3-reseed1.sha /tmp/f3-reseed2.sha   # must be empty
```

Plus `determinism-check.ts` → MATCH with
`git diff --stat apps/workers/scripts/determinism-expected.json` empty.

**Why the byte measurement is cheap and still required here.** If A.6's boundary
holds — no file under `apps/workers/` edited — the renders _cannot_ move, and the
measurement is a check on the boundary rather than on the rendering. State it that
way. It is still required because the boundary is a claim, and because DEV.138
says a negative is not evidence until the instrument has been shown capable of a
positive (A.0's byte-flip control).

**Expected interaction with `critical-path.spec.ts`, to be RUN not reasoned about.**
`:261` asserts `summary.getByText(/CGST/i).first()` — survives a label becoming
"CGST 9%". `:262` asserts `getByText(EXPECTED_TOTAL.toLocaleString('en-IN'))`, i.e.
the substring `94,400`, which a 2-decimal `₹94,400.00` still contains under
Playwright's default substring matching. **Both are predictions. Run `pnpm verify`
and report what happened.** If either goes red, that is a finding for the operator,
not a spec to edit — the file is protected.

---

## Phase C — closeout

Follow `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" in full.
Unusual for this day:

- **C2 before C4 matters.** `pnpm test` writes to the shared dev DB (DEV.91) and
  this day's assertions depend on a known seeded state. Reseed deliberately
  between steps and say when.
- **C5:** F.3's own row. Record explicitly (a) the D-3 zero-group decision, because
  **F.87 is blocked on it** and must be updated in the same `plan:sync`, and
  (b) which parts of `docs/F3_F4_SPEC.md` §3 and §8 the day departed from under
  D-2, with the reason. Anything else found goes in as a **row**, never folded in
  (§11.2).
- **C6:** a deviation entry is near-certain for R-1 (the spec's money rule naming
  columns that do not exist) and for D-2’s departure from the spec as written (D-4 and D-6 depart from nothing).
- **C6b:** no unearned precision. Do not write "byte-identical", a test count, or
  "the only" without the command that produced it, and prefer an enumeration to a
  count.
- **C7a:** `verifier` before the PR. A FAIL stops the day (§10.3).

---

## Acceptance criteria — each with the command or file that decides it

**F.3's (this day):**

1. The computation returns one `byRate` entry per distinct rate present and one
   `byHsn` entry per distinct HSN present, for a 1-, 2-, 3- and 4-rate document,
   intra- and inter-state. → new cases in `packages/tax/tests/compute.test.ts`
   (D-1: `packages/tax`), via `pnpm --filter @dealerlink/tax test`.
2. `sum(byRate.taxableValue) === totals.taxableValue` and
   `sum(byHsn.taxableValue) === totals.taxableValue`, exactly, **including with a
   document-level discount**. → the same test file.
3. Every tax amount across `byRate` sums to `totals.totalTax`, and the same across
   `byHsn`. → the same test file.
4. For each seeded mixed-rate document, the grouped totals equal the **stored**
   header columns exactly at 2 dp. → a new case in
   `packages/db/tests/` alongside `quotation-engine-parity.test.ts`, via
   `pnpm --filter @dealerlink/db test`.
5. Rate groups are emitted ascending by rate on Chain A, whose stored line order is
   18/5/12/5. → the A.4 test resolving Chain A by shape;
   `multi-rate-corpus.test.ts:120-145` guarantees such a document exists.
6. HSN grouping emits **two** rows for Chain B, where HSN `85414300` carries both
   18% and 5%. → the A.4 test; the corpus guarantee is
   `multi-rate-corpus.test.ts:232-265`.
7. Criteria 1–6 go **red** when pointed at a single-rate 18% document. → executed
   control; report the failure count and the output.
8. The saved quotation view, the PI view and the order detail view each render one
   labelled row per rate group on a mixed-rate document — closing P-7
   (`docs/UX_FINDINGS.md:156`). → `apps/web/tests/e2e/verify-day-f3.spec.ts`, via
   `pnpm verify`.
9. Every tax amount on those blocks renders at exactly 2 decimals; an amount ending
   `.50` renders `.50` — closing P-8 (`docs/UX_FINDINGS.md:164`). → the same spec,
   D-6 chose option (c), so `format.test.ts` needs no change beyond the new option’s own cases.
10. The builder preview updates rate-wise as lines are added and still flips
    CGST/SGST ↔ IGST on a Ship-To state change. → `verify-day-f3.spec.ts`.
11. The GST Summary report offers the rate and HSN axes D-4 settles, **and the
    downloaded CSV matches the screen**. → `apps/web/lib/reports/reports.test.ts`
    for the query, `verify-day-f3.spec.ts` for the screen, and a manual CSV
    download compared against the rendered table (R-9 is why this is a criterion
    and not an assumption).
12. `reports.test.ts:141-164`'s existing header-column parity assertion is still
    green and unmodified. → `git diff` on the file plus `pnpm --filter web test`.
13. **No file under `apps/workers/` is modified**, no migration is added, no file
    under `packages/db/src/schema/` or `docs/pdf-references/` is modified, no entry
    in `apps/workers/scripts/typst-matrix.json` changes, and
    `apps/web/tests/e2e/critical-path.spec.ts` is unchanged. →
    `git diff --name-only main`.
14. All 14 reference cases still match on **text**; all 14 renders are
    byte-identical to the A.0 pre-change hashes and across two independent
    reseeds; `determinism-check` prints MATCH with `determinism-expected.json`
    unmodified. → `pnpm --filter workers test`; `diff /tmp/f3-pre.sha
/tmp/f3-post.sha`; `diff /tmp/f3-reseed1.sha /tmp/f3-reseed2.sha`;
    `determinism-check.ts` + `git diff --stat`.
15. The byte-comparison pipeline is shown capable of reporting a difference. →
    A.0's one-byte-flip control; report the output.
16. `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check` exit 0; `pnpm lint`,
    `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm verify` green.
17. The D-3 zero-group decision is recorded in `docs/stage-f-tasks.json` on both
    F.3 and F.87. → `git diff docs/stage-f-tasks.json` + `pnpm plan:check`.

**F.4's, explicitly NOT this day's** — restated so nobody claims them here: the
rate-wise block in `templates-typst/quotation.typ`; the HSN/SAC table on the
document; the mixed-rate **golden file** as a Typst snapshot (a regression freeze,
not a member of the Chromium cross-renderer contract in `docs/pdf-references/`);
the empty-rate-label fix (R-5); page-break behaviour; amount-in-words across
groups; and D-7’s marking.

**Criteria checked against each other.** 13 forbids editing `apps/workers/`, and
14 requires the renders not to move — consistent: 13 is _why_ 14 holds, and 14 is
the check on 13. 4 requires equality with stored headers and 2/3 require internal
sum-identity; both hold only if the grouped figures derive from the same engine
that wrote the headers, which is D-2 — **had D-2 gone any other way, 4 might be
unsatisfiable and must be renegotiated, not weakened.** 9's "exactly 2 decimals"
and 12's "reports.test.ts unmodified" are compatible only because that file
asserts on numbers, not formatted strings (verified: `reports.test.ts:34-35`
`sumColumn` uses `Number()`); under the D-6 option (a) that was NOT chosen, the file that _would_ need
updating is `format.test.ts`, which 12 does not protect. 7 is the only criterion
that makes 1–6 non-vacuous, and it must be **executed**, not intended (DEV.129,
DEV.139).

---

## STOP AND ASK

- **`packages/tax` is protected** (`docs/STAGE_F_BUILD_v3.md:436`, CLAUDE.md §10.1).
  **D-1 carries the operator's written authorisation and you do not need to ask
  again — but its bounds are the ask.** Granted: a new additive module in
  `packages/tax`, reading stored line rows and calling `computeTax`, plus its barrel
  export and new test files. Explicitly NOT granted: any change to `computeTax`
  itself, any change to an existing export's behaviour, any fixture change,
  including anything in `packages/tax/tests/compute.test.ts`.

  **The stop condition is stated in the authorisation and is not a judgement call:**
  "if the work requires touching the engine rather than composing on top of it, stop
  and report before writing." A needed field on `TaxComputationOutput`, or a new
  parameter on `computeTax`, IS that condition — not a small refactor to fold in.

- **Money columns.** This day reads them and writes none. If any step appears to
  need a new per-line tax column, that is a **migration** and a protected surface
  twice over: stop (D-2).
- **`adminDb`** — `apps/web/lib/reports/reports.test.ts` imports it. Extending that
  file is not a refactor of `adminDb`, but confirm before editing it.
- **`critical-path.spec.ts`** — no edit, not even a one-liner. If P-7/P-8 turn it
  red, report it.
- **Any migration, constraint change or schema edit** — not expected; a finding if
  it appears.
- **Any movement in any of the 14 reference cases** — a finding, never a
  re-baseline (§11.1 rulings 1 and 4).
- **Any ninth decision** the eight settled decisions below do not cover. Eight were
  open and eight are answered; a ninth is a stop (the F.84 formulation).
- **Any deviation from this scope**, including a "quick fix" to the catalogue's
  `18.00%`, to `resolve.ts`'s docstring, or to R14's dangling pointer.
- **`gst-summary.ts:10`'s wrong section citation.** You will read this file for
  D-4 and you will see it cite "CLAUDE.md §6" for the stored-money rule. §6 is
  Auth & Roles; the rule is at `CLAUDE.md:465` in §10. **The comment's claim is
  correct and only its address is wrong — do not fix it here.** It is **F.100**,
  filed with the wider finding that nothing validates a section anchor at all:
  `check:ids` covers ids, `check:paths` covers paths, and a section reference is
  neither, so a wrong one reads exactly as authoritative as a right one (DEV.128's
  argument, applied to anchors).

---

## Settled decisions — D-1 to D-8, operator 2026-09-19

Eight questions, eight answers. **Two recommendations were changed (D-4, D-7)**, and
one required amending the spec (D-2). Apply these; do not re-open them (CLAUDE.md §11).

**D-1 (was Q1) — the computation lives in `packages/tax`. AUTHORISED, SCOPED.**
Option (a). The operator's authorisation, in its own terms and reproduced here
because its bounds are what make it usable:

> The new grouping computation may live in `packages/tax`, reading stored line rows
> and calling `computeTax`. **No change to `computeTax` itself, no change to any
> existing export's behaviour, no fixture changes. If the work requires touching the
> engine rather than composing on top of it, stop and report before writing.**

So: a new module, a new barrel export, and new test files. Nothing else under
`packages/tax` is edited. "Composing on top of" is the test — if you find yourself
needing a new field on `TaxComputationOutput`, or a parameter on `computeTax`, that
is the stop condition, not a small refactor.

**D-2 (was Q2) — derive through `computeTax` over the stored line rows, and
reconcile to the stored headers. THE SPEC WAS AMENDED.**
Option (a). `docs/F3_F4_SPEC.md` §3's money rule was **unfollowable as written** and
has been corrected in place, dated, with the reason. The replacement rule:

> Money is derived through `computeTax` over the stored line rows — the production
> pattern already used on every PDF render — and the grouped result must reconcile
> exactly to the stored header totals. Never re-derive from header totals, and never
> recompute a line's tax from rate × an approximated taxable value.

**Why the old rule could not be followed.** Enumerated in full from
`information_schema` on 2026-09-19: all three line tables store `hsn_code`,
`quantity`, `unit_price`, `gst_rate` and `line_total`, and **no per-line tax,
taxable-value or discount column at any grain.** Tax is persisted only on the
header. A rate-wise or HSN-wise breakdown is stored at no grain at all, so "read
from stored per-line columns" names columns that do not exist. The rule was written
for a computation reading HEADER totals, where it is correct and still binds.

**Why this is not the departure the old rule feared, which is the part to record.**
`apps/workers/src/templates/quotation.tsx:186-196` already calls `computeTax` over
the stored line rows on **every PDF render** — this is the established production
path, not a new licence. And it reconciles by construction: `computeTax` rounds
**per line** (`compute.ts:64-69`) and the document totals are sums of those rounded
per-line figures (`compute.ts:90-92`), so grouping its `lines[]` output sums back to
the stored headers **exactly**. That is the property F.84 pinned at CGST `562.39`
per-line against `562.38` document-level, with an even-subtotal control showing the
two agreeing where they cannot discriminate (DEV.142). **Round per line, then
aggregate into groups. Never round at the group level.**

What the old rule protected against still binds and is restated above: deriving a
group's tax as rate × a re-derived taxable value. That is wrong on any discounted
document, because the discount is allocated proportionally and rounded per line
(`compute.ts:54-55`).

**D-3 (was Q3) — a 0% rate group RENDERS AS A ROW, and so does its HSN row.**
Option (a). Not suppressed. The group's **taxable value is real and non-zero** even
when its tax is zero, so suppressing the row makes the tax block stop adding up on
its own face: the displayed rows would not sum to the displayed taxable total.
GSTR-1 reports nil-rated supply separately, so the row carries compliance meaning.

Testable **today, without any 0% seed data**: `packages/tax/tests/compute.test.ts`
already carries a 0%-line fixture. **This ruling is recorded on F.87's row as well
as F.3's**, in the same `plan:sync`, so the two cannot drift. F.87 was blocked on
this and is now unblocked; what it still owes is the fixture, appended after the
existing chains so no prior counter moves (the F.84 precedent).

**D-4 (was Q4) — accept option (a): a `groupBy` param with taxable value and counts
only. THE REPORT'S NO-TAX-PACKAGE CONTRACT IS CORRECT AND STAYS. BUT THE COST FILED
ON F.11 WAS THE WRONG COST.**
The drafter's mechanism is right and its recommendation is accepted. Its _consequence_
was not. It said F.11 would have to take tax figures from F.6's invoice because this
report hands it a partial aggregation.

**The operator's correction: F.11 should not consume this report's query at all. It
consumes F.3's computation.** The contract at `gst-summary.ts:8-12` — every figure
is the order's STORED amount, and the module must not call `@dealerlink/tax`
(verified: no such import) — **exists for a good reason. The report shows what was
BILLED, not what the engine would compute today**, which is exactly what a GSTR-1
base must do. That is a feature, so the report keeps its constraint, and F.11 routes
around it rather than through it. F.11's row is updated in this same `plan:sync` to
say so.

**D-5 (was Q5) — yes, and the reason differs from the drafter's.**
Option (a). §7's "the axis F.11's export must map to" is satisfied — but by **D-4's
rescoping**, not by F.11 sourcing amounts from F.6. F.11 maps the Tally ledger axis
(`SALE @ 5% - LOCAL` and the rest) from F.3's `byRate`/`byHsn` output. Recorded on
F.11's row, because it was filed on an assumption D-4 invalidates.

**D-6 (was Q6) — a `minDecimals` option on `formatINRExact`, defaulting to current
behaviour.**
Option (c). Fixes exactly the surfaces P-8 names, keeps the blast radius
attributable, and leaves **one** formatter rather than two that will drift. Not (a):
changing `groupedINR` is a 30-file visual change across 121 call sites, landing
inside a diff reviewed for multi-rate grouping — if that is wanted it is its own row.
Note `apps/workers/src/lib/format.ts:9-12` already forces 2 decimals, so the PDFs are
already correct and only the web app is inconsistent. `₹211.50` must not render as
`₹211.5`.

**D-7 (was Q7) — MARK the two dead-renderer tests IN THIS DAY. THE DRAFTER'S
RECOMMENDATION IS OVERRULED.**
The drafter recommended porting the assertions to the Typst path, "executed by F.4,
recorded by F.3". Rejected, on the operator's reasoning: **that leaves the tests
green and misleading for the whole F.3-to-F.4 window**, which is the exact shape this
project keeps filing deviations about. A test that cannot fail for the right reason
reads as coverage.

So: **F.3 adds a comment to the two tax-asserting cases** in
`apps/workers/tests/quotation-template.test.ts` naming `renderQuotationHtml` as a
**production-dead** renderer — `jobs/render-pdf.ts:31-34` imports only the four
`load*PdfData` loaders and renders via `renderTypstPdf` — and pointing at F.4 as the
day that ports the coverage. **Do not delete them** (the coverage is real, just
aimed at the wrong renderer) and **do not delete the HTML path** (`renderQuotationHtml`
and `loadQuotationPdfData` live in the same file, `templates/types.ts` is shared with
the live loaders, and a second dead renderer is kept alive by
`payment-receipt-template.test.ts:10` — far larger than it sounds).

**Which cases: two, not three.** The file has **8** `it` blocks; tax-block
assertions appear in **two** of them — `:92` ("multi-line inter-state … shows IGST,
not CGST/SGST", 2 assertions) and `:111` ("single-line intra-state … CGST + SGST at
half rate", 3 assertions) — **5 assertions in total.** Enumerated per-block rather
than counted. The brief that commissioned this draft said "3 of its 8 cases"; that
was wrong, and the draft caught it.

**D-8 (was Q8) — F.3 touches nothing under `apps/workers/`, except D-7's comment.**
Option (a). The loaders, the view model and `quotation.typ` are all F.4's. This keeps
criterion 13 a one-command check, keeps the diff reviewable, and keeps F.4's byte
movement attributable to F.4. It also avoids dragging in the duplicate view model at
`scripts/render-typst.ts:236-238`, which spec §6 warns can drift.

**The one exception is D-7's comment**, which adds no assertion, changes no
behaviour, and moves no byte. State it explicitly in the closeout so the "no workers
change" claim and the diff agree.

---

## Two things the draft does not carry — fold both in

**1 — The `lineTotal` trap. Same name, opposite semantics.**

|            | `line_total` (the DB column)                     | `lineTotal` (the engine field) |
| ---------- | ------------------------------------------------ | ------------------------------ |
| Formula    | `quantity × unitPrice`                           | `lineTaxable + lineTaxTotal`   |
| Tax        | **excluded**                                     | **included**                   |
| Discount   | **before** it                                    | **after** it                   |
| Written at | `pi/helpers.ts:223`, `quotations/helpers.ts:229` | `compute.ts:84`                |

Measured on Chain C (`QT-2026-0018`): `qty × unit` = 12495.00 and 24997.00, and
`line_total` = 12495.00 and 24997.00 — so the column is the pre-tax, pre-discount
line subtotal.

**This bit its way into the brief.** The author of the brief for this draft was about
to report the column as tax-inclusive, reasoning from the engine field's name, and
only caught it by querying real rows. Anyone wiring `byRate` will meet the same
ambiguity. **Read the column when you want a taxable subtotal; read the engine's
output when you want anything tax-inclusive. Never assume one from the other's name.**

**2 — Invariant 5's honest scope. Say this in the test file, not just here.**

Spec §4 invariant 5 asks that the grouped sums equal a direct `SUM` over the line
table, extending the existing parity invariant. Under D-2 the computation calls
`computeTax`, and the stored headers it reconciles against **were also written by
`computeTax`** (through the actions, and through the seed — `multi-rate.ts` computes
its totals with the production engine, recorded at `multi-rate.ts:28-56`).

**So the reconciliation is a round-trip. It catches GROUPING errors and cannot catch
ENGINE errors.** That is acceptable — D-1 requires composing on the one authoritative
engine, so there is no second implementation to disagree with, and the operator has
already ruled on the equivalent point for F.81. **But it must be written down where
the test lives**, because otherwise invariant 5 reads as stronger coverage than it
is: a reader sees "reconciles exactly to the stored totals" and infers the engine is
verified, when what is verified is that the grouping does not lose or duplicate a
line. DEV.138's rule applies — state what result would have falsified it.
