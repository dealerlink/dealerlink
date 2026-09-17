# F.55 audit — true state of 3% GST rate support

> **Provenance.** This report was produced by the `code-auditor` subagent on
> 2026-09-17 and is transcribed here **unchanged**. The agent is granted
> `Read, Grep, Glob` only and its own prompt directs it to hand its report back
> as its return value rather than save it, so it could not write this file; the
> main thread transcribed it. Per CLAUDE.md §10.4 an audit report is the
> agent's return value and is evidence rather than a decision, so authorship is
> the agent's.
>
> **Independently re-checked by the main thread before transcription**, because
> the report corrects a number that other documents already assert:
>
> - The **eight-not-nine** count. Re-derived with a different instrument
>   (`git grep -nE` over `packages/**` and `apps/**`, excluding tests and the
>   F.88 worktree) — the same eight constants, no ninth. Separately, F.55's
>   notes were parsed programmatically: 13 distinct `file:line` citations, of
>   which four are CHECK constraints and one is `compute.ts:135`, the call site
>   of `VALID_GST_RATES` rather than a constant — leaving **eight** members
>   under the word "nine".
> - **All eight file:line anchors** were read directly and each holds the
>   literal the report quotes.
> - **HEAD.** The report flags uncertainty about the commit (its caveat 6.3).
>   HEAD is `c4b8a77`, which matches its header, so the line numbers are as
>   audited.
>
> No spec is drawn here. The spec is the operator's.

---

**Audited:** the Dealerlink monorepo at `/workspace`, working tree on branch `f81-spec`, HEAD `c4b8a77` ("feat(seeds): F.81 — multi-rate seed data + mixed-rate documents"), per the session's git snapshot. **Date:** 2026-09-17.

**Scope:** read-only audit. No file was modified. Six questions, answered from implementing code.

**Instrument note (CLAUDE.md §11.1 ruling 8).** Every negative in this report was produced with the ripgrep-backed `Grep` tool and/or `Glob` directory listings, and each negative is stated as an affirmative enumeration — "X is absent from this list, which I read in full" — with the list named. No `Bash`, no bare `grep`, was used (none is available to this agent).

**Exclusion applied throughout.** `/workspace/.claude/worktrees/f82-claudemd-gstrate/` is an untracked second worktree checkout that duplicates almost every hit. It is excluded from all counts below. (It is itself filed as F.88.)

**Doc-claim disclosure, required by the auditing rules.** The answer to several of these questions is stated in prose in `docs/stage-f-tasks.json` (F.55's `notes`, line 506), in `DEVIATIONS.md:5542-5606, 5750-5857`, and in `docs/F3_F4_AUDIT.md:468`. I ran my own enumerations **before** reading F.55's notes, and I did not open `docs/F3_F4_AUDIT.md` at all (I saw only two of its lines incidentally in grep output). Where my finding differs from the doc claim — it does, on the count of nine — I say so and give the members.

---

## 1. Every rate-list constant that omits 3%

### Method

Three independent passes, all over the whole repo:

1. `Grep` `18[^0-9]{0,8}28` across `/workspace/packages` and `/workspace/apps` — catches any single-line list where `18` and `28` are adjacent in any punctuation (`[0, 5, 12, 18, 28]`, `'18', '28'`, `18 | 28`, `{0,5,12,18,28}`).
2. `Grep` multiline `\b5\b[\s,'"|]{1,20}\b12\b[\s,'"|]{1,20}\b18\b` over `**/*.{ts,tsx,typ,sql,json}` — catches lists broken across lines. Full 155-line result read in full.
3. `Grep` `GST_RATES|GstRate|gstRate|gst_rate` over `/workspace/apps` (117 hits) and `/workspace/packages` minus `migrations/meta` (≈140 hits), both read in full — this is the complete population of every symbol in the repo that names a GST rate, so a rate list spelled in a way passes 1 and 2 missed would still have to live next to one of these names.

Passes 1–3 agree on the same set. The list below is therefore an enumeration, not an empty search.

### The constants (rate-list arrays and type unions, non-test source): **eight**

| #   | file:line                                                         | exact literal                                                                   | consumed by                                                                                                                                                                                                       | reachable with a 3% value?                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/tax/src/types.ts:7`                                     | `export type GstRate = 0 \| 5 \| 12 \| 18 \| 28;`                               | `TaxLineInput.gstRate` (`types.ts:17`), `TaxLineOutput.gstRate` (`types.ts:45`), `SerializedTaxLine.gstRate` (`serialize.ts:13`); re-exported from the barrel `packages/tax/src/index.ts:10`                      | **Not reachable — erased at compile time.** It has no runtime existence. Its practical effect is that every caller holding a DB-derived number must widen with `as GstRate`; there are five such casts (see Q2), and each one discards the type's protection.                                                                                                                                     |
| 2   | `packages/tax/src/compute.ts:7`                                   | `const VALID_GST_RATES = [0, 5, 12, 18, 28];`                                   | `compute.ts:135` `VALID_GST_RATES.includes(line.gstRate)` inside `validateInput`, called unconditionally from `computeTax` (`compute.ts:26`)                                                                      | **Reachable.** This is the only runtime gate in the engine. Reached by six production `computeTax` call sites (enumerated in Q2).                                                                                                                                                                                                                                                                 |
| 3   | `packages/schemas/src/product.ts:4`                               | `export const GST_RATES = [0, 5, 12, 18, 28] as const;`                         | `productCoreSchema.gstRate` refine at `product.ts:19-24` → `createProductSchema` (`:39`), `updateProductSchema` (`:42`), `bulkImportProductsSchema` (`:60-62`)                                                    | **Reachable, and it is the gate that currently makes 3% unusable.** Wired into `createProduct` (`apps/web/lib/actions/products/create-product.ts:18`), `updateProduct` (`update-product.ts:21`) and the bulk CSV import (`apps/web/lib/actions/products/bulk-import.ts`). A POST of `gstRate: 3` from any of the three is rejected server-side with "GST rate must be one of 0/5/12/18/28".       |
| 4   | `packages/schemas/src/quotation.ts:42`                            | `gstRate: z.coerce.number().refine((n) => [0, 5, 12, 18, 28].includes(n), {…})` | `quotationLineInputSchema` → `createQuotationSchema`/update; **and** `piLineInputSchema = quotationLineInputSchema` (`packages/schemas/src/performa-invoice.ts:14`) → `updatePiSchema` (`performa-invoice.ts:46`) | **Reachable.** Hit by `createQuotation`, `updateQuotation` and `updatePi`. Note the builder sources the line's rate from the product master (`apps/web/app/(app)/quotations/_components/load-builder-data.ts:87`), so this constant only sees a 3 if a 3% product row already exists.                                                                                                             |
| 5   | `apps/workers/src/templates/quotation.tsx:46`                     | `const VALID_GST_RATES: GstRate[] = [0, 5, 12, 18, 28];`                        | `toGstRate()` (`quotation.tsx:49-56`), called at `quotation.tsx:207` inside `loadQuotationPdfData`                                                                                                                | **Reachable, and it is live production code — not a leftover of the Puppeteer era.** Determined by tracing, not by the `.tsx` extension: `apps/workers/src/jobs/render-pdf.ts:34` imports `loadQuotationPdfData` and calls it at `render-pdf.ts:84` on the Typst path. On a 3% line it throws a **plain `Error`**: `` `quotation template: unexpected GST rate "${raw}"` `` (`quotation.tsx:53`). |
| 6   | `apps/workers/src/templates/performa-invoice.tsx:35`              | `const VALID_GST_RATES: GstRate[] = [0, 5, 12, 18, 28];`                        | `toGstRate()` (`performa-invoice.tsx:37-41`), called at `:135` inside `loadPerformaInvoicePdfData`                                                                                                                | **Reachable**, same trace: `render-pdf.ts:33` imports it, `render-pdf.ts:86` calls it.                                                                                                                                                                                                                                                                                                            |
| 7   | `apps/web/app/(app)/catalog/new/new-product-form.tsx:125`         | `{[0, 5, 12, 18, 28].map((r) => (`                                              | `<option>` children of the "GST rate \*" `<select>` (`:119-131`) on route `apps/web/app/(app)/catalog/new/page.tsx`                                                                                               | **Reachable on every page load.** This is why an Admin cannot select 3% when creating a product.                                                                                                                                                                                                                                                                                                  |
| 8   | `apps/web/app/(app)/catalog/[id]/product-detail-sections.tsx:259` | `{[0, 5, 12, 18, 28].map((r) => (`                                              | `<option>` children of the "GST rate (%)" `<select>` (`:253-265`) in the product-detail pricing editor                                                                                                            | **Reachable on every page load.** Same effect on edit.                                                                                                                                                                                                                                                                                                                                            |

**None of the eight is dead code.** #1 is compile-time-only (a distinct thing from dead); #2–#8 all execute.

### The corrected count — F.55's "nine" is wrong, and wrong against its own list

`docs/stage-f-tasks.json:506` asserts: _"THE OMISSION IS NOT IN ONE PLACE BUT NINE, which is the complete enumeration of rate-list constants in the repo"_, then lists file:lines. **Its own list has eight members** — `packages/tax/src/types.ts:7`, `packages/tax/src/compute.ts:7`, `packages/schemas/src/product.ts:4`, `packages/schemas/src/quotation.ts:42`, `apps/workers/src/templates/quotation.tsx:46`, `apps/workers/src/templates/performa-invoice.tsx:35`, `new-product-form.tsx:125`, `product-detail-sections.tsx:259`. The word "nine" does not match the enumeration it introduces.

**My independent enumeration finds exactly those eight and no ninth constant of that kind.** The count is **eight**. Ruling 7 is the reason this was catchable: F.55 carried both a count and an enumeration, and the enumeration is the one that survived checking.

### Additional omitting-3 literals that F.55 did **not** count (not constants, but they will drift if left)

Human-readable strings, all of which will become false the moment the union is widened:

- `packages/tax/src/types.ts:16` — doc comment `/** GST rate as a percentage (0, 5, 12, 18 or 28). */`
- `packages/tax/src/compute.ts:138` — the thrown message `` `Line ${lineId}: gstRate ${…} not in {0,5,12,18,28}` ``
- `packages/schemas/src/product.ts:23` — Zod message `'GST rate must be one of 0/5/12/18/28'`
- `packages/schemas/src/quotation.ts:43` — Zod message `'GST rate must be 0, 5, 12, 18, or 28'`
- `apps/web/app/(app)/catalog/new/page.tsx:28` — UI help copy `"… GST rate: 0, 5, 12, 18, or 28."`

Test-local rate lists (also omitting 3, and one omits 0 as well):

- `packages/tax/tests/compute.test.ts:21` — helper parameter type `gstRate: 0 | 5 | 12 | 18 | 28`
- `packages/tax/tests/compute.test.ts:151` — test title `'all four GST rates (5, 12, 18, 28) in one quotation, intra-state'`
- `packages/schemas/src/product.test.ts:48` — test title `'rejects GST rate not in {0,5,12,18,28}'`
- `packages/schemas/src/product.test.ts:58-59` — `'accepts canonical GST rates 5, 12, 18, 28'` / `for (const rate of [5, 12, 18, 28])`
- `packages/db/tests/dealers.test.ts:153` — test title `'product check rejects GST rate of 10 (not in {0,5,12,18,28})'`
- `packages/db/tests/quotation.test.ts:152` — comment `// not in (0, 5, 12, 18, 28)`

Also note, as a factual matter rather than a rate-list: there is **no rate list at all** in the Typst templates. `Grep` for `rate|Rate|cgst|sgst|igst` over the full directory `apps/workers/src/templates-typst/` returns 11 hits, read in full; the only rate-bearing ones are `quotation.typ:78` (`str(l.gstRate) + "%"`), `:104` and `:106` (IGST/CGST/SGST captions from `data.fullRateLabel` / `data.halfRateLabel`). Those labels are computed at `apps/workers/src/pdf/view-model.ts:131-133` as `Number(rateLabel) / 2` and `${rateLabel}%`, which yields a correct `"1.5%"` / `"3%"` for a 3% document. The Typst layer is rate-agnostic and needs no change.

---

## 2. Where `packages/tax` throws on 3%, and whether production reaches it

### The throw

**Exactly one.** Established by `Grep` for `throw` over the directory `packages/tax/src` — 11 hits, read in full; ten are for `EMPTY_LINES`, `EMPTY_STATE`, `NEGATIVE_QUANTITY`, `NEGATIVE_UNIT_PRICE`, `NEGATIVE_DISCOUNT`, `DISCOUNT_PERCENT_OUT_OF_RANGE`, `DISCOUNT_EXCEEDS_SUBTOTAL`, and one is a doc comment.

- **`packages/tax/src/compute.ts:136-139`**, guarded by `compute.ts:135` `if (!VALID_GST_RATES.includes(line.gstRate))`.
- **Error code: `INVALID_GST_RATE`**, declared at `packages/tax/src/types.ts:83` in the `TaxErrorCode` union, carried on `TaxComputationError` (`types.ts:93-101`).
- Message: `` `Line ${line.lineId}: gstRate ${String(line.gstRate)} not in {0,5,12,18,28}` ``.

`packages/tax/src/types.ts:7` is not a throw; it is a compile-time rejection only.

### Is it reached by a production path? **Yes — by five of them, and one bypasses the Zod layer entirely.**

Complete enumeration of `computeTax(` call sites, from `Grep` `computeTax|serializeOutput|@dealerlink/tax` over the whole repo (excluding the worktree), result read in full:

| call site                                                                        | kind                                                                                                                                                             | Zod gate in front of it?                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/lib/actions/quotations/helpers.ts:172` (`computeTotalsForPersistence`) | Server Action helper — called from `create-quotation.ts:60` and `update-quotation.ts:61`                                                                         | **Yes.** Operates on `input.lines`, already through `quotationLineInputSchema` (constant #4).                                                                                                                                                                                                                  |
| `apps/web/lib/actions/pi/helpers.ts:55` (`computeDocumentTotals`) — call site A  | Server Action — `apps/web/lib/actions/pi/update-pi.ts:68`                                                                                                        | **Yes**, via `updatePiSchema`.                                                                                                                                                                                                                                                                                 |
| `apps/web/lib/actions/pi/helpers.ts:55` — call site B                            | Server Action — **`apps/web/lib/actions/pi/convert-quotation-to-pi.ts:86`**                                                                                      | **NO.** The lines come from `loadQuotationLines(tx, q.id)` at `convert-quotation-to-pi.ts:73`, which reads `quotation_lines` straight out of Postgres (`pi/helpers.ts:184-205`) and coerces with `Number(r.gstRate)` at `:201`. No Zod anywhere on that path. This is the clean production route to the throw. |
| `apps/web/lib/quotation/preview.ts:122` (`computeQuotationTotals`)               | **Browser**, from the quotation builder's summary card `apps/web/app/(app)/quotations/_components/summary-card.tsx:25-35`, inside a `useMemo` on every line edit | **NO.** Rates arrive from the product master via `load-builder-data.ts:87` and are widened with `toNum(l.gstRate) as GstRate` at `preview.ts:83`. A 3% line throws client-side.                                                                                                                                |
| `apps/workers/src/templates/quotation.tsx:199`                                   | **Worker PDF job**, via `loadQuotationPdfData` ← `render-pdf.ts:84`                                                                                              | **NO** — but `toGstRate` (constant #5) throws first, at `quotation.tsx:207`, with a plain `Error`, so `INVALID_GST_RATE` is never reached on this path.                                                                                                                                                        |
| `apps/workers/src/templates/performa-invoice.tsx:127`                            | **Worker PDF job**, via `loadPerformaInvoicePdfData` ← `render-pdf.ts:86`                                                                                        | **NO** — same, `toGstRate` at `performa-invoice.tsx:135` throws first.                                                                                                                                                                                                                                         |
| `packages/db/src/seeds/multi-rate.ts:193`                                        | seed script (`totalsFor`)                                                                                                                                        | n/a — seeds construct `GstRate` literals directly.                                                                                                                                                                                                                                                             |

Non-production `computeTax` callers, for completeness: `packages/tax/tests/compute.test.ts` (many) and `packages/db/tests/quotation-engine-parity.test.ts:70`.

**So the discriminating answer:** the `INVALID_GST_RATE` throw is **not** merely a backstop behind the constants in (1). Two production paths reach `computeTax` with a rate that no Zod schema has seen — `convert-quotation-to-pi.ts:86` and the browser preview — and two more (the PDF loaders) reach an equivalent unguarded throw one layer earlier.

What keeps this latent today is constant #3 (`packages/schemas/src/product.ts:4`): no application route can create a 3% product, so no 3% line can exist unless a row is inserted out-of-band (psql, a seed, a data import). The DB CHECK permits exactly that (Q3). The failure sequence for such a row is: product insert succeeds → product renders in the catalogue → quotation builder throws in the browser the moment the line is added → if a quotation were created anyway, convert-to-PI throws `VALIDATION` (`pi/helpers.ts:78` maps `TaxComputationError` → `AppError('VALIDATION')`) → PDF render throws.

**One measurement-worthy detail about the guard itself**, confirmed by reading `compute.ts:135`: it is `includes()` on a **number** array with no adjacent `Number()`. Handing it the raw driver string `'18.00'` throws too. No traced call path does that — all five `as GstRate` widening sites (`quotations/helpers.ts:179`, `pi/helpers.ts:62`, `preview.ts:83`, plus `toGstRate` in the two worker loaders) coerce with `Number()` first — so it is a fail-loud backstop rather than a live defect. It is worth recording because that property is a precondition of the guard working at all, and widening the union does not change it.

---

## 3. What each CHECK constraint actually permits

### Enumeration of rate columns

`Grep` for `[Rr]ate` over the directory `packages/db/src/schema` returned 33 hits, read in full. Exactly **four** columns in the entire schema store a GST rate:

- `packages/db/src/schema/product.ts:38` — `gstRate: decimal({ precision: 5, scale: 2 }).notNull()`
- `packages/db/src/schema/quotation.ts:157` — same
- `packages/db/src/schema/performa-invoice.ts:162` — same
- `packages/db/src/schema/order.ts:155` — same

The other `rate` hits are `rate_limit` (unrelated table) and `generated_*` false positives. There is **no** TDS rate column anywhere: `Grep` `tds|Tds|TDS` over `packages/db/src/schema` returned **no matches**, so CLAUDE.md §5's "TDS on Purchase: optional deduction at order level" has no schema behind it. (Out of F.55's scope; noted because the question asked for tables with a rate column.)

### Per table and column

| table                    | column                             | constraint name                       | permitted set              | declared at                                                                                          |
| ------------------------ | ---------------------------------- | ------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `products`               | `gst_rate` `numeric(5,2) NOT NULL` | `products_gst_rate_chk`               | `IN (0, 3, 5, 12, 18, 28)` | `packages/db/src/schema/product.ts:72`; migration `packages/db/migrations/0017_friendly_logan.sql:5` |
| `quotation_lines`        | `gst_rate` `numeric(5,2) NOT NULL` | `quotation_lines_gst_rate_chk`        | `IN (0, 3, 5, 12, 18, 28)` | `packages/db/src/schema/quotation.ts:171`; `0017_friendly_logan.sql:6`                               |
| `performa_invoice_lines` | `gst_rate` `numeric(5,2) NOT NULL` | `performa_invoice_lines_gst_rate_chk` | `IN (0, 3, 5, 12, 18, 28)` | `packages/db/src/schema/performa-invoice.ts:175`; `0017_friendly_logan.sql:7`                        |
| `order_lines`            | `gst_rate` `numeric(5,2) NOT NULL` | `order_lines_gst_rate_chk`            | `IN (0, 3, 5, 12, 18, 28)` | `packages/db/src/schema/order.ts:172`; `0017_friendly_logan.sql:8`                                   |

**No disagreement between constraints.** All four permit the identical six-member set. **No table with a rate column lacks a constraint** — all four columns are covered.

**The background claim is confirmed:** the CHECK constraints do read `IN (0, 3, 5, 12, 18, 28)`.

### Migration history (the reason the mismatch exists)

Migration `0017_friendly_logan.sql` (8 lines, read in full) drops all four constraints and re-adds them widened. The narrower `(0, 5, 12, 18, 28)` form was created at `0004_huge_king_cobra.sql:73` (products), `0007_keen_odin.sql:23` (quotation_lines), and `0009_perfect_krista_starr.sql:24, :102` (PI lines, order lines).

`packages/db/migrations/meta/_journal.json` (read in full, 17 entries) confirms `0017_friendly_logan` is `idx: 17`, the newest entry, so the widened form is what a migrated database has. `packages/db/migrations/meta/0017_snapshot.json:2381, 3946, 4727, 5495` carry the same widened predicate; every earlier snapshot 0004–0016 carries the narrow one.

**So the DB was widened to include 3 and the code was not.** That is the mismatch, and it is a code-side gap, not a schema-side one.

---

## 4. Protected versus unprotected split

`packages/tax` is a protected surface under CLAUDE.md §10.1 ("Anything touching money columns, `packages/tax`, RLS policies, or the `FOR UPDATE` locking…") and `docs/STAGE_F_BUILD_v3.md` §9. The split of the eight:

**Inside `packages/tax` — protected, needs operator sign-off (2 of 8):**

1. `packages/tax/src/types.ts:7` — the `GstRate` union
2. `packages/tax/src/compute.ts:7` — `VALID_GST_RATES`

Plus, if the messages are corrected in the same change, `packages/tax/src/types.ts:16` (doc comment) and `packages/tax/src/compute.ts:138` (thrown message) are also inside the protected boundary. And `packages/tax/tests/compute.test.ts:21` (the helper's type union) is inside `packages/tax/` too, though it is a test.

**Outside `packages/tax` — unprotected (6 of 8):**

3. `packages/schemas/src/product.ts:4`
4. `packages/schemas/src/quotation.ts:42`
5. `apps/workers/src/templates/quotation.tsx:46`
6. `apps/workers/src/templates/performa-invoice.tsx:35`
7. `apps/web/app/(app)/catalog/new/new-product-form.tsx:125`
8. `apps/web/app/(app)/catalog/[id]/product-detail-sections.tsx:259`

Two further observations that bear on the sign-off question, stated as facts rather than as a recommendation:

- The six unprotected constants are not independent of the two protected ones. Constants #5 and #6 are typed `GstRate[]`, so widening them without widening `types.ts:7` is a type error; and constants #3/#4/#7/#8 feed values that end up cast `as GstRate`. A change to any of the six that is not paired with the union change either fails to compile or produces data the engine then rejects.
- `DEVIATIONS.md:5750-5798` records an operator ruling from 2026-09-17 distinguishing **use** of `computeTax` from **modification** of it (importing it into `multi-rate.ts` was approved as use). That distinction does not help here: widening the union and widening `VALID_GST_RATES` are modifications of the protected package.

---

## 5. Surfaces a 3% value must traverse, and what is tested today

Stated as coverage facts. No test design, no plan.

| #   | surface / path                                           | code entry point                                                                            | test today                                                                                                                                                                                                                            | what it covers                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Product create — Zod**                                 | `packages/schemas/src/product.ts:19-24`                                                     | `packages/schemas/src/product.test.ts:48-68`                                                                                                                                                                                          | Rejects 10 (`:48-56`); accepts a loop over `[5, 12, 18, 28]` (`:58-68`). **Does not test 0, does not test 3.**                                                                                                                                                                         |
| 2   | **Product create — Server Action**                       | `apps/web/lib/actions/products/create-product.ts:16` (`tenantAction(['admin'], …)`)         | **None.** Established by `Glob` `**/*.{test,spec}.{ts,tsx}` over the repo; the only `apps/web/lib/actions` test is `apps/web/lib/actions/wrap.test.ts`, which tests the wrapper, not any product action.                              | —                                                                                                                                                                                                                                                                                      |
| 3   | **Product create/edit — UI select**                      | `new-product-form.tsx:119-131`, `product-detail-sections.tsx:253-265`                       | `apps/web/tests/e2e/critical-path.spec.ts:166` — `selectOption({ label: '18%' })`                                                                                                                                                     | Exercises **18% only**, through a label that exists only because `18` is in the array.                                                                                                                                                                                                 |
| 4   | **Product read**                                         | `apps/web/lib/queries/products.ts:14, 63, 116`                                              | none rate-specific                                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                      |
| 5   | **DB CHECK — products**                                  | `products_gst_rate_chk`                                                                     | `packages/db/tests/dealers.test.ts:153-175`                                                                                                                                                                                           | Asserts **rejection of 10**. Does not assert acceptance of 3.                                                                                                                                                                                                                          |
| 6   | **DB CHECK — quotation_lines**                           | `quotation_lines_gst_rate_chk`                                                              | `packages/db/tests/quotation.test.ts:134-156`                                                                                                                                                                                         | Asserts rejection of `'9.00'`. Does not assert acceptance of 3.                                                                                                                                                                                                                        |
| 7   | **DB CHECK — PI lines / order lines**                    | `performa_invoice_lines_gst_rate_chk`, `order_lines_gst_rate_chk`                           | **None.** Established by `Glob` `packages/**/tests/**/*.test.ts` (15 files, all read by name) plus the full `gstRate\|gst_rate` grep over `packages` — the only CHECK-rejection tests are the two above.                              | —                                                                                                                                                                                                                                                                                      |
| 8   | **Quotation create — Zod line schema**                   | `packages/schemas/src/quotation.ts:42`                                                      | **None.** `packages/schemas/src/` contains `dealer.test.ts`, `product.test.ts`, `reserved-slugs.test.ts`, `states.test.ts` (full `Glob` of `packages/schemas/src/*`, 17 files read). There is no `quotation.test.ts` in that package. | —                                                                                                                                                                                                                                                                                      |
| 9   | **Tax engine**                                           | `packages/tax/src/compute.ts:24`                                                            | `packages/tax/tests/compute.test.ts`                                                                                                                                                                                                  | Computes at **0, 5, 12, 18, 28** (`:55, :62, :69, :35, :151-168`); asserts `INVALID_GST_RATE` for **10** (`:324`) and **100** (`:328`). **No 3 anywhere.**                                                                                                                             |
| 10  | **Client preview / builder summary**                     | `apps/web/lib/quotation/preview.ts:72`, consumed at `summary-card.tsx:25`                   | `apps/web/lib/quotation/preview.test.ts`                                                                                                                                                                                              | Uses rates **18, 12, 0** only (`:11, :45, :100`). No 3.                                                                                                                                                                                                                                |
| 11  | **Quotation → PI conversion (the unguarded path)**       | `apps/web/lib/actions/pi/convert-quotation-to-pi.ts:73, 86`                                 | **None at the action level.** Same `Glob` basis as row 2.                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                      |
| 12  | **PI → Order (copies `gstRate` verbatim, no recompute)** | `apps/web/lib/actions/pi/status-transitions.ts:171-195` — `gstRate: l.gstRate` at `:189`    | `packages/db/tests/orders.test.ts` uses `'18.00'` throughout (`:120, :175, :350, :397`)                                                                                                                                               | 18% only                                                                                                                                                                                                                                                                               |
| 13  | **PDF loader coercion**                                  | `toGstRate` at `quotation.tsx:49`, `performa-invoice.tsx:37`                                | `apps/workers/tests/quotation-template.test.ts:25` (`gstRate: 18`), `:69` (`gstRateLabel: '18'`)                                                                                                                                      | 18% only, and via a hand-built fixture, not a DB row                                                                                                                                                                                                                                   |
| 14  | **PDF render (Typst) — byte + text snapshots**           | `apps/workers/tests/pdf-snapshots.test.ts`, matrix `apps/workers/scripts/typst-matrix.json` | 14 cases, file read in full                                                                                                                                                                                                           | 4 quotations, 2 PIs, 1 receipt, 3 dispatches, 4 branded. All reference pre-F.81 document numbers (`QT-2026-0001/0006/0010`, `PI-2026-0001/0002`). **The matrix contains no multi-rate document and therefore no 3% document.**                                                         |
| 15  | **Typst rate labels (`halfRateLabel` = rate ÷ 2)**       | `apps/workers/src/pdf/view-model.ts:131-133`                                                | none directly; only via row 14's snapshots                                                                                                                                                                                            | For a single-rate 18% doc                                                                                                                                                                                                                                                              |
| 16  | **GST Summary report**                                   | `apps/web/lib/reports/gst-summary.ts:58`                                                    | `apps/web/lib/reports/reports.test.ts`                                                                                                                                                                                                | **Rate-agnostic by construction** — the SQL at `gst-summary.ts:75-89` groups by `place_of_supply` and sums stored `cgst/sgst/igst_amount`; it never touches `gst_rate` and explicitly must not call `@dealerlink/tax` (`:8-12`). **This surface needs no 3% change and no 3% test.**   |
| 17  | **Seed corpus shape**                                    | `packages/db/src/seeds/multi-rate.ts`                                                       | `packages/db/tests/multi-rate-corpus.test.ts` (read in full, 7 tests)                                                                                                                                                                 | Asserts the catalogue contains `'5.00'`, `'12.00'`, `'18.00'` (`:87-89`); a ≥2-rate + ≥2-HSN quotation; a 3-rate non-ascending quotation; a 2-line-at-5% intra-state quotation; a multi-rate PI; a mixed-rate order in a supply status; one HSN spanning two rates. **Nothing at 3%.** |
| 18  | **Engine ≡ stored totals parity**                        | `packages/db/tests/quotation-engine-parity.test.ts:70`                                      | re-runs `computeTax` over every seeded `QT-%` quotation                                                                                                                                                                               | Would begin covering 3% automatically the moment a 3% quotation exists in the seed — but only for quotations, and only for the seven header money columns.                                                                                                                             |

### Affirmative confirmation that 3% appears nowhere as data

`Grep` for `gstRate: 3\b|gstRate: '3|'3\.00'|"3\.00"|gst_rate = 3|rate of 3` across `/workspace` excluding `node_modules`, full result read: **four hits, all prose in documents** — `DEVIATIONS.md:5606`, `docs/F3_F4_AUDIT.md:468`, and the two worktree copies of those same lines. **No test, no seed, no fixture, no SQL file in the repository contains a 3% rate.** This is an enumeration over the complete match set, not an empty search.

### Does F.84's blocked fixture cover that surface set?

F.84's row (`docs/stage-f-tasks.json:761-767`, read in full) states its scope as: _"one product at 3% with its own HSN, and at least one document carrying it, following whatever module placement F.81 established."_ It is marked `HARD-BLOCKED ON F.55`.

Reading that scope against the table above:

**What F.84 as scoped would reach:**

- Row 5 (products CHECK accepts 3 — demonstrated by the insert succeeding).
- Row 9 — the engine, via row 18's parity test, if the 3% document is a `QT-%` quotation and the seed computes totals with `computeTax` as `multi-rate.ts:193` does.
- Row 6 and, if the chain extends, rows 7 and 12 (PI/order lines at 3%), following F.81's quotation→PI→order chain pattern (`multi-rate.ts:387` `buildChain`).
- Row 17 — a corpus-shape assertion would be the natural home for it.

**What F.84 as scoped would NOT reach:**

- **Row 14, the PDF snapshots.** A seeded 3% document does not enter `apps/workers/scripts/typst-matrix.json` by existing; the matrix is a hand-maintained list of 14 labelled cases. F.81's own multi-rate documents are already absent from it. So the rendering path — which is where the two `toGstRate` throws (#5, #6) live — stays unexercised unless the matrix is extended, and F.84's notes do not mention the matrix.
- **Rows 1, 8, 10 — the three Zod/preview constants.** A seed inserts directly through Drizzle and bypasses `productCoreSchema` and `quotationLineInputSchema` entirely. Nothing in a seed proves those refinements accept 3.
- **Rows 2, 3, 11 — the Server Actions and the `<select>`s.** F.84 seeds data; it does not drive `createProduct`, the catalogue form, or `convertQuotationToPi`. The `<select>` arrays (#7, #8) in particular can be widened or not widened without any seed noticing.
- **Rows 13, 15** — only reachable through row 14.

**So: more than F.84 is needed**, and specifically in the two places where the unguarded throws are. F.84's own stated rationale — _"widening a type without a fixture that exercises it leaves the change unverified"_ — is sound, but the fixture it describes exercises the **data** layers and not the **render** or **request** layers.

**One further fact F.84 gets right and that is confirmed here:** its rounding note. 3% intra-state splits to CGST/SGST at 1.5% each (`packages/tax/src/compute.ts:69` `rate.dividedBy(2)`), and 1.5% of an integer subtotal is off 2dp for half of integers. `packages/db/src/seeds/multi-rate.ts:328-337` records the identical property for 5% (CGST 2.5%) and states the measured consequence on its own Chain A document: "CGST 10073.01 per-line against 10073.00 document-level". So a 3% fixture inherits a real, already-observed rounding behaviour rather than a hypothetical one.

---

## 6. What I could not determine

Five items, none of which change the findings above but each of which is a genuine limit of this audit:

1. **I could not execute anything.** I have no `Bash`. Every claim about runtime behaviour in Q2 — that `computeTax` throws `INVALID_GST_RATE` on 3, that `toGstRate` throws first on the PDF path, that the browser preview throws in a `useMemo` — is derived by reading the code and tracing imports, **not** by running it. `docs/stage-f-tasks.json:506` and `DEVIATIONS.md:5606` report an actual 2026-09-17 execution producing `THREW TaxComputationError code=INVALID_GST_RATE: Line L1: gstRate 3 not in {0,5,12,18,28}`, which agrees with my reading; I record that as a doc claim that corroborates, not as my evidence.

2. **I could not verify the live database state.** Q3 reports what the migrations and schema files declare. Whether the deployed staging/production databases have actually had `0017_friendly_logan` applied is not determinable from the repository. `_journal.json` records intent, not application. The same limit applies to the claim (in F.55's notes) that inserting `'3'` on a live Postgres 16.15 stores and returns `3.00`.

3. **I could not confirm the exact HEAD commit by running git.** The commit `c4b8a77` and branch `f81-spec` come from the session's git-status snapshot supplied at conversation start, which the snapshot itself warns "will not update during the conversation". If commits landed after that snapshot, line numbers in this report could have shifted.

4. **I did not determine whether the React/HTML half of `apps/workers/src/templates/*.tsx` is still consumed for any purpose.** I established what mattered — that the _loader_ functions in those files are live on the Typst path (`render-pdf.ts:33-34, 84-86`) and therefore that constants #5 and #6 execute. But `renderQuotationHtml` (`quotation.tsx:137`) is still called from inside the loader at `quotation.tsx:339` and from `performa-invoice.tsx:249`, and is still tested by `apps/workers/tests/quotation-template.test.ts`. Whether that HTML is consumed by anything downstream of the loader, or is vestigial work the Typst path discards, I did not trace. It does not affect the 3% question either way, because `toGstRate` runs before the HTML is built.

5. **I could not determine whether any non-repository consumer holds a copy of the rate list** — for example an external GSTR-1 export mapping, a client-side bundle pinned in `apps/web/.next/` (which `Grep` did surface as build output and which I did not treat as source), or an operator runbook. The enumeration in Q1 is complete over the repository's source; it is not a claim about the world outside it.

**An additional caveat rather than an unknown.** My Q1 count of eight is complete with respect to three independent search formulations over the full repo. The residual risk is a rate list that (a) omits 3, (b) does not place `18` within eight characters of `28`, (c) does not place `5`, `12`, `18` within 20 punctuation characters of one another, **and** (d) sits in a file where no identifier matching `GST_RATES|GstRate|gstRate|gst_rate` appears. I judge that combination unlikely but I cannot exclude it by enumeration, and I would rather name it than imply a completeness I did not establish.

---

## Cross-check against the documents (disclosure)

| doc claim                                                            | where                                                 | agrees with code?                                                                                                                                                                       |
| -------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GstRate` union omits 3                                              | `packages/tax/src/types.ts:7`; restated in task notes | **Yes**, verified directly.                                                                                                                                                             |
| CHECK constraints read `IN (0, 3, 5, 12, 18, 28)`                    | task notes; CLAUDE.md §5                              | **Yes**, verified in schema and migration 0017.                                                                                                                                         |
| CLAUDE.md §5 lists allowed rates as `0, 3, 5, 12, 18, 28`            | `CLAUDE.md:275`                                       | **Yes** — and it is the DB, not the code, that matches the spec.                                                                                                                        |
| "The omission is not in one place but **nine**"                      | `docs/stage-f-tasks.json:506`                         | **No — the count is eight**, and F.55's own enumeration lists eight. Corrected in Q1.                                                                                                   |
| Doc comment at `types.ts:4-6` cites "CLAUDE.md §6" for the rate list | `packages/tax/src/types.ts:4`                         | **Confirmed wrong** — rates are in CLAUDE.md §5 (`CLAUDE.md:275`). The same §6 miscitation also appears at `packages/tax/src/compute.ts:10` and `apps/web/lib/quotation/preview.ts:21`. |
| F.84 is hard-blocked on F.55                                         | `docs/stage-f-tasks.json:767`                         | Consistent with the code: a 3% seed row today is insertable (CHECK permits) and then un-renderable (`toGstRate` throws).                                                                |

I reached the eight-member enumeration and the reachability findings from the code before opening F.55's or F.84's notes; the notes were read afterwards, as the invocation directed, and are reported here as claims checked rather than as sources.
