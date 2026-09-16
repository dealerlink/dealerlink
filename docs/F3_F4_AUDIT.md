# F.3 / F.4 Audit — multi-rate tax summary, rate grouping, HSN, round-off

> **Date:** 2026-09-17
> **Task:** pre-spec audit for F.3 (multi-rate tax summary — data layer +
> screens) and F.4 (multi-rate tax summary — PDF + HSN/SAC table), together with
> the parts of F.6 that share their component.
> **Status:** **AUDIT ONLY.** This document enumerates what exists. It contains
> no design, no schema, no recommendation and no proposed build order. The
> operator writes the spec against it.
> **Method:** affirmative enumeration per `CLAUDE.md` §11.1 rulings 7 and 8 —
> every negative below rests on a list that was obtained and read in full, not
> on an empty search. Instruments are named. §8 states what could not be
> determined, and the limits of the method as actually run.
> **Companion docs:** `CLAUDE.md` §5, `docs/STAGE_F_BUILD_v3.md` §7,
> `docs/CLIENT_CONTEXT.md` §3, `docs/TAX_INVOICE_AUDIT.md`.

---

## Summary of findings

Each is expanded below with its evidence. Findings marked **[spec-affecting]**
change what a spec written against the current task notes would say.

| #   | Finding                                                                                                                                                                                                                  | §        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | **[spec-affecting]** The component F.4 and F.6 both name — `templates/_components/TaxSummary.tsx` — is **dead code**. The live single-rate block is `templates-typst/quotation.typ:97-110`.                              | §1.2     |
| 2   | On a mixed-rate document the PDF **drops the rate label to an empty string**, printing `IGST ` / `CGST ` with a trailing space. Amounts stay correct.                                                                    | §1.3     |
| 3   | On screen, the quotation builder prints the literal word **`mixed`** — "CGST @ mixed". It is the only surface in the repo that acknowledges multiple rates at all.                                                       | §1.4     |
| 4   | **No rate-keyed or HSN-keyed tax aggregation exists anywhere**, established against the closed set of all 22 `GROUP BY` / `.groupBy()` keys in the repo.                                                                 | §2       |
| 5   | **[spec-affecting]** The `'18'` vs `'18.00'` hazard is **not currently live for document reads** — all four rate columns are `decimal(5,2)` and every document query `Number()`s. One product-catalogue site is exposed. | §3       |
| 6   | **`packages/tax` throws on 3% at runtime**, while all four DB CHECK constraints accept it. A 3% line is insertable and then un-renderable.                                                                               | §3.4, §4 |
| 7   | **No HSN/SAC summary exists**; HSN is display-only everywhere — never a key, never summed, never in a `WHERE` or `GROUP BY`.                                                                                             | §5       |
| 8   | **The seed corpus cannot exercise multi-rate at all** — every seeded product is 18% / HSN `85414300` — and no reference-PDF case is mixed-rate.                                                                          | §7.3     |
| 9   | `CLAUDE.md` §5 documents a `calculateGST(...): TaxBreakdown` API. **Neither symbol exists.**                                                                                                                             | §8       |

---

## 1. Tax summary render sites

Every site rendering a GST summary or tax-totals block. The population was
obtained as directory listings read in full, not as search hits.

**Directories enumerated in full:**

- `apps/workers/src/templates-typst/` — **5 files**: `_lib/chrome.typ`,
  `dispatch-note.typ`, `payment-receipt.typ`, `performa-invoice.typ`,
  `quotation.typ`. There is no tax-invoice template.
- `apps/workers/src/templates/` — **12 files**: `_components/` ×6 (`Footer`,
  `Header`, `LineItemsTable`, `PartyBlock`, `SerialsTable`, `TaxSummary`),
  `dispatch-note.tsx`, `payment-receipt.tsx`, `performa-invoice.tsx`,
  `quotation.tsx`, `styles.ts`, `types.ts`.
- `apps/workers/src/pdf/` — **5 files**: `generated-at.ts`, `render-cli.ts`,
  `store.ts`, `typst.ts`, `view-model.ts`. None is an HTML renderer.
- `apps/web/app/**/page.tsx` — **50 route files**.
- `apps/web/lib/reports/` — **12 files**; `apps/web/lib/email/` — **5 files**.

### 1.1 The sites

| #   | Site                                                                | Renders                                                                         | Single rate?                                                | Proving line                                                                             |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | `templates-typst/quotation.typ:97-110`                              | Subtotal → (Discount) → Taxable → IGST **or** CGST+SGST → Grand Total           | **SINGLE-RATE**                                             | `:103-107` — one `data.igstAmount`, one `data.fullRateLabel`; no `.map` over rate groups |
| 2   | `templates-typst/performa-invoice.typ:15,22`                        | imports `quotation-body` and calls it verbatim                                  | **SINGLE-RATE (inherited)**                                 | `#import "quotation.typ": quotation-body`                                                |
| 3   | `templates-typst/quotation.typ:63-93`                               | line-items table; per-line rate `:78`, per-line GST `:79`                       | per-line multi-rate-capable; **footer is one un-split sum** | `:90` emits a single `data.totalGstAmount`                                               |
| 4   | `templates-typst/_lib/chrome.typ:347-379`                           | `totals-block(words:, rows:, grand:)`                                           | **generic primitive** — iterates whatever pairs it is given | `:363-366` `..rows.map(r => ...)`. No caller passes more than one row per head           |
| 5   | `templates-typst/_lib/chrome.typ:324-335`                           | `supply-badge` — "INTER-STATE · IGST" / "INTRA-STATE · CGST + SGST"             | binary classification; carries no rate and no amount        | `:325`                                                                                   |
| 6   | `apps/web/app/(app)/quotations/_components/summary-card.tsx:67-107` | builder live preview: Subtotal → Discount → Taxable → IGST or CGST+SGST → Total | **SINGLE-RATE LABEL with a `mixed` fallback**               | `:37-45` returns `'mixed'` when `rates.size > 1`; interpolated at `:79`, `:86`, `:91`    |
| 7   | `apps/web/app/(app)/quotations/[id]/page.tsx:239-265`               | quotation detail Totals aside                                                   | aggregate per head, **no rate label at all**                | `:251-258`                                                                               |
| 8   | `apps/web/app/(app)/pi/[id]/page.tsx:236-262`                       | PI detail Totals aside                                                          | aggregate per head, no rate label                           | `:248-255`                                                                               |
| 9   | `apps/web/app/(app)/orders/[id]/page.tsx:195-221`                   | order detail Totals aside                                                       | aggregate per head, no rate label                           | `:207-214`                                                                               |
| 10  | `apps/web/app/(app)/dashboard/report-widgets.tsx:57-93`             | "Tax payable estimate" tile                                                     | **single scalar, no rate dimension**                        | `:57-58` `cgst + sgst + igst`                                                            |
| 11  | `apps/web/lib/reports/gst-summary.ts:48-56`                         | GST Summary report columns                                                      | **no rate dimension** — see §2                              | 7 columns, none a rate                                                                   |
| 12  | `apps/web/lib/reports/sales-summary.ts:51`                          | one column `Tax (CGST+SGST+IGST)`                                               | all three heads collapsed into one figure                   | fed by `:126`, `:131`, `:136`                                                            |

**Sites 7, 8 and 9 branch on an amount, not on the classification.** The
predicate is `igstAmount > 0`, not `isInterState`. An inter-state document whose
IGST total is zero — every line at 0% — renders CGST/SGST rows of ₹0.00. Noted
as a fact about the current code; it is not a multi-rate issue.

**Not tax-summary sites**, confirmed by reading the files in full:
`templates-typst/dispatch-note.typ` (137 lines; its only table is
#/Product&Serials/Qty), `templates-typst/payment-receipt.typ` (101 lines),
`templates/payment-receipt.tsx`, `templates/dispatch-note.tsx`. Those carry
`gstin:` party fields only, and
`apps/workers/tests/payment-receipt-template.test.ts:80-84` asserts the receipt
`not.toContain('CGST'/'SGST'/'IGST')`.

**Email renders no tax.** `apps/web/lib/email/` holds 5 files; the only document
mail is `templates/document-delivery.ts` (93 lines, read in full), a covering
message — `:66` "The document is attached as a PDF". All four senders attach the
PDF rather than inlining totals. Noted in passing: **`react-email` is not a
dependency** of this repo, contrary to `CLAUDE.md` §3's backend table.

### 1.2 Finding 1 — the component F.4 and F.6 name is dead code **[spec-affecting]**

`docs/stage-f-tasks.json` says, on both F.4 and F.6, that the multi-rate summary
and the round-off row "land in the SAME component —
`apps/workers/src/templates/_components/TaxSummary.tsx`". **That component is not
reachable at runtime.** The claim was true when written and was overtaken by
ADR-015 (Typst cutover, Day 27).

Evidence, re-derived with `git grep -n` on the main thread rather than taken from
a subagent's report:

- `apps/workers/src/jobs/render-pdf.ts:25-33` — the complete import list from
  `../templates/` is exactly four loaders: `loadDispatchNotePdfData`,
  `loadPaymentReceiptPdfData`, `loadPerformaInvoicePdfData`,
  `loadQuotationPdfData`. No HTML builder is imported.
- `render-pdf.ts:104` — the job calls
  `renderTypstPdf({ template: TEMPLATE_FOR[documentType], ... })`, and
  `TEMPLATE_FOR` (`pdf/view-model.ts:65-73`, four keys) maps every document kind
  to a `.typ` file.
- The four exported HTML entry points are the complete set: `buildQuotationHtml`
  (`quotation.tsx:320`), `buildPerformaInvoiceHtml` (`performa-invoice.tsx:232`),
  `buildDispatchNoteHtml` (`dispatch-note.tsx:316`), `buildPaymentReceiptHtml`
  (`payment-receipt.tsx:305`). `git grep -n` over `apps packages` returns **zero
  call sites** for any of the four.
- `TaxSummary` has exactly one import in the repo — `quotation.tsx:35`, used at
  `quotation.tsx:115` — inside `renderQuotationHtml`, whose only live caller is
  `apps/workers/tests/quotation-template.test.ts`.

**So the loaders in `templates/` are live and the React rendering in `templates/`
is dead.** The distinction matters for scoping: F.3/F.4 will still touch that
directory, because `loadQuotationPdfData` and the `QuotationPdfData` type feed
the Typst view model — but the totals block to change is
`templates-typst/quotation.typ:97-110`.

**A stale in-code comment points the same wrong way.** `quotation.tsx:4` reads
"`buildQuotationHtml` is the entry point used by the render-pdf job", false since
Day 27. `render-pdf.ts:14-16` states "Chromium, Puppeteer and the HTML templates
are gone" — gone from the call graph, not from disk.

### 1.3 Finding 2 — the rate label degrades to an empty string on the PDF

The single-rate label is derived, then rendered, through four hops:

1. `templates/quotation.tsx:234-235` and `templates/performa-invoice.tsx:161-162`
   (identical): `const distinctRates = Array.from(new Set(lines.map((l) => l.gstRate)));`
   then `const gstRateLabel = distinctRates.length === 1 ? String(distinctRates[0]) : null;`
2. `templates/types.ts:90-91` documents the contract: "Effective GST rate for the
   summary label, e.g. "18". Mixed → null."
3. `pdf/view-model.ts:131-133` converts `null` to the empty string:
   `vm['fullRateLabel'] = rateLabel != null ? ` + "`${rateLabel}%`" + ` : '';`
4. `templates-typst/quotation.typ:103-107` concatenates it: `"IGST " + data.fullRateLabel`.

**Rendered behaviour on a mixed-rate document: the PDF prints `IGST `, `CGST `,
`SGST ` with a trailing space and the correct aggregate amounts.** The arithmetic
is right; the rate silently disappears. Note that the derivation at step 1 lives
in the **dead** React files (§1.2) — those two functions are loaders, still live,
which is why the degradation reaches the live Typst path. The same derivation is
duplicated a third time in the capture harness,
`apps/workers/scripts/render-typst.ts:236-238`.

### 1.4 Finding 3 — on screen, mixed-rate renders the word `mixed`

`apps/web/app/(app)/quotations/_components/summary-card.tsx`, read in full on the
main thread:

```ts
:37-45   const rates = new Set(form.lines.map((l) => l.gstRate));
         if (rates.size === 0) return '—';
         if (rates.size === 1) { const r = Array.from(rates)[0]!; return `${r}%`; }
         return 'mixed';
:79      label={`IGST @ ${rateLabel}`}
:86,:91  label={`CGST @ ${rateLabel === 'mixed' ? rateLabel : `${Number(rateLabel.replace('%','')) / 2}%`}`}
```

A mixed-rate quotation reads **"IGST @ mixed"**, or **"CGST @ mixed" / "SGST @
mixed"**, in the builder. This is the only place in the repo where the existence
of more than one rate reaches a user at all. Its data source,
`apps/web/lib/quotation/preview.ts:52-61`, returns `{cgst, sgst, igst}` as three
scalars — there is no rate-group array for the UI to render even if it wanted one.

---

## 2. Rate grouping paths

**Verdict: no code path anywhere in `apps/` or `packages/` groups, keys, buckets
or sums tax by GST rate or by HSN/SAC.** Every tax aggregation collapses to the
three flat scalars `cgst` / `sgst` / `igst`, keyed by something else or by
nothing.

### 2.1 The closed population — every `GROUP BY` / `.groupBy()` in the repo

22 occurrences, enumerated in full. **Not one key is `gst_rate` or `hsn_code`.**

`apps/` (18):

| file:line                                                              | key                                         |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| `apps/web/lib/reports/gst-summary.ts:87`                               | `place_of_supply`, `is_inter`               |
| `apps/web/lib/reports/inventory-valuation.ts:56`                       | `product_id`                                |
| `apps/web/lib/reports/outstanding.ts:95`                               | `paymentAllocations.orderId`                |
| `apps/web/lib/reports/sales-summary.ts:105`                            | `d.product_id`                              |
| `apps/web/lib/reports/sales-summary.ts:149`                            | month string **or** `dealer_id`             |
| `apps/web/lib/queries/payments.ts:267`                                 | `paymentAllocations.orderId`                |
| `apps/web/lib/queries/deals.ts:370`                                    | `deals.stage`                               |
| `apps/web/lib/queries/dispatch.ts:77`                                  | `dispatches.id`, `orderNumber`, dealer name |
| `apps/web/lib/queries/dispatch.ts:150`                                 | `inventoryItems.productId`                  |
| `apps/web/lib/queries/dispatch.ts:233`                                 | `dispatches.id`                             |
| `apps/web/lib/queries/procurements.ts:43,207,225`                      | `p.id` / `status` / `p.id, p.name, p.sku`   |
| `apps/web/lib/queries/products.ts:100`                                 | `inventoryItems.status`                     |
| `apps/web/app/api/health/route.ts:168`                                 | `name`                                      |
| `reports/outstanding/page.tsx:36`, `reports/sales-summary/page.tsx:82` | UI label "Group by", not a query            |
| `apps/web/tests/e2e/critical-path.spec.ts:43`                          | a comment                                   |

`packages/` (4): `packages/db/tests/quotation.test.ts:392`
(`q.id, q.quote_number, q.revision, q.subtotal`);
`packages/db/scripts/staging-db-conns.mjs:10,15` (`pg_stat`, not app data);
`packages/db/scripts/verify-state-codes.mjs:42` (a distinct-value audit).

### 2.2 The GST Summary report — confirmed

`apps/web/lib/reports/gst-summary.ts`, read in full (129 lines). The literal
clause:

```
:87   GROUP BY o.place_of_supply, is_inter
```

where `is_inter` is defined in the same statement at `:77` as
`(o.tenant_state_at_issue <> o.place_of_supply) AS is_inter`. The aggregates,
`:79-82`, are `sum(o.taxable_amount)`, `sum(o.cgst_amount)`, `sum(o.sgst_amount)`,
`sum(o.igst_amount)`.

**The `CLAUDE.md`-recorded claim is CONFIRMED: it groups by place of supply and
intra/inter-state, not by rate or HSN.** The stronger structural fact is that the
`FROM` clause is `orders o` alone (`:83`) — **it never joins `order_lines`**, so
`gst_rate` and `hsn_code` are not in scope for that query at all. Rate-wise
grouping is not merely absent from the `GROUP BY`; the query shape cannot express
it without a new join.

Its output column set is closed and complete at `:48-56` — 7 entries: `state`,
`supplyType`, `orders`, `taxable`, `cgst`, `sgst`, `igst`. No rate column, no HSN
column. The in-JS totals row (`:104-113`) is an unkeyed `reduce` over the
already-grouped rows.

Reachable at `/reports/gst-summary`
(`apps/web/app/(app)/reports/gst-summary/page.tsx:46`) and from the dashboard
widget (`report-widgets.tsx:52`); roles admin, accounts, operator
(`apps/web/lib/reports/access.ts:19-25`).

### 2.3 The report population is closed — there are exactly four

Verified three independent ways, each read in full: the `ReportKey` union
(`apps/web/lib/reports/types.ts:50`), the `switch` in `resolve.ts:36-71`, and the
`ACCESS` / `REPORT_TITLES` maps in `access.ts:19-25,46-51`. All three agree on
`sales-summary | outstanding | inventory-valuation | gst-summary`.

| Report                     | Key                                        | Tax touched?                                                    |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| GST Summary                | `place_of_supply`, `is_inter`              | yes — four `sum()`s from `orders`                               |
| Sales Summary              | month **or** `dealer_id`                   | yes, but **collapsed to one scalar**: `(cgst+sgst+igst) AS tax` |
| Sales Summary (by product) | `product_id`                               | **no** — tax hardcoded `'0' AS tax` at `sales-summary.ts:100`   |
| Outstanding                | order id / dealer id / 30-day aging bucket | **no tax columns at all**                                       |
| Inventory Valuation        | `product_id`                               | **no tax columns**                                              |

`apps/web/lib/reports/types.ts` — the `ReportResult` shape is
`{columns, rows, totals, metadata}`. A report is a flat row list; **the contract
has no nested or grouped sub-table slot**, so a per-rate sub-breakdown has
nowhere to live in the current type.

### 2.4 `apps/web/lib/queries/` — 11 files, listed in full

`audit.ts`, `dealers.ts`, `deals.ts`, `dispatch.ts`, `generated-documents.ts`,
`orders.ts`, `payments.ts`, `performa-invoices.ts`, `procurements.ts`,
`products.ts`, `quotations.ts`.

Three of them read tax columns — `quotations.ts:219-222`,
`performa-invoices.ts:292-295`, `orders.ts:276-279` — each selecting
`taxableAmount / cgstAmount / sgstAmount / igstAmount` for a single-document
detail page. **None aggregates.** That is a read, not a grouping.

### 2.5 Every other reduce/Map over lines touching tax

| Site                                                                       | Key                                                                         |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/tax/src/compute.ts:92-94`                                        | **none** — flat `sumDecimals` over all lines                                |
| `apps/workers/src/templates/_components/LineItemsTable.tsx:18-21`          | **none** — one grand-total footer row                                       |
| `apps/workers/src/pdf/view-model.ts:121-124`                               | **none** — same four reduces for the Typst view model                       |
| `apps/workers/src/templates/quotation.tsx:211`, `performa-invoice.tsx:139` | **`lineId`** — a per-line join back to engine output, explicitly not a rate |
| `apps/web/lib/quotation/preview.ts:102-105`                                | **none** — subtotal, only to cap the discount                               |
| `apps/web/app/(app)/dashboard/report-widgets.tsx:57-59`                    | **none** — collapses the grouped totals row to one number                   |
| `packages/db/src/seeds/day8.ts:257-273`, `day11.ts:105-119`                | **none** — three scalar accumulators; rate is a multiplier                  |

### 2.6 The shape of the engine's output

`packages/tax/src/types.ts:58-77`, `TaxComputationOutput` — all 9 fields:
`subtotal`, `discountAmount`, `taxableAmount`, `cgstAmount`, `sgstAmount`,
`igstAmount`, `totalAmount`, `isInterState`, `lines`.

**No field is an array or map keyed by rate.** The single array field, `lines`,
is positional — `types.ts:75` documents it as "same length and order as the input
lines" — and carries `lineId`. `gstRate` appears on `TaxLineOutput`
(`types.ts:45`) as a payload field per line, never as a key. **There is no HSN
field anywhere in `packages/tax`**: the complete field lists of `TaxLineInput`
(`:9-18`), `TaxComputationInput` (`:25-34`), `TaxLineOutput` (`:36-56`) and
`TaxComputationOutput` (`:58-77`) contain no `hsn`. `serialize.ts` mirrors the
same shape one-for-one (`:8-19`, `:22-32`).

The only aggregation in the engine is `compute.ts:92-94` — three flat
`sumDecimals` calls over every line. Rate enters only as a scalar multiplier at
`:58` (`new Decimal(line.gstRate).dividedBy(100)`), and the branch at `:64-72` is
on `interState`, not on the rate.

### 2.7 The nearest thing that exists: a distinct-rate _count_

Three sites compute a rate `Set`, and all three use it only to decide whether a
single label can be printed. **No money is aggregated at any of them.**

1. `apps/workers/src/templates/quotation.tsx:234-235` — `null` when mixed.
2. `apps/workers/src/templates/performa-invoice.tsx:161-162` — byte-identical.
3. `apps/web/app/(app)/quotations/_components/summary-card.tsx:37-45` — `'mixed'`
   when mixed.

### 2.8 Exports

**There is no XLSX export anywhere; CSV is the only format.** The single export
path, end to end: `reports/_components/download-csv.tsx:29` (client blob,
`text/csv`) → `reports/actions.ts:31-60` (`exportReportCsv`, a `'use server'`
action, role-gated at `:37` by `canAccessReport`) → `reports/resolve.ts:31-72`
(`runReport`) → `reports/csv.ts:49-59` (`reportToCsv`, which iterates
`result.columns` and `result.rows` verbatim).

Because the CSV is a pure projection of `ReportResult.columns`, **the exported
GST CSV carries no rate column and no HSN column**, one row per
(place of supply, inter/intra) pair. The sales-summary CSV carries the single
combined `Tax (CGST+SGST+IGST)` column.

Noted in passing, outside this audit's question: `exportReportCsv` is **not**
wrapped in `tenantAction`/`operatorAction`; it calls `getAuthContext()` +
`canAccessReport` directly (`actions.ts:35-41`) and uses `withTenant` only for
the slug lookup (`:45-52`).

---

## 3. `gstRate` handling

### 3.1 Declarations

**Drizzle — the complete set of four columns**, none with `mode: 'number'`:

| file:line                                        | declaration                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/product.ts:38`           | `gstRate: decimal({ precision: 5, scale: 2 })` NOT NULL                                        |
| `packages/db/src/schema/quotation.ts:157`        | same (preceded at `:156` by "CRITICAL: gst_rate is the source of truth for Day 9 tax engine.") |
| `packages/db/src/schema/performa-invoice.ts:162` | same                                                                                           |
| `packages/db/src/schema/order.ts:155`            | same                                                                                           |

**Zod — both declarations coerce to number before comparing:**

- `packages/schemas/src/product.ts:19-24` —
  `z.coerce.number().refine((n) => GST_RATES.includes(n), ...)`, with
  `GST_RATES = [0, 5, 12, 18, 28]` at `:4`.
- `packages/schemas/src/quotation.ts:42-44` —
  `z.coerce.number().refine((n) => [0, 5, 12, 18, 28].includes(n), ...)`.

Both `.refine()` calls run **after** the coercion, so `'18.00'` → `18` before the
membership test.

**Tax engine:** `packages/tax/src/types.ts:7` — `GstRate = 0 | 5 | 12 | 18 | 28`,
a number union.

### 3.2 The decisive structural fact

**All four rate columns are `decimal(5, 2)`, i.e. Postgres `numeric(5,2)`.** A
numeric column with a declared scale is normalised on write, so a row written as
`'18'` and a row written as `'18.00'` are the same stored value and the driver
returns one canonical form for both.

This means the `'18'` vs `'18.00'` divergence **cannot originate in the database
for these four columns.** `CLAUDE.md` §5's warning remains correct about the
driver returning a _string_; what this audit adds is that the string is
canonical, so two rows cannot disagree with each other. The hazard is therefore
not "two DB rows form two groups" but "a DB string compared against a
non-DB string".

> **This paragraph rests on the column declaration plus documented Postgres
> semantics, NOT on an executed read-back.** No Postgres server is available in
> this environment (§8.1), and no test in the repo asserts the format that comes
> back out of the driver (§8.2). Treat it as a strong inference, not a
> measurement. It is the single load-bearing assumption in §3.

### 3.3 Sites exposed to the hazard

The complete set of comparison / equality / object-key / `Map` key / `Set`
member / `.includes()` / sort-key / `groupBy` sites touching a GST rate has
**12 members**, enumerated exhaustively:

| #   | Site                                                                           | Exposed?                                                                                      |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1   | `packages/tax/src/compute.ts:135` `VALID_GST_RATES.includes(...)`              | theoretical only — see §3.4                                                                   |
| 2   | `packages/schemas/src/product.ts:22`                                           | no — `z.coerce.number()` first                                                                |
| 3   | `packages/schemas/src/quotation.ts:42`                                         | no — `z.coerce.number()` first                                                                |
| 4   | `apps/workers/src/templates/quotation.tsx:51` `find(r => r === n)`             | no — `const n = Number(raw)` on the line above (`:50`)                                        |
| 5   | `apps/workers/src/templates/performa-invoice.tsx:39`                           | no — `Number(raw)` at `:38`                                                                   |
| 6   | `apps/workers/src/templates/quotation.tsx:234` `new Set(...)`                  | no — `lines` built at `:227` with `gstRate: Number(l.gstRate)`                                |
| 7   | `apps/workers/src/templates/performa-invoice.tsx:161` `new Set(...)`           | no — source `Number()`d at `:155`                                                             |
| 8   | `apps/web/app/(app)/quotations/_components/summary-card.tsx:38` `new Set(...)` | no — `BuilderLineRow.gstRate` is `number`; DB source `Number()`d at `load-builder-data.ts:87` |
| 9   | `apps/web/lib/actions/products/update-product.ts:30`                           | no — a `Set` of **field names**, not rates                                                    |
| 10  | **`apps/web/app/(app)/catalog/[id]/product-detail-sections.tsx:255`**          | **YES — the one live exposure**                                                               |
| 11  | `apps/web/app/(app)/catalog/new/new-product-form.tsx:121`                      | no — initial value is the literal `'18'`, never a DB read                                     |
| 12  | `packages/db/tests/quotation.test.ts:152,156`                                  | no — comparison happens inside Postgres against `numeric`                                     |

**Sites 6, 7 and 8 are the exact sites `CLAUDE.md` §5 warns about — and all three
already normalise.**

#### The one exposure — `product-detail-sections.tsx:255`

Chain traced end to end and re-verified on the main thread with `git grep -n` and
direct reads:

- `apps/web/lib/queries/products.ts:14` declares `gstRate: string` — **the only
  query module in the repo that does not `Number()` the rate.**
  (`quotations.ts:328`, `performa-invoices.ts:314`, `orders.ts:295` all do.)
- `products.ts:63` (and `:89` `getProductById`, `:116` `searchProducts`) select
  the column raw.
- `apps/web/app/(app)/catalog/[id]/page.tsx:72` passes the string into the client
  component.
- `product-detail-sections.tsx:24` types it `gstRate: string`; `:232` seeds the
  edit form with the product row.
- `:255` is a **controlled `<select value={form.gstRate}>`** whose options are
  `{[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}`
  (`:259-263`), i.e. option values `'0' '5' '12' '18' '28'`.

If the driver returns `'18.00'`, no option matches and the select renders with
nothing selected — a user opening "edit pricing" on an 18% product does not see
18% selected. **Partial mitigation:** `:238` submits `Number(form.gstRate)`, so
saving without touching the select still persists `18`. The defect is in what is
displayed and what the user is led to pick, not in what is stored.

**This finding is conditional on §3.2's unexecuted assumption**, and sharply so:
seeded products are written as `'18'` (`day5.ts:270`), so if Postgres did _not_
normalise, the select would match and there would be no defect at all. It stands
or falls on the read-back format.

#### Adjacent, same root cause, display-only

Four sites render `18.00%` where every other surface renders `18%`, all tracing
to the same un-normalised `queries/products.ts`: `catalog/page.tsx:165`,
`catalog/page.tsx:193`, `catalog/[id]/page.tsx:58`,
`product-detail-sections.tsx:285`.

### 3.4 Finding 6 — 3% is accepted by the database and thrown on by the engine

- **The DB accepts it.** All four CHECK constraints read
  `IN (0, 3, 5, 12, 18, 28)` — `product.ts:72`, `quotation.ts:171`,
  `performa-invoice.ts:175`, `order.ts:172`, widened by migration
  `0017_friendly_logan.sql`.
- **The engine throws on it.** `packages/tax/src/compute.ts:7` declares
  `VALID_GST_RATES = [0, 5, 12, 18, 28]` and `:135-140` throws
  `TaxComputationError('INVALID_GST_RATE', ...)`.

**This upgrades what DEV.100 recorded.** That entry noted the omission in the
`GstRate` _type union_ (`types.ts:7`) — a compile-time gap. The runtime list at
`compute.ts:7` omits 3 as well, so a 3% line is insertable by any route that
bypasses the Zod layer and then **throws at PDF render time**, not merely at
type-check time.

Every application-side rate list omits 3. The complete enumeration is nine
constants: `packages/tax/src/types.ts:7`, `packages/tax/src/compute.ts:7`,
`packages/schemas/src/product.ts:4`, `packages/schemas/src/quotation.ts:42`,
`apps/workers/src/templates/quotation.tsx:46`,
`apps/workers/src/templates/performa-invoice.tsx:35`, and the two `<select>`
option arrays at `new-product-form.tsx:125` and
`product-detail-sections.tsx:259`. **None contains 3.**

This is adjacent to, not an instance of, the string hazard.

### 3.5 How the rate reaches Typst

`buildViewModel` (`pdf/view-model.ts:107`) runs `convert()` (`:75-96`) and the
result is `JSON.stringify`d. `convert()` transforms only `Date`s, keys in
`MONEY_KEYS` (`:26-41`) and keys in `DATE_KEYS` (`:44-54`). **`gstRate` is in
neither set** — both were read in full — so it passes through as the JavaScript
**number** produced by `Number(l.gstRate)` at `quotation.tsx:227` /
`performa-invoice.tsx:155`. `JSON.stringify(18)` → `18`, which Typst's `json()`
decodes as an int, so `str(l.gstRate)` at `quotation.typ:78` yields `"18"`, never
`"18.00"`.

**The `.typ` sources perform no comparison, no keying and no arithmetic on the
rate**, by design — `view-model.ts:13-16` and `render-typst.ts:202` both state
that a template must not do arithmetic. Of the 5 `.typ` files, `gstRate` appears
in exactly one (`quotation.typ`, at `:78`, `:104`, `:106`).

---

## 4. Per-line storage — `hsnCode` and `gstRate`

**Verdict: EXISTS on all three line tables, NOT NULL, no default, snapshotted at
creation.**

### 4.1 Column definitions

| Table                    | `hsnCode`                                    | `gstRate`                                                               |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------- |
| `quotation_lines`        | `schema/quotation.ts:150` `text().notNull()` | `schema/quotation.ts:157` `decimal({precision: 5, scale: 2}).notNull()` |
| `performa_invoice_lines` | `schema/performa-invoice.ts:157` (same)      | `schema/performa-invoice.ts:162` (same)                                 |
| `order_lines`            | `schema/order.ts:150` (same)                 | `schema/order.ts:155` (same)                                            |
| `products` (the source)  | `schema/product.ts:37`                       | `schema/product.ts:38`                                                  |

All NOT NULL, **none with a default.** The schema spells it `performa`
throughout; `proforma` appears nowhere in the schema directory.

`quotation.ts:144` carries the intent comment `// Product snapshot — source of
truth for tax engine.`, and `:156` `// CRITICAL: gst_rate is the source of truth
for Day 9 tax engine.`

### 4.2 The SQL as it exists in the migrations

Migrations are `packages/db/migrations/0000`–`0017`, 18 files, all registered in
`meta/_journal.json`.

- `0007_keen_odin.sql:4-25` — `quotation_lines`: `"hsn_code" text NOT NULL`,
  `"gst_rate" numeric(5, 2) NOT NULL`, plus
  `CONSTRAINT "quotation_lines_gst_rate_chk" CHECK (... IN (0, 5, 12, 18, 28))`.
- `0009_perfect_krista_starr.sql:13,17,24` and `:89,93,102` — the same shape for
  `performa_invoice_lines` and `order_lines`.
- `0004_huge_king_cobra.sql:56,57,72,73` — `products`, plus
  `CONSTRAINT "products_hsn_chk" CHECK ("products"."hsn_code" ~ '^[0-9]{4,8}$')`.

### 4.3 The CHECK constraint rate set — **3 IS PRESENT**

`packages/db/migrations/0017_friendly_logan.sql` replaced all four rate
constraints. Read in full on the main thread; it is 8 statements, dropping then
re-adding `products_gst_rate_chk`, `quotation_lines_gst_rate_chk`,
`performa_invoice_lines_gst_rate_chk` and `order_lines_gst_rate_chk`, each now:

```sql
CHECK ("<table>"."gst_rate" IN (0, 3, 5, 12, 18, 28));
```

The Drizzle declarations agree — `product.ts:72`, `quotation.ts:171`,
`performa-invoice.ts:175`, `order.ts:172`.

**The allowed set is exactly `{0, 3, 5, 12, 18, 28}` on all four tables, and 3
is in it.** `CLAUDE.md` §5 is **correct** as a statement about the constraints.
It is not correct as a statement about the running code — see §3.4, and note that
**`docs/TAX_INVOICE_AUDIT.md:140` is stale**: it states the constraint as
`IN (0,5,12,18,28)`, which migration 0017 superseded.

**No test asserts that 3 is accepted.** `packages/db/tests/quotation.test.ts:134-158`
is the only rate-constraint test and asserts only the negative case (`'9.00'` →
`/gst_rate_chk/`). Its comment at `:152` — `// not in (0, 5, 12, 18, 28)` — no
longer names the real set, though the assertion itself remains valid.

**There is no HSN CHECK on any of the three line tables.** The complete
constraint arrays were read: `quotation_lines` has 4 (`quotation.ts:169-172` —
qty, unit_price, gst_rate, line_total), `performa_invoice_lines` has 4
(`performa-invoice.ts:173-176`), `order_lines` has 6 (`order.ts:170-181` — those
four plus `reserved_chk` and `dispatched_chk`). **A line can therefore be written
with a malformed or empty HSN string.** Only `products_hsn_chk`
(`product.ts:71`, `^[0-9]{4,8}$`) enforces the shape, and only at product-write
time. The Zod layer applies the same regex at `packages/schemas/src/product.ts:18`
and `packages/schemas/src/quotation.ts:38`.

### 4.4 Snapshotted, not read through

Every insert call site for the three line tables was enumerated: 6 production, 6
seed, 5 test. The 6 production sites:

| Path                                                | Source of `hsnCode` / `gstRate`                                |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `lib/actions/quotations/create-quotation.ts:111`    | `buildLineInserts` → the **product master**                    |
| `lib/actions/quotations/helpers.ts:301`             | same helper (the shared replace-lines path)                    |
| `lib/actions/quotations/revise-quotation.ts:77`     | copies the **parent revision's stored line rows** (`:85`)      |
| `lib/actions/pi/convert-quotation-to-pi.ts:135-136` | copies the **stored quotation line** (`pi/helpers.ts:197,201`) |
| `lib/actions/pi/update-pi.ts:70-75`                 | **re-reads the product master** (`:43`, `:51`, `:55`)          |
| `lib/actions/pi/status-transitions.ts:177-194`      | copies the **stored PI line** (`:185`, `:189`)                 |

The snapshot itself is `lib/actions/quotations/helpers.ts:205-234`, whose own
comment reads `// gst_rate + hsn captured from product master at line-creation
time.` — `hsnCode: p.hsnCode` at `:224` and `gstRate: gstRate.toFixed(2)` at
`:228`. **The client cannot supply either value**; the caller's input contributes
only quantity, price, UoM, description and notes.

**Read-through at render time is absent.** Both the PDF loader and the screen
queries read the line row, never `products`:
`apps/workers/src/templates/quotation.tsx:220,227`;
`lib/queries/quotations.ts:324,328`; `lib/queries/performa-invoices.ts:310`;
`lib/queries/orders.ts:291`. The only live read of `products.hsn_code` is
`lib/queries/procurements.ts:89`, which is procurement, not a sales document —
`procurement_items` has no HSN column of its own.

**Two facts worth carrying into a spec.** First, `update-pi.ts` **re-snapshots
from `products`**, so editing a draft PI discards the quotation's snapshot for
those lines; the other five paths copy forward. Second,
`status-transitions.ts:185,189` copies the strings straight through with no
`Number()` round-trip, so whatever format is stored on the PI line is the format
stored on the order line.

All four mutating actions are wrapped: `tenantAction(['admin','sales'], ...)` at
`create-quotation.ts:29-30`, `update-quotation.ts:21-22`,
`revise-quotation.ts:21-22`, `update-pi.ts:25-26`. RLS is enabled and forced on
all three line tables — `packages/db/src/rls/{quotations,performa-invoices,orders}.sql:8-11`.

### 4.5 Every other line table

The complete schema listing is **23 files**, and the barrel
`packages/db/src/schema/index.ts` exports **22 modules** — every file except
`index.ts`. **There is no invoice module and no `invoice_lines` table**;
`'invoice'` exists only as an enum member at `generated-document.ts:17`.

| Line table               | Declared at               | `hsn_code`? | `gst_rate`?                                         |
| ------------------------ | ------------------------- | ----------- | --------------------------------------------------- |
| `quotation_lines`        | `quotation.ts:131`        | YES         | YES                                                 |
| `performa_invoice_lines` | `performa-invoice.ts:139` | YES         | YES                                                 |
| `order_lines`            | `order.ts:132`            | YES         | YES                                                 |
| `dispatch_lines`         | `dispatch.ts:105`         | **NO**      | **NO** (tax-neutral by design, `dispatch.ts:30-32`) |
| `dispatch_serials`       | `dispatch.ts:146`         | NO          | NO                                                  |
| `payment_allocations`    | `payment.ts:123`          | NO          | NO                                                  |
| `procurement_items`      | `inventory.ts:68`         | NO          | NO                                                  |
| `deal_products`          | `deal.ts:118`             | NO          | NO                                                  |
| _(no `invoice_lines`)_   | —                         | —           | —                                                   |

The four "NO"s are affirmative: the repo-wide case-insensitive `hsn` enumeration
(§5.2) names exactly four schema files containing the string — `product.ts`,
`quotation.ts`, `order.ts`, `performa-invoice.ts`. `dispatch.ts`, `payment.ts`,
`inventory.ts` and `deal.ts` are absent from that 99-file list.

---

## 5. HSN/SAC summary

**Verdict: DOES NOT EXIST.** No HSN-wise or SAC-wise summary table or section
exists in any PDF template, screen, report or query.

### 5.1 The enumeration that backs it

**`apps/workers/src/templates-typst/` — 5 files, each read in full:**

| File                   | Sections it renders                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_lib/chrome.typ`      | shared chrome. A complete enumeration of its `#let` exports gives **24 definitions**: `px`, 8 colours, 2 font stacks, `money`, `rupees`, `card`, `card-row`, `caps-label`, `data-table`, `callout`, `meta-row`, `party-body`, `doc-shell`, `doc-header`, `supply-badge`, `totals-block`, `footer-block`, `serial-chips`, `ack-block`. **No HSN or rate-grouping block among them.** |
| `quotation.typ`        | header → Bill-To/Ship-To/Place-of-Supply → **one flat line-items table** (`:63-93`) → `totals-block` (`:97-110`) → footer. HSN appears at `:72` only, as a muted subline `l.sku + " · HSN " + l.hsnCode`                                                                                                                                                                            |
| `performa-invoice.typ` | 23 lines; imports and calls `quotation-body` unchanged                                                                                                                                                                                                                                                                                                                              |
| `dispatch-note.typ`    | header → parties → order ref → logistics grid → serials → notes → acknowledgment → footer. Tax-neutral (`:3`)                                                                                                                                                                                                                                                                       |
| `payment-receipt.typ`  | header → received-from → amount card → method meta row → allocations table → advance callout → footer. Tax-neutral (`:3`)                                                                                                                                                                                                                                                           |

**`apps/workers/src/templates/` — 12 files**, enumerated in §1. `LineItemsTable.tsx`
carries HSN at `:45` only, inside the description cell; its `<tfoot>` (`:61-72`)
is a grand-total row, not a grouping. `TaxSummary.tsx` is a **fixed 7-row
`<tbody>` with no `.map()`, no grouping and no HSN column.**

**`apps/web/app/**/page.tsx`— 50 route files**, read in full. There is no`hsn-summary`route. The reports subtree is exactly 9 files, and the report
population is a **closed type union** —`apps/web/lib/reports/types.ts:50`,
four arms — corroborated by `ACCESS`, `REPORT_TITLES`and`REPORT_DESCRIPTIONS`in`access.ts:19-25,46-60`and by the barrel`reports/index.ts`.

**`apps/web/lib/queries/` — 11 files.** No `hsn-summary.ts`, no `tax-summary.ts`,
no grouping query. Five mention `hsn`, every occurrence a per-line or per-product
field projection.

**`apps/web/components/` — 16 files.** There is **no `components/documents/`
directory** in `apps/web` at all; document templates live only under
`apps/workers`.

**The claim, stated as the enumeration supports it:** an HSN/SAC summary is
absent from these 17 template files, 50 route files, 11 query files, 16
component files and the 4-arm report union — every one of which was listed and
read in full.

### 5.2 Every occurrence of `hsn`, classified

364 occurrences across 99 files, the complete file-level population read in full:

| Class              | Count / where                                                                   |
| ------------------ | ------------------------------------------------------------------------------- |
| Per-line display   | 16 files — PDF templates, quotation/PI/order screens, procurement screens       |
| Product-master UI  | catalog list, detail, new, import                                               |
| DB column / schema | 4 schema files, 5 migration files, 14 snapshot JSONs                            |
| Zod validation     | `packages/schemas/src/product.ts:18`, `quotation.ts:38`                         |
| Write paths        | 6 files under `lib/actions/`                                                    |
| Read paths         | the 5 `lib/queries/*` projections                                               |
| Seed               | 5 files under `packages/db/src/seeds/`                                          |
| Test               | 6 files                                                                         |
| **Summary table**  | **ZERO code occurrences.** Every remaining hit is prose or a reference artefact |

**SAC.** A search for `\bsac\b|sacCode|sac_code` returns **13 hits, every one in
a document** — `PROJECT_PLAN.md`, `docs/DAY_26_PROMPT.md`,
`docs/PHASE_2_PLAN_v2.md`, `docs/TYPST_DIFF.md`, `docs/STAGE_F_BUILD_v3.md`,
`docs/DAY_27_PROMPT.md`, `docs/TAX_INVOICE_AUDIT.md`, `docs/stage-f-tasks.json`.
**Zero hits in `apps/`, `packages/` or `scripts/`.** There is no `sac_code`
column, no SAC constant and no SAC field anywhere in code.

---

## 6. Round-off — where a row would go

**Verdict: no round-off row exists in any template, any on-screen block, any
schema column, or `packages/tax`. A documented insertion point EXISTS in exactly
one place in code.** Nothing below is implemented or proposed; this section
records where Day 26 said the row goes.

### 6.1 The documented insertion point, quoted verbatim

`apps/workers/src/templates-typst/_lib/chrome.typ:337-346`, read on the main
thread:

```
// ── Totals block ───────────────────────────────────────────────────────────
// `.summary`: the amount-in-words tile on the left, a fixed 250px totals list
// on the right. The list is flat — the Grand Total's 2px rule is the only heavy
// element, as in the reference.
//
// ROUND-OFF INSERTION POINT. The whole-rupee round-off adjustment line is NOT
// implemented in Phase 1 and must not be added here — it is F.6's, it has tax
// consequences, and it is not a rendering concern. Insert it as one more pair
// in `rows` immediately before the rule below and nothing else moves:
//     ("Round Off", money(data.roundOff))
```

`totals-block` is **caller-driven**: `chrome.typ:363-366` renders whatever pairs
it is handed (`..rows.map(r => ...)`), and the 2px rule is at `:369`. **No edit
to `chrome.typ` is required.**

### 6.2 Where the row would sit, per template and per screen

| Surface                                                               | Current row sequence                                                                                                                   | Insertion point                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `templates-typst/quotation.typ:97-110` (and the PI, which imports it) | `:100` Subtotal → `:101` Discount (conditional) → `:102` Taxable → `:103-107` IGST **or** CGST+SGST → `:109` `grand: data.totalAmount` | **between `:107` and `:108`** — after the last tax row, before the close of the `rows:` argument |
| `templates/_components/TaxSummary.tsx` **(dead — §1.2)**              | `:40-43` Subtotal → `:44-51` Discount → `:52-55` Taxable → `:56-72` IGST or CGST+SGST → `:73-76` Grand Total                           | between `:72` and `:73`                                                                          |
| `summary-card.tsx` (builder preview)                                  | `:68` Subtotal → `:69-75` Discount → `:76` Taxable → `:77-96` IGST or CGST+SGST → `:99-107` Total                                      | between `:96` and `:97`                                                                          |
| `quotations/[id]/page.tsx`                                            | `:242` Subtotal → `:243-249` Discount → `:250` Taxable → `:251-258` tax rows → `:260-265` Total                                        | between `:258` and `:259`                                                                        |
| `pi/[id]/page.tsx`                                                    | `:239` Subtotal → `:240-246` Discount → `:247` Taxable → `:248-255` tax rows → `:257-261` Total                                        | immediately before `:256`                                                                        |
| `orders/[id]/page.tsx`                                                | `:198` Subtotal → `:199-205` Discount → `:206` Taxable → `:207-214` tax rows → `:216-221` Total                                        | between `:214` and `:215`                                                                        |

`dispatch-note.typ` and `payment-receipt.typ` have **no grand-total block** and
never call `totals-block`; their only totals are a line-table footer
(`dispatch-note.typ:115-120`) and an allocations footer
(`payment-receipt.typ:84-87`).

### 6.3 What the day prompts say

**`docs/DAY_26_PROMPT.md` documents it**, at Phase 3 (`:78-87`): round-off is
"NOT" to be implemented, but "DO leave the totals block structured so a round-off
line can be inserted later without re-laying-out the block. State in the template
comments where it would go." Its checklist carries `:152`
`- [ ] Round-off **not** implemented; insertion point documented`.

**`docs/DAY_27_PROMPT.md` does not** document an insertion point. Its only
mention is the guardrail at `:138` — "Do not implement round-off — that is F.6."

### 6.4 `packages/tax/src/round.ts` — the deliberate exclusion

26 lines. Its only export is `round2()` at `:24-26`. The out-of-scope statement,
`:15-22`, verbatim in the relevant part:

> That is a separate, document-level line item — it is NOT modelled by this
> engine (the quotation schema has no round-off column in Phase 1), and it does
> not contradict line-level rounding of the tax components themselves. If/when a
> round-off line is introduced, it is computed once on `totalAmount`, consistent
> with §6.

### 6.5 No `round_off` column exists

Answered by enumerating the columns of every totals-bearing table in full, not by
searching for the word:

- **`quotations`** (`quotation.ts:39-129`) — money columns are `subtotal :74`,
  `discountAmount :75`, `taxableAmount :76`, `cgstAmount :77`, `sgstAmount :78`,
  `igstAmount :79`, `totalAmount :80`. **No round-off. No per-rate or HSN column.**
- **`performa_invoices`** (`performa-invoice.ts:43-137`) — the same seven at
  `:88-94`. No round-off.
- **`orders`** (`order.ts:47-130`) — the same seven at `:85-91`. No round-off.
- **`payments`** (`payment.ts:41-116`) — `amount :58`, `allocatedAmount :85`.
  Tax-neutral.
- **`payment_allocations`** (`payment.ts:123-156`) — `amount :138`.
- **`dispatches` / `dispatch_lines` / `dispatch_serials`** — **zero `decimal()`
  columns**; the dispatch tables carry no money at all.
- **No invoice table exists**, so "any invoice table" has no columns to enumerate.

Corroborating (weaker, and named as such): a repo-wide case-insensitive search
for `round_off|roundOff|round-off|roundoff` returns **no hit anywhere in
`packages/db/`** — not in the 18 migrations, not in any schema file, not in any
RLS or trigger SQL. The only code hits in the repo are `packages/tax/src/round.ts:15,19,21`
and `chrome.typ:342,346` — both prose.

### 6.6 A second, conflicting insertion-point record

`docs/stage-f-tasks.json`, F.6's notes, states the work includes "a Round Off row
in `TaxSummary.tsx`". **That is the decommissioned React component** (§1.2). The
live insertion point is the `rows` argument at `quotation.typ:99-108` feeding
`chrome.typ:363-366`. The two records disagree; the one in `chrome.typ` is the
one sitting in live code.

`docs/pdf-references/README.md:90` records that round-off is not represented in
the reference matrix "because the feature does not exist (F.6)", and
`docs/pdf-references-day25-signoff/reference-metadata.json` carries
`"roundOff": null` on all 14 cases.

---

## 7. Money invariants

**Verdict: six money-parity invariants EXIST. No rate-wise or HSN-wise invariant
exists — no test, no constraint and no trigger touches either dimension.**

Test population enumerated in full: 51 `*.test.ts(x)` files and 23 `*.spec.ts`
files (all under `apps/web/tests/e2e/`). `packages/tax/` contains **exactly one**
test file and **no fixture directory and no snapshot file** — its fixtures are
inline arrays inside `compute.test.ts`.

### 7.1 The invariants

| #   | Invariant                                                       | Where                                                     | What it asserts today                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Report totals row = sum of the report's own rows                | `apps/web/lib/reports/reports.test.ts:54-139`             | internal self-consistency of one grouping, 2-dp tolerance, via `sumColumn` at `:34-35`. For GST: `orders, taxable, cgst, sgst, igst` (`:134-139`)                                                                                                        |
| 2   | **GST report ≡ a direct SQL `SUM`**                             | `reports.test.ts:141-164`                                 | the only test comparing a report against an independent `SUM`. Four scalars — cgst, sgst, igst, taxable — over `orders` header columns (`:160-163`)                                                                                                      |
| 3   | Tax engine ≡ stored quotation headers                           | `packages/db/tests/quotation-engine-parity.test.ts:70-94` | re-runs `computeTax` on every seeded `QT-%` quotation; **exact string equality** at 2 dp on all seven header money columns                                                                                                                               |
| 4   | Header subtotal ≡ `SUM(line_total)`                             | `packages/db/tests/quotation.test.ts:372-416`             | `SUM(quotation_lines.line_total) ≈ quotations.subtotal` for seeded `QT-%` rows in both tenants                                                                                                                                                           |
| 5   | `payments.allocated_amount` ≡ `SUM(payment_allocations.amount)` | `packages/db/tests/payments.test.ts:353-386`              | plus "no payment allocates more than its amount". Tax-neutral money                                                                                                                                                                                      |
| 6   | Tax-engine internal structure                                   | `packages/tax/tests/compute.test.ts:448-546`, `:273-289`  | over six inline fixtures: Σ line subtotals = document subtotal; subtotal − discount = taxable; cgst+sgst+igst = Σ per-line tax; inter ⇒ zero CGST/SGST; intra ⇒ zero IGST; total = taxable + all three; per line, lineTaxable + lineTaxTotal = lineTotal |

**Plus a content-freeze, not an arithmetic invariant:** `apps/workers/tests/pdf-snapshots.test.ts`
pins every glyph of every document against `docs/pdf-references/` — `:131` page
count, `:134` footer, `:147` full extracted body text — and `:152-156` asserts
byte-identical re-rendering. Its header at `:20-23` states "NOTHING IS EXCLUDED
FROM THE ASSERTIONS. Not the footer, not the dates." It would catch a totals row
changing value or moving; it verifies nothing about whether the printed figures
add up.

### 7.2 What the existing invariants do not cover

Stated as scope facts, not as a proposed extension:

- **Invariant 2 reads only header columns.** Both sides of the parity —
  the report and the direct `SUM` — read `orders.{cgst,sgst,igst,taxable}_amount`.
  It never touches `order_lines`, so it cannot detect a header/line divergence,
  and it reads neither `order_lines.gst_rate` nor `order_lines.hsn_code`. A
  rate-wise or HSN-wise figure has no counterpart assertion of any kind.
- **Invariant 3 covers quotations only.** `performa_invoices` and `orders` have
  **no equivalent parity test**. Every other occurrence of a totals column across
  `packages/db/tests` is fixture construction, not an assertion.
- **Invariant 4 covers `subtotal` only**, not the tax columns, and only
  `quotation_lines`. `performa_invoice_lines` and `order_lines` have no analogue.
- **Invariant 6 has nothing rate-grouped to assert on.** `TaxComputationOutput`
  carries seven scalars plus a positional `lines[]`; `TaxLineOutput` carries
  `gstRate` per line but **no `hsnCode` at all** (§2.6). Suite 3 (`:116-184`)
  exercises mixed rates in one document but asserts document-level figures only —
  `:128` expects `'135600.00'` with the inline comment `// 135000 + 600`, i.e.
  the test explicitly expects two rates to be **added together**.
- **No e2e money-parity assertion exists.** A search for `SUM(`/`reduce(` over
  `apps/web/tests` returns nothing; the only money check in the e2e suite is a
  hard-coded `EXPECTED_TOTAL` at `critical-path.spec.ts:256-259`.
- **No runtime (non-test) invariant exists.** No server action or query asserts
  stored totals against a recomputation; `lib/actions/pi/helpers.ts:41-77`
  recomputes via `computeTax` and **writes** the result rather than comparing it.

### 7.3 Database-level guarantees, enumerated

42 `.sql` files under `packages/db/`: 21 RLS, **exactly one** trigger file
(`src/triggers/audit-log.sql`), 18 migrations, 2 rollbacks. **No trigger asserts
totals consistency.**

The CHECK constraints on totals-bearing tables were enumerated per table. **The
only DB-level statement relating one money figure to another is
`payments_allocated_chk`** (`payment.ts:103-106` — allocated ≤ amount). Every
other money CHECK is a non-negativity or domain bound: `quotations_subtotal_chk`
/ `quotations_total_chk` (`quotation.ts:125-126`), the equivalents at
`performa-invoice.ts:133-134` and `order.ts:127-128`, and `>= 0` on each line
total. **No constraint relates a header total to a SUM over its lines** — that
relationship lives only in tests 3 and 4.

### 7.4 The fixture problem

**The seed corpus cannot exercise multi-rate or multi-HSN at all.**
`packages/db/src/seeds/day5.ts:259-337` — `generateProducts()`, read in full on
the main thread — returns **20 products** (7 Premier + 6 Adani + 7 Vikram), and
**every one** carries `gstRate: '18'` (`:270`, `:295`, `:320`) and
`hsnCode: '85414300'` (`:269`, `:294`, `:319`). A sweep of every `gstRate:`
literal across `packages/db/src/seeds` returns only `'18'` and `'18.00'`.

**No reference-PDF case is mixed-rate either.** `apps/workers/scripts/typst-matrix.json`,
read in full on the main thread, holds **14 cases**: four quotations, two PIs, one
payment receipt, three dispatches, and four branded re-captures. They vary by
intra/inter, tenant, line count (1, 2, 3, 8) and serial count (26, 500). **None
is a mixed-rate document.**

Consequently the only worker tests asserting on tax labels
(`quotation-template.test.ts:104,121-123`) use `gstRateLabel: '18'` — single-rate
by construction — and target the **dead** React path (§1.2). Per CLAUDE.md §11.1
ruling 4, the fixture, not the assertion, is where that gap lives.

---

## 8. What could not be determined

Stated plainly rather than inferred.

### 8.1 The driver's read-back format for `numeric(5,2)` — NOT EXECUTED

§3.2's claim that Postgres normalises `'18'` and `'18.00'` to one canonical
returned string rests on the column declaration plus documented Postgres
semantics. **It was not executed.** There is no Postgres **server** in this
environment — `psql` 16.15 is present as a client, `pg_isready` reports no
response on `localhost:5432`, `docker` is not installed, and
`/usr/lib/postgresql/16/bin/` contains client utilities only (no `initdb`,
`pg_ctl` or `postgres`).

This matters because §3.3's single exposed site depends on it in both
directions: seeded products are written as `'18'` (`day5.ts:270`), so **if
Postgres did not normalise, the `<select>` would match and there would be no
defect at all.** The finding stands or falls on that one unmeasured fact.

### 8.2 No test pins the read-back format either

Searching `packages/db/tests`, `apps/web/tests` and `packages/tax` for `'18'` /
`'18.00'` returns 9 hits, and **all nine are insert values**, not read-back
assertions: `dispatch.test.ts:91,151`, `orders.test.ts:120,175,350,397`,
`payments.test.ts:127`, `quotation.test.ts:178,325`. So the repo contains no
evidence either way about the format the driver returns.

### 8.3 Whether any existing reference PDF is incidentally mixed-rate

§7.4 establishes that no matrix case is _labelled_ mixed-rate and that every
seeded **product** is 18%. Those two together make it very unlikely, but the
document contents were not rendered or re-read to confirm it directly — that
would need the seed to run, which needs the database of §8.1.

### 8.4 Untracked files

Four of the five subagents ran without a Bash tool and used a ripgrep-backed
`Grep` plus `Glob` rather than the `git grep -n` → `rg -na` → `node -e` order
that §11.1 ruling 8 prescribes. `Glob` is filesystem-based and so did cover
files on disk in the directories enumerated, but **no instrument in this run
distinguished tracked from untracked files.** `git status` reports the worktree
clean, so nothing suggests an untracked implementation exists; that is an absence
of contrary evidence, not a check.

The load-bearing negatives were re-derived on the main thread with `git grep -n`:
the zero call sites for the four `build*Html` entry points, the single import of
`TaxSummary`, the complete `gst_rate` column and constraint set, and the
`insert(products)` call sites. Those four do not depend on a subagent's
instrument.

### 8.5 One search that returned a false empty, recorded because it is the point

A `Grep` with `glob: "{*.spec.ts,dealers.test.ts,procurements/**}"` returned "No
matches found" for `hsn` in files that an unfiltered enumeration had already
shown _do_ contain it — a malformed brace-glob, not a true negative. No claim in
this audit rests on it. It is recorded because it is a live instance of exactly
what §11.1 rulings 7 and 8 exist to guard against: **the instrument returned a
clean-looking empty set for a reason that had nothing to do with the code.**

### 8.6 Documentation drift found in passing

Not part of the question; recorded because each was encountered while verifying
something else, and each would mislead a spec written from it.

| Claim                                                                                                              | Reality                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` §5: `calculateGST(input): TaxBreakdown`                                                                | **Neither symbol exists.** The barrel exports `computeTax` (`packages/tax/src/index.ts:19`) returning `TaxComputationOutput` |
| `CLAUDE.md` §3 backend table: "Email — Resend SDK, Templates via `react-email`"                                    | **`react-email` is not a dependency.** Both templates are plain template literals under `apps/web/lib/email/templates/`      |
| `docs/stage-f-tasks.json` F.4 and F.6: the work lands in `templates/_components/TaxSummary.tsx`                    | that component is **dead code** (§1.2); the live site is `templates-typst/quotation.typ:97-110`                              |
| `docs/stage-f-tasks.json` F.6: "a Round Off row in `TaxSummary.tsx`"                                               | same; the live documented insertion point is `chrome.typ:337-346` → `quotation.typ:107` (§6.6)                               |
| `docs/TAX_INVOICE_AUDIT.md:140`: constraint is `gstRate IN (0,5,12,18,28)`                                         | **stale** — migration `0017_friendly_logan.sql` made it `(0, 3, 5, 12, 18, 28)` (§4.3)                                       |
| `apps/workers/src/templates/quotation.tsx:4`: "`buildQuotationHtml` is the entry point used by the render-pdf job" | **stale since Day 27** — the job imports loaders only (§1.2)                                                                 |
| `packages/db/tests/quotation.test.ts:152` comment: `// not in (0, 5, 12, 18, 28)`                                  | no longer names the real set; the assertion itself is still valid                                                            |

Per §11.2, these are **filed here as findings, not fixed.** Correcting them is
not this audit's scope.

---

## Appendix — method

**Instruments.** Main-thread verification used `git grep -n` and direct file
reads via `sed -n`; the five subagents used a ripgrep-backed `Grep` plus `Glob`
and full-file `Read`, without Bash. Bare `grep` was used nowhere as the basis for
a negative. §8.4 and §8.5 state the limits this imposed.

**Enumerations obtained and read in full**, each of which a reader can
re-derive: `apps/workers/src/templates-typst/` (5 files); `apps/workers/src/templates/`
(12); `apps/workers/src/pdf/` (5); `apps/web/app/**/page.tsx` (50);
`apps/web/lib/reports/` (12); `apps/web/lib/queries/` (11);
`apps/web/components/` (16); `apps/web/lib/email/` (5);
`packages/db/src/schema/` (23 files, 22-module barrel); `packages/tax/` (10
entries); `packages/db/**/*.sql` (42); the 18-file migration set and its
`_journal.json`; `apps/workers/scripts/typst-matrix.json` (14 cases); the
complete `GROUP BY` / `.groupBy()` result set for `apps/` (18) and `packages/`
(4); the complete `hsn` population (364 occurrences / 99 files); the complete
`gst_?rate` population (500 lines / 91 files, re-obtained at a second scope as an
anti-truncation control); the 24 `#let` exports of `_lib/chrome.typ`; the
`ReportKey` union, the `runReport` switch and the `ACCESS`/`REPORT_TITLES` maps
as three independent closed populations; the 51 `*.test.ts(x)` and 23 `*.spec.ts`
listings; `generateProducts()` (20 products).

**Citation check.** Every code path cited in this document was machine-checked
to exist, and every `file:line` reference to be within that file's length — 57
distinct files, 77 line references, zero misses. The checker was a throwaway and
is not committed; the durable part is the method, per DEV.133. **Note what that
check does and does not establish:** it proves no citation points at a
nonexistent file or past the end of one. It does **not** prove each line says
what is claimed of it. The load-bearing quotes — `chrome.typ:337-346`,
`0017_friendly_logan.sql`, `summary-card.tsx:37-45`, `render-pdf.ts:25-33,104`,
`compute.ts:7,135`, `types.ts:7`, the `TaxSummary` import set, the `build*Html`
call-site set, `queries/products.ts:14,63`, `product-detail-sections.tsx:255`,
`generateProducts()` and `typst-matrix.json` — were read directly on the main
thread and are quoted from what was read. The remainder rest on the subagent
reports.

**Nothing in this audit was fixed, and no code was edited.**
