# F.4 — Multi-rate tax summary on the PDF, plus the HSN/SAC table

> **STATUS: APPROVED — operator 2026-09-24. Run it.** All ten questions are settled
> as **D-1 to D-10** at the end. **D-10 overrules the drafter's recommendation on the
> reason, not the conclusion**, and **D-5 ratifies a replacement for a standing rule**
> that does not hold on this day.

---

## READ THIS FIRST — ON THIS DAY AN EMPTY BYTE DIFF IS A FAILED MEASUREMENT

Every previous rendering day verified that **nothing moved**. This day is the first
where reference PDFs are **expected** to move, and the instrument that measures them
has a fork in it. Both facts have to be held at once or the day reports success it
did not earn.

**`apps/workers/scripts/render-typst.ts` does NOT use `buildViewModel`.** It is a
full fork of `apps/workers/src/pdf/view-model.ts`: its own `MONEY_KEYS` (`:62`), its
own `DATE_KEYS`, its own `toViewModel` (`:90-110`), its own `templateFor`
(`:119-128`), its own rate-label derivation (`:236-238`). Production
(`src/jobs/render-pdf.ts:106`), the snapshot test (`tests/pdf-snapshots.test.ts:87`)
and `scripts/determinism-check.ts:66` all use `buildViewModel`. That script is the
harness the pre/post byte diff runs through.

**The consequence, stated so it cannot be missed:** if F.4 adds fields in
`buildViewModel` only, `render-typst.ts` writes the OLD `data.json`, the byte diff
comes back **empty**, and the day reports "no reference moved" **while the production
path moved**. That is a false negative in the day's primary instrument — DEV.138's
signature exactly, a passing negative result that was never capable of failing.

**Therefore, on this day:**

- Everything F.4 adds goes into **both** files.
- The byte diff must be **empty on the 6 tax-neutral references and dirty on all 8
  tax-bearing ones**. An empty diff across all 14 is a **FAILED MEASUREMENT**, not a
  pass. Say it in those words in the day's own notes.

The fork itself is **F.108**, filed 2026-09-24. This day works around it; it does not
fix it.

---

## WHY THIS DAY IS PRIORITISED — a shipped defect, stronger than the HSN table

**A mixed-rate quotation or PI today prints `CGST `, `SGST `, `IGST ` — trailing
space, no rate at all — with correct amounts.** Verified in code, not inferred:

- `apps/workers/src/templates/quotation.tsx:234` —
  `const gstRateLabel = distinctRates.length === 1 ? String(distinctRates[0]) : null;`
  so a document with two rates yields `null`.
- `apps/workers/src/pdf/view-model.ts:132-133` — `rateLabel != null ? … : ''`, so
  `null` becomes the **empty string**.
- `apps/workers/src/templates-typst/quotation.typ:106` —
  `("CGST " + data.halfRateLabel, …), ("SGST " + data.halfRateLabel, …)` on the
  intra-state branch, so both labels render as `CGST ` / `SGST ` and nothing else;
  `:104` is the inter-state branch and does the same with
  `"IGST " + data.fullRateLabel`.
- The same defect exists identically in the fork at
  `apps/workers/scripts/render-typst.ts:237-238`.

This is the strongest justification for F.4's position, and it is **stronger than the
HSN table**: a customer reconciling a mixed-rate document cannot tell what rate they
were charged. **Fix it in BOTH `buildViewModel` and the `render-typst.ts` fork**
(A.1), as its own step, before anything else.

---

**Goal.** Render one tax row per distinct GST rate actually present on the quotation
and PI PDFs; add an HSN/SAC summary table keyed on the **(HSN, rate) pair**; and fix
the empty rate label. Round-off is F.6. The tax invoice is F.6. The screens shipped
in F.3.

### Primary deliverables

1. The rate-label fix, in both `view-model.ts` and `render-typst.ts` (A.1).
2. A rate-wise tax block in `templates-typst/quotation.typ`, replacing the
   single-rate pair at `:103-107`.
3. An HSN/SAC summary table with a TOTAL row, one row per distinct (HSN, rate) pair,
   following the totals block, on **quotation and PI** (D-2).
4. The first **Typst** golden file: a mixed-rate snapshot. It is a regression freeze
   against this repo's own renderer and is **NOT** a member of the Chromium
   cross-renderer contract in `docs/pdf-references/`.
5. `apps/workers/tests/pdf-snapshots.test.ts` amended to a reference-plus-named-delta
   contract, with the 6 tax-neutral cases still byte-frozen.

### Read before starting

- `docs/F3_F4_SPEC.md` §6 (`:269-297`), §2 + its dated correction (`:60-121`), §8
  (`:314-326`).
- `docs/F3_F4_AUDIT.md` §1.3 (the rate-label defect), §6.
- `docs/F3_DAY_PROMPT.md` — A.0's baseline recipe and the three-measurements block.
- `docs/F105_AUDIT.md:290-339` — what the seed data now looks like.
- `CLAUDE.md` §5, §8 decision 6, §10.1, §11.1 rulings 1, 3, 4, 5, 7, 8, §11.2.
- `docs/pdf-references/README.md` — in particular `:7-9`, the one-way door.

---

## Premise check — the three things that changed, reconciled against the code

**1. `byHsn` is keyed on the (HSN, rate) PAIR. CONFIRMED, and §6 is not stale on it.**
`packages/tax/src/summary.ts:64-77` states the pair is the key and cites Chain B;
`:78-94` gives the type with a non-null `rate`; `:155-183` builds the map on
`` `${hsn}|${rate}` ``; `:185-187` sorts HSN ascending then rate within an HSN.
`docs/F3_F4_SPEC.md:79-107` carries the dated correction.

**What IS stale is §2's own illustrative table at `:111-115`** — two rows, no `Rate`
column, a 7-column header — while `:119` in the same section says "A `Rate` column is
therefore part of the table's identity, not decoration". The table and the prose
disagree. **D-1 settles it.**

**2. `summariseDocument`'s `hsnRows` is NOT the shape F.4 needs, and the premise on
which F.3 kept it was false. THE ERROR IS THE OPERATOR'S, recorded here so it is not
re-derived as a mystery.** `apps/web/lib/tax/document-summary.ts:55-65` says the field
is kept because "F.4 is the next task and needs exactly this shape from exactly this
call". Two independent reasons that cannot be true:

- **It is unreachable from the PDF path.** `apps/workers/package.json` declares
  `@dealerlink/db`, `@dealerlink/schemas` and `@dealerlink/tax` and **no dependency on
  `apps/web`**. A workers module cannot import that file. This is structural and was
  true when the premise was written.
- **The money strings are the wrong format.** That adapter emits `toFixed(2)`
  (`:129-136`) — `"13671.00"`. Every money value on a PDF goes through `formatMoney`
  (`apps/workers/src/lib/format.ts:9-17`) — `"13,671.00"`. The adapter's own docstring
  says so at `:33`.

**The correct reuse is `computeTaxSummary` from `@dealerlink/tax` directly**, exported
at `packages/tax/src/index.ts:22-32`; workers already calls `computeTax` from the same
barrel (`templates/quotation.tsx:186-208`). **D-8** settles what happens to the dead
field.

**3. F.103's seed fix does not reach any of the 14 reference documents.**
`docs/F105_AUDIT.md:313-328` enumerates it: no orders among the 14; both reference PIs
clean on both columns for both tenants; quotations clean; dispatch notes and receipts
carry no `place_of_supply`. So "documents F.4 renders differ from what the spec
assumed" is **true of the corpus and false of the reference set**. Which reference
exercises which path is unchanged:

| Path                           | Reference cases (`scripts/typst-matrix.json`, 14 entries read in full)                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IGST (inter-state)**         | `quotation__QT-2026-0006__inter__3line`, `quotation__QT-2026-0001__inter-sample-tenant__1line`, `performa_invoice__PI-2026-0002__inter__1line`                                                                  |
| **CGST+SGST (intra-state)**    | `quotation__QT-2026-0001__intra__1line`, `quotation__QT-2026-0010__intra__2line`, `performa_invoice__PI-2026-0001__intra__2line`, `BRANDED__quotation__QT-2026-0001`, `BRANDED__performa_invoice__PI-2026-0001` |
| **Tax-neutral (no GST block)** | 3 × `dispatch__*`, `payment_receipt__PAY-2026-0007__verified`, `BRANDED__dispatch__DSP-2026-0005`, `BRANDED__payment_receipt__PAY-2026-0007` — **6 cases**                                                      |

**All 8 tax-bearing references are single-rate.** That is structural:
`packages/db/src/seeds/multi-rate.ts:12-27` places F.81's chains after `day13` and
before `pin-created-at` precisely so "nothing that already exists can pick up these
products", and `:722-737` names every pinned document number the ordering protects. So
the mixed-rate path has **no** reference case — which is why this day creates the first
Typst golden file (D-6).

**There is no order template.** `templates-typst/` contains 5 files: `_lib/chrome.typ`,
`dispatch-note.typ`, `payment-receipt.typ`, `performa-invoice.typ`, `quotation.typ`.
The 34 orders F.103 corrected are not rendered by anything this day touches.

---

## Corrections to the spec and the row — established, not to be re-derived

**C-1 — §6's "apply to quotation, PI and dispatch note" is WRONG about the dispatch
note.** `templates-typst/dispatch-note.typ:3` declares "Tax-neutral: no GST
breakdown"; the file has no `totals-block` call and no CGST/SGST/IGST anywhere.
`docs/F3_F4_AUDIT.md:88-94` lists it under "Not tax-summary sites", corroborated by
`tests/payment-receipt-template.test.ts:80-84`. **The code wins: out of scope.**

**C-2 — F.4's row says "prints the tax type on all three document types". There are
two, through one template.** `templates-typst/performa-invoice.typ:14-15,22` imports
`quotation-body` from `quotation.typ` and calls it verbatim, so quotation and PI share
**one** site.

**C-3 — §6's "amount in words reflects the grand total across all groups" is ALREADY
TRUE.** `templates/quotation.tsx:307` is `amountInWords(tax.totalAmount)`, and
`compute.ts:101` derives `totalAmount` from the document taxable plus summed per-line
taxes. Grouping changes none of it. **Record it as satisfied; do not "implement" it.**

**C-4 — §8's two sentences cannot both hold.** `:325-326`: "No number that appears on
any existing document may change. A single-rate document must render byte-identically
before and after." Adding an HSN table changes a single-rate document's bytes by
construction. **The first sentence is satisfiable and is kept. The second is not, and
the replacement rule below takes its place. Do not attempt to satisfy both** — that is
the DEV.129 shape, a criterion written to enforce discipline that no commit can meet.

---

## The two constraints, verified

**Build site `templates-typst/quotation.typ:97-110` — CONFIRMED.** `totals-block(`
opens at `:97`; `words:` `:98`; the `rows:` tuple spans `:99-108`; Subtotal `:100`;
the conditional Discount pair `:101`; Taxable Amount `:102`; the inter/intra branch
`:103-107`; `grand:` `:109`; close `:110`. `footer-block(...)` follows at `:112`.

**`totals-block()` is caller-driven — CONFIRMED for the rate rows, and SILENT on the
HSN table, which is the larger half of the day.**

- Rate rows: `_lib/chrome.typ:347` is
  `#let totals-block(words: "", rows: (), grand: "")` and `:363-366` is
  `..rows.map(r => (text(…r.at(0)), text(…r.at(1))))`. Any number of label/value pairs
  renders with **no `chrome.typ` edit**.
- HSN table: `chrome.typ:111-143` is
  `data-table(columns:, aligns:, header:, rows:, total-cells:)`, also caller-driven,
  with a TOTAL row and a 2px rule above it. **Probably composable at the call site.**
  Three things to check rather than assume: (a) its header band is dark (`fill: ink`)
  with white caps text and zebra striping — a lighter treatment IS a `chrome.typ`
  change; (b) it has no label above it, and `caps-label` composes at the call site;
  (c) column widths are explicit `px()` and the page is A4 at 18mm margins, so an
  8-column money table may not fit. **Only rendering settles (c).**
- **`chrome.typ` is imported by all four templates**, so an edit there can move the 6
  files R1 freezes. **If the day finds it needs a `chrome.typ` edit, STOP AND ASK** —
  it converts a two-template change into a four-template one.

**Round-off's insertion point between `:107` and `:108` — the boundary is confirmed
correct today and WILL MOVE.** `:107` closes the inter/intra conditional; `:108` closes
`rows:`. Emitting one pair per rate group grows that tuple, so the literal line numbers
shift. **"Viable" concretely requires all four of:**

1. `chrome.typ:347`'s signature unchanged, so appending one more pair to `rows:` works.
2. The rate rows stay **inside** `rows:`, not hoisted into a separate block — otherwise
   `("Round Off", …)` lands above the tax rows instead of below.
3. The round-off slot remains the **last** element of `rows:`, immediately before
   `grand:`: Subtotal → Discount → Taxable → rate rows → **Round Off** → Grand Total,
   reachable by appending exactly one pair.
4. **`chrome.typ:337-346`'s ROUND-OFF INSERTION POINT comment is updated in the same
   commit** to name the new anchor. `docs/F3_F4_AUDIT.md:737` and F.6's row both cite
   the literal `:107`/`:108`. **Name the anchor, not the numbers** (§11.1 ruling 6:
   correct a citation during a change, never port it verbatim).

---

## THE REPLACEMENT RULE — how an intended move is told from an unintended one

Two facts set the frame, both established by reading:

- **`tests/pdf-snapshots.test.ts:147` is `expect(rendered.body).toBe(reference.body)`**,
  applied to all 14 by `it.each` at `:124`, with `rendered.pages` at `:131` and
  `rendered.footer` at `:134`. Adding an HSN table makes `:147` fail on the 8
  tax-bearing cases. **This test must change. That is not a finding.**
- **The references cannot be re-baselined.** `docs/pdf-references/README.md:7-9`: "This
  is a one-way door… They cannot be regenerated." The capture tool is gone:
  `apps/workers/scripts/` contains 9 files and no `capture-references.ts` (directory
  listed in full, not searched).

So re-baselining is **unavailable**, not merely undesirable.

### R1 — Partition the 14, and name both sets in code

**MUST NOT MOVE — 6 tax-neutral, byte-frozen:** `dispatch__DSP-2026-0005__in_transit__8line`,
`dispatch__DSP-REF-0026__26serials`, `dispatch__DSP-REF-0500__500serials`,
`payment_receipt__PAY-2026-0007__verified`, `BRANDED__dispatch__DSP-2026-0005`,
`BRANDED__payment_receipt__PAY-2026-0007`.

**MAY MOVE — the 8 tax-bearing cases**, and only as R2 permits.

Verified by: the pre/post `sha256sum` diff restricted to those six filenames must be
**empty**, and the same diff restricted to the eight must be **non-empty on all eight**.

### R2 — On each of the 8, the delta is exactly the added table and nothing else

Replace `:147`'s `toBe` for the 8 with a **named-insertion** assertion:

- the expected segment occurs **exactly once** in `rendered.body`;
- `rendered.body` with that one occurrence removed is **exactly equal** to
  `reference.body`;
- `rendered.footer === reference.footer` and `rendered.pages === reference.pages` stay
  as exact equality, unchanged.

The segment is derived from the document's own summary, so the test **names what was
added** rather than tolerating whatever appears. Every other property of the pre-F.4
contract survives: every existing number, label and date, the footer, the page count. A
moved amount, a dropped line, a re-formatted figure or a changed label all still fail.

**A violation is:** the removal-equality failing on any of the 8; the segment occurring
zero or twice; the footer or page count changing; or any of the 6 moving a byte.

> **Any of those stops the day** and goes to the operator as a finding. It is
> specifically **not** a signal to widen the segment until it passes — **widening the
> segment is how this rule degrades into "re-baseline with extra steps."**

### R3 — The totals block must come out byte-identical on a single-rate document

All 8 references are single-rate 18%. Today the intra branch prints
`"CGST " + halfRateLabel`, where `view-model.ts:132` gives `"9%"`. A rate-wise block
emitting one pair per group at `rate / 2` yields the same `"9%"`. The amounts come from
the same source: `templates/quotation.tsx:302-304` assigns from the engine output and
`summary.ts:290-308`'s `totalsFrom` reads the same fields, formatted by the same
`formatMoney`.

**So R2's segment should be the HSN table ALONE. Prove that as its own assertion before
defining the segment.** If the totals block moves at all on a single-rate document, that
is a finding, not a licence to enlarge the segment.

### R4 — A page-count change is a STOP

An added table can push a one-page document to two, changing `pages` and the footer
(`Page 1 of 1` → `Page 1 of 2`). R2 cannot express that. **D-9: stop and ask.** Do not
soften `:131`.

### R5 — `determinism-check` stays a pure control

`scripts/determinism-check.ts:48` pins `DSP-REF-0500`, a dispatch note — tax-neutral. It
must print **MATCH** with `git diff --stat apps/workers/scripts/determinism-expected.json`
**empty**. If that file needs to change, something reached the dispatch template and the
day is out of scope.

### R6 — see the top of this document

### R7 — `MONEY_KEYS` is keyed on FIELD NAME

`view-model.ts:26-41` and `render-typst.ts:62-77` format a numeric value only when its
**key** is in the set. `taxableValue`, `cgstAmount`, `sgstAmount`, `igstAmount` are in
it. `HsnGroup`'s `centralAmount`, `stateAmount`, `integratedAmount`, `totalTax`
(`summary.ts:78-94`) are **not**. An HSN row emitted under its own field names would
print `13671` where the reference prints `13,671.00`. Separately, `computeTaxSummary`
returns `Decimal` objects, which do not survive `JSON.stringify` as 2dp strings. An
explicit adaptation is required regardless — **D-4**.

### R8 — Re-baselining is not on the table

It would mean replacing Chromium-captured content with Typst-captured content, which
`docs/F3_F4_SPEC.md:44-51` calls a category error, and would require reviving the deleted
capture pipeline to be a real re-capture rather than a relabelling. **Not this day's to
do, and the operator's alone if ever.** R1+R2 keeps the contract.

---

## Phase A — the work

### A.0 — Baseline, before any other change

Take the recipe **verbatim** from `docs/F3_DAY_PROMPT.md` A.0, substituting `f4-*`:

- `pnpm typst:install`, `pnpm typst:check`.
- `pnpm db:seed`, then `apps/workers/scripts/long-serial-fixture.sql`, then
  `pnpm exec tsx scripts/determinism-check.ts` (expect MATCH), then
  `pnpm --filter workers test`.
- Render into a **FRESH** directory and hash. **Never hash `docs/pdf-references/*.pdf`**
  — git-tracked read-only input, empty by construction (DEV.136).
- A second independent reseed into a second fresh directory; `diff` the two `.sha` files.
- **The one-byte-flip control, EXECUTED**, and report its output. A clean diff from a
  pipeline never shown capable of a dirty one is not evidence.
- **Record which of the 14 are single-rate and which reference exercises which tax
  path**, from the table above, re-measured rather than copied.

### A.1 — Fix the rate label first, as its own step

Fix the `''` degradation in **both** `src/pdf/view-model.ts:131-133` **and**
`scripts/render-typst.ts:236-238`. Do it as its own commit so that the rate-wise block
in A.2 is a separate, reviewable change. On a single-rate document the label must come
out **identical to today** — that is R3's proof obligation and it is what keeps the 8
references' totals blocks byte-stable.

### A.2 — The rate-wise block

Replace the single-rate pair at `quotation.typ:103-107` with one pair per rate group,
ascending, from `computeTaxSummary`'s `byRate`. Intra-state: a CGST and an SGST row per
rate at half the rate. Inter-state: one IGST row per rate at the full rate. Keep the
rows **inside** `rows:` (see "viable", constraint 2).

### A.3 — The HSN/SAC table

One row per distinct **(HSN, rate) pair**, ascending by HSN then rate, with a TOTAL row,
via `chrome.typ:111`'s `data-table`, following the totals block. Columns per **D-1**.
Renders on quotation **and** PI per **D-2**.

### A.4 — Where the summary is computed

**D-3: in the two loaders** (`templates/quotation.tsx`, `templates/performa-invoice.tsx`),
adding a field to `QuotationPdfData` (`templates/types.ts:55-99`). They already call
`computeTax` over the stored line rows and already carry `hsnCode` per line, and they are
shared by production, the snapshot test **and** `render-typst.ts` — so computing there
closes the data half of R6's fork automatically. Computing in `buildViewModel` re-opens it.

### A.5 — The arithmetic that must be consistent on the page

The HSN TOTAL row must equal the sum of its own rows, and the rate-wise block must
reconcile with the document totals already printed. Money is **read from the summary**,
never recomputed on the page.

### A.6 — Page-break behaviour

**D-7: not covered this day.** State plainly in the day's notes that HSN-table
page-break behaviour is untested, and **file a row for the fixture in Phase C**. This is
a documented departure from `docs/F3_F4_SPEC.md:282`.

### A.7 — The mixed-rate golden file

**D-6: an extracted-text fixture under `apps/workers/tests/`, with a recorded `sha256`
alongside for the byte claim.** Text is what the snapshot test compares
(`pdf-snapshots.test.ts:112-113`); it reviews as a readable diff; the byte guarantee
rides on the hash without committing a binary whose movement no reviewer can read. It is
**not** a member of `docs/pdf-references/` and must say so in its own header.

### A.8 — Documentation

- `pdf-snapshots.test.ts:20-23` says "NOTHING IS EXCLUDED FROM THE ASSERTIONS". That
  becomes partly false under R2. **Rewrite it in the same commit** (§11.1 ruling 6).
- `apps/web/lib/tax/document-summary.ts:55-65`'s docstring asserts a false premise.
  **Correct it regardless of D-8's disposition.**
- Amend `docs/F3_F4_SPEC.md` §2's illustrative table and §8's second sentence, dated in
  place.

### What this day does NOT do

- **Not F.6.** No round-off, no round-off row, no round-off column, no tax invoice.
- **Not F.101.** No change to `packages/tax` — `git diff --stat packages/tax/` must be
  empty.
- **Not F.108.** Work around the fork; do not de-duplicate it.
- **Not the dispatch note or the payment receipt** (C-1).
- **No change to `docs/pdf-references/`.** No file added, removed or modified there.
- **Not `apps/web/tests/e2e/critical-path.spec.ts`** — protected.
- **No schema change, no migration, no new ADR.**

---

## Phase B — verification

**Must stay green:** `pnpm --filter workers test`, `pnpm --filter @dealerlink/db test`,
`pnpm --filter @dealerlink/tax test`, `pnpm --filter web test`, `pnpm typecheck`,
`pnpm lint`, `pnpm build`, `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check`.

**The three measurements, as three statements:**

```
# 1 — TEXT against the Chromium contract (now reference-plus-named-delta)
pnpm --filter workers test        # pdf-snapshots.test.ts, all 14 by name

# 2 — BYTES against the pre-change render (fresh dir; NEVER docs/pdf-references/)
#   MUST show exactly the 8 tax-bearing labels changed
#   MUST show the 6 tax-neutral labels unchanged
#   AN EMPTY DIFF ACROSS ALL 14 IS A FAILED MEASUREMENT ON THIS DAY (see the top)

# 3 — BYTES across two independent reseeds of the POST-change tree
```

Plus `determinism-check.ts` → MATCH with `git diff --stat` on
`determinism-expected.json` empty.

---

## Phase C — closeout

Follow `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" in full. Unusual
for this day:

- **C5:** F.4's own row; a note on F.6 (this day leaves the round-off slot viable and
  says how); a note on F.108 (worked around, not fixed).
- **C6 — a deviation entry is certain**, and must carry: the shipped rate-label defect
  and that it was fixed in two places; the false `hsnRows` premise and that the error was
  the operator's; the replacement rule and why the standing "any movement is a finding"
  rule does not hold here; which of the 8 moved and by exactly what; and whether any
  page count changed.
- **C6b — no unearned precision.** No "byte-identical" without the command; prefer an
  enumeration to a count.
- **File two rows in Phase C:** the HSN page-break fixture (D-7) and, if D-8 is taken as
  filed, the `hsnRows` deletion (D-8).
- **C7a:** `verifier` before the PR. A FAIL stops the day (§10.3).

---

## Acceptance criteria — each with what decides it

| #   | Criterion                                                                                 | Decided by                                                                |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | One tax row per distinct rate, ascending                                                  | new mixed-rate assertion → `pnpm --filter workers test`                   |
| 2   | No empty rate label on a mixed-rate document                                              | same assertion: body contains no `CGST` followed by a non-digit           |
| 3   | Chain B yields three HSN rows                                                             | same file; corpus guarantee `packages/db/tests/multi-rate-corpus.test.ts` |
| 4   | HSN TOTAL equals the sum of its own rows                                                  | same file                                                                 |
| 5   | **1, 3 and 4 go RED under the pre-change template**                                       | executed control; **report the output**                                   |
| 6   | Each of the 8: body minus one named segment == reference body; footer and pages unchanged | `pdf-snapshots.test.ts`                                                   |
| 7   | The 6 tax-neutral renders byte-identical                                                  | pre/post `.sha` diff restricted to those 6; empty                         |
| 8   | The 8 tax-bearing renders NOT byte-identical                                              | the same diff restricted to those 8; non-empty on all 8                   |
| 9   | The byte pipeline can report a difference                                                 | A.0 one-byte-flip control; report output                                  |
| 10  | All 14 reproduce across two reseeds                                                       | reseed1 vs reseed2 `.sha` diff; empty                                     |
| 11  | determinism MATCH, expectations file unmodified                                           | `determinism-check.ts` + `git diff --stat`                                |
| 12  | `packages/tax` unchanged                                                                  | `git diff --stat packages/tax/` empty                                     |
| 13  | No reference PDF modified                                                                 | `git diff --name-only docs/pdf-references/` empty                         |
| 14  | `three-percent-render.test.ts` passes unmodified                                          | `pnpm --filter workers test` + `git diff` on the file                     |
| 15  | Round-off slot still last in `rows:`; `chrome.typ` comment re-anchored                    | **reading the PR diff — no command exists, and this says so**             |
| 16  | Repo hygiene                                                                              | `check:paths`, `check:ids`, `plan:check` each exit 0                      |

**Checked against each other.** 6 and 7 apply to disjoint named file sets and cannot
conflict. **8 deliberately inverts F.3's expectation for measurement 2** — stated at the
top rather than left for a reader to reconcile against the earlier prompt. **5 is the
only criterion that makes 1, 3 and 4 non-vacuous, and it must be EXECUTED, not intended**
(DEV.129, DEV.139). 15 is the one criterion with no command and is labelled as such
rather than dressed up.

---

## STOP AND ASK

- **A `chrome.typ` edit.** It is shared by all four templates and can move the 6 frozen
  references. Converts a two-template change into a four-template one.
- **Any page-count change on any of the 8** (D-9).
- **Any movement in any of the 6 tax-neutral references** — a finding, never a
  re-baseline.
- **Any need to change `packages/tax`.** It contradicts this day's premise.
- **Any need to modify `docs/pdf-references/`.** Unavailable; the operator's alone.
- **Any temptation to widen R2's segment to make a test pass.** That is the failure mode
  this rule exists to prevent.
- **Any eleventh decision** the ten below do not cover.

---

## Settled decisions — D-1 to D-10, operator 2026-09-24

**D-1 (was Q1) — the HSN/SAC table takes 8 columns with an EXPLICIT `Rate`.**
HSN/SAC · Rate · Taxable Value · Central Rate · Central Amt · State Rate · State Amt ·
Total Tax on an intra-state document, collapsing to HSN/SAC · Rate · Taxable Value ·
Integrated Rate · Integrated Amt · Total Tax inter-state. The pair is the grouping key,
so two rows can share an HSN and differ only by rate; on an intra-state document only
the half-rate shows, and a reader cannot recover 18 from 9 without knowing the
convention. §2's own prose already says the Rate column is "part of the table's
identity". **§2's illustrative table at `:111-115` is the stale half and is amended to
match, dated in place.**

**D-2 (was Q2) — the table renders on quotation AND PI, i.e. on all 8 tax-bearing
references.** Layout is fixed for all tenants (§8 decision 6), and
`performa-invoice.typ` imports `quotation-body` verbatim so "both" costs nothing while
"PI only" costs a branch through shared code. **The operator's reason, which outranks
the cost argument: a table that appears only sometimes is harder to verify than one that
always does.** Accepted cost: 8 references move rather than 3.

**D-3 (was Q3) — compute the summary in the two loaders**, adding a field to
`QuotationPdfData`. They are shared by production, the snapshot test and
`render-typst.ts`, so this closes the data half of R6's fork automatically. Computing in
`buildViewModel` re-opens it.

**D-4 (was Q4) — format the HSN row money explicitly at the point the summary is
adapted.** Neither `MONEY_KEYS` set changes. `MONEY_KEYS` is a global name-keyed rule;
adding four names silently changes formatting for any future field sharing one, and it
would have to be done twice in two forked files. Formatting once at the adapter is local
and cannot drift.

**D-5 (was Q5) — the partition is RATIFIED: reference-plus-named-delta (R1+R2), with
`footer` and `pages` kept as exact equality.** It is the only option that preserves the
cross-renderer guarantee on the documents where GST correctness matters most; retiring
the contract for the 8 would discard exactly the guarantee the references exist for, and
re-capture is unavailable. **The following sentence is operator-ratified and must survive
verbatim into the day's notes and its deviation entry:**

> A violation stops the day and is not a signal to widen the segment, "which is how this
> rule degrades into re-baseline with extra steps."

**D-6 (was Q6) — the mixed-rate golden file is an extracted-text fixture under
`apps/workers/tests/`, with a recorded `sha256` alongside.** Text is what the snapshot
test compares and it reviews as a readable diff; the hash carries the byte claim.
Accepted limitation: it freezes content, not layout. It creates a second baseline genre
and must say in its own header that it is a Typst self-snapshot, not a Chromium
cross-renderer reference.

**D-7 (was Q7) — HSN-table page-break behaviour is NOT covered this day.** State it
plainly and file a row for the fixture. A seed addition inside a rendering day adds a
second variable to every measurement in Phase B. This is a documented departure from
`docs/F3_F4_SPEC.md:282`.

**D-8 (was Q8) — file a row for `hsnRows`; do not delete it on this day.** It is
`apps/web` and this day is `apps/workers`; touching it pulls the web suite into a PDF
day's blast radius (§11.2). **The docstring's false claim is corrected either way** — it
must not be left reading as though F.4 consumed the field.

**D-9 (was Q9) — if any of the 8 changes page count, STOP AND ASK.** A page-count change
means the reference's page count is no longer the document's, which is a different kind
of movement from an added table and one R2 cannot express. Pre-authorising it would be
deciding it without having seen it.

**D-10 (was Q10) — F.4 ALONE. The drafter's conclusion is accepted and its REASONING IS
OVERRULED.** The drafter argued that the cost the "build them together" instruction
protected against had shrunk, because the references can no longer be re-captured. **That
was never the operator's reason.** The reason was that round-off lands in the _same
totals block_, between `:107` and `:108`, and **that coupling is unchanged** — which is
why this prompt carries a four-part definition of what "leaving the slot viable" requires
rather than treating it as a line-number note.

The drafter also read F.6's four §10.1 stop-and-asks as an argument for merging. **They
argue for separation:** a defect in either would be attributable to both, and the point
of separate days is that a red measurement names one cause. Sequence: **F.4, then F.101,
then F.6.** F.106 sits between F.4 and F.101 by the 2026-09-23 resequencing and is
unaffected by this decision.
