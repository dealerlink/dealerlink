# F.101 — the document discount and its per-line allocation must sum to the same number

> **STATUS: APPROVED — operator 2026-09-21. Run it.** All nine questions are settled
> as **D-1 to D-9** at the end of this document. **One recommendation was overruled
> (D-1, the tie-break)** and one carries a sequencing constraint the draft did not
> state (**D-6**).
>
> **TWO THINGS TO READ BEFORE PHASE A, because getting either wrong is expensive:**
>
> 1. **The wrong fix**, named in the next section. It is the one a reader reaches for
>    on seeing the failing invariant, and it would move stored numbers on every
>    historical discounted document.
> 2. **D-6's sequencing.** The fails-before evidence comes from the UNIT FIXTURE.
>    **Chain E is seeded AFTER the fix, never before.** Seeded before, its stored
>    headers are written by the old engine, and the moment the allocation changes its
>    four movable columns recompute differently from what is stored — making it an
>    F.99 historical document inside our own fixture.

> **THIS DAY CHANGES MONEY OUTPUT INSIDE `packages/tax`.** That surface is protected (`docs/STAGE_F_BUILD_v3.md:435-437`, CLAUDE.md §10.1), and unlike F.3 — whose D-1 authorised _composing on_ the engine and explicitly forbade touching it — this day must edit `computeTax` itself. **It therefore requires an operator authorisation of the shape F.55, F.81, F.84 and F.3 used, written down before Phase A begins, naming its bounds.** Any step that appears to need something outside those bounds is a **STOP**, not a small refactor.

## THE WRONG FIX, NAMED FIRST BECAUSE IT IS THE ONE A READER WILL REACH FOR

You will meet a failing identity of the form `sum(lineDiscount) ≠ discountAmount`. **The obvious fix — recompute the document figure as the sum of the per-line allocations — is REJECTED and must not be implemented.**

It would move `discount_amount`, `taxable_amount` and `total_amount` on **every historical discounted document**, so a document would reproduce differently from the way it was billed. That is **F.99**'s failure mode exactly (`docs/stage-f-tasks.json:904-911`), and F.99 is filed and unscheduled precisely because nobody has decided how to make a historical document reproducible as-billed.

**The decided shape is the opposite direction:** the document-level `discountAmount` (`compute.ts:36`) stays the **authority**, and the per-line allocation is adjusted to sum to it exactly, by **largest remainder** with a stated deterministic tie-break. Operator ruling, 2026-09-20, recorded at `docs/stage-f-tasks.json:146`.

If during the day the largest-remainder allocation appears to require moving a document figure, **stop and report** — that is the signal that the shape is wrong, not the licence to invert it.

**Goal.** Make the per-line discount allocation sum to the document discount exactly, without moving `subtotal`, `discount_amount` or `taxable_amount` on any existing document, and without moving the four tax/total columns either unless measurement shows otherwise (see A.0). Correct `compute.ts:13-18`'s docstring **in this task**, because correcting it earlier would make the file self-consistent and still wrong.

**Primary deliverables**

1. A largest-remainder allocation of `discountAmount` across the lines in `packages/tax/src/compute.ts`, replacing the per-line proportional rounding at `:50` and `:54`, with the document scalars untouched.
2. The corrected rounding-model docstring at `compute.ts:13-18` (and D-7’s sentence in `round.ts:3-23`, which documents the adjacent policy).
3. The deliberate inversion of F.3's characterisation test (`packages/tax/tests/summary.test.ts:362-386`) and of the reasoning recorded around it (`summary.test.ts:42-55`, `quotation-engine-parity.test.ts:103-130`).
4. Evidence that the fix works, on a corpus that cannot produce the defect — **D-6 settles it: all three.** A property test, a unit fixture, AND seed Chain E, with the sequencing in D-6.
5. The three measurements proving no existing document moved, each with an executed falsifying control.

**Read before starting**

- `docs/stage-f-tasks.json` — F.101 in full (`:139-147`), F.99 (`:904-911`), F.3 (`:131-137`), F.4 (`:149-155`), F.84 (`:769-777`), F.86 (`:788-794`), F.102 (`:922-929`).
- `docs/F3_F4_SPEC.md` §3 money rules (`:163-217`, including the dated 2026-09-19 correction) and §4 invariants (`:220-234`).
- `docs/F3_DAY_PROMPT.md` — A.0 for the baseline recipe (which itself defers to `docs/F84_DAY_PROMPT.md` A.0; take it verbatim, do not re-derive), Phase B's three-measurements block, and D-2 for why every consumer recomputes.
- `CLAUDE.md` §5 (GST rules, rounding, the `gstRate` string rule as corrected by F.82), §10.1 (stop and ask), §11.1 rulings 1, 2, 3, 4, 5, 7, 8, §11.2.
- `docs/STAGE_F_BUILD_v3.md` §9 (`:433-451`) — the protected surfaces, and `:447`'s "money is read from stored columns, never recomputed".
- `docs/BUILD_PROMPT_TEMPLATE.md` — the prompt shape, "Phase C — end-of-day routine" (`:18`), and the DEV.138 bounded exception (`:283`).

---

## PREMISE CHECK — confirmed against the code, 2026-09-21

**The defect is real and its mechanism is exactly as F.101's row states.** `computeTax` computes `discountAmount = round2(computeDiscountAmount(...))` at document level (`compute.ts:36`, helper at `:170-180`), derives `taxableAmount = subtotal.minus(discountAmount)` (`:45`), then allocates per line as `lineDiscount = round2(lineSubtotal.times(discountRatio))` with `discountRatio = discountAmount/subtotal` (`:50,:54`). Nothing reconciles the two. Four independent records of the measured delta agree: `docs/stage-f-tasks.json:146`, `summary.test.ts:42-55`, `quotation-engine-parity.test.ts:121-129`, and the live assertion at `summary.test.ts:379-385`.

**The affected quantities, enumerated from the output type rather than inferred.** `TaxComputationOutput` returns seven document scalars plus `isInterState` plus a positional `lines[]` (`compute.ts:94-104`; the serialized mirror is `serialize.ts:8-32`). Of the seven:

| Scalar           | Derived from                                                         | Can this day move it?                               |
| ---------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `subtotal`       | `sumDecimals` of rounded line subtotals (`:33`)                      | **No** — no dependence on the allocation            |
| `discountAmount` | `round2` of the document-level discount (`:36`)                      | **No** — it is the authority                        |
| `taxableAmount`  | `subtotal.minus(discountAmount)` (`:45`)                             | **No**                                              |
| `cgstAmount`     | sum of per-line CGST computed on `lineTaxable` (`:68`, summed `:90`) | **YES, by construction of the change — measure it** |
| `sgstAmount`     | same (`:69`, `:91`)                                                  | **YES — measure it**                                |
| `igstAmount`     | same (`:64`, `:92`)                                                  | **YES — measure it**                                |
| `totalAmount`    | `taxableAmount + cgst + sgst + igst` (`:101`)                        | **YES — measure it**                                |

**This is a correction to the task row and to the brief that commissioned this prompt.** Both say "the document scalars do not move, so every stored header on every historical document stays valid". Three of the seven cannot move; four can. The mechanism: re-allocating the discount shifts at least one line's `lineTaxable` by 0.01, and `round2(0.01 × halfRate)` is not always 0.00. Whether any real document is affected is **measured**, not reasoned — and the instrument exists (`quotation-engine-parity.test.ts:86-94` asserts all seven stored columns against a fresh recomputation, for every seeded `QT-` quotation).

**Nothing stored per line can be invalidated, established by reading all three line tables in full.** `quotation_lines` (`packages/db/src/schema/quotation.ts:131-174`), `performa_invoice_lines` (`performa-invoice.ts:139-178`), `order_lines` (`order.ts:132-183`). The complete money-bearing column set on each is exactly **`unit_price`** and **`line_total`** (`decimal(12,2)` and `decimal(14,2)`); the remaining numerics are `quantity`, `gst_rate`, and on orders `reserved_quantity`/`dispatched_quantity`, none of which is money. **There is no per-line discount, taxable-value or tax column at any grain** — which is F.99's measurement, re-derived here by enumeration rather than carried. And `line_total` is `quantity × unit_price`, **pre-discount**, at every write site, enumerated: `apps/web/lib/actions/quotations/helpers.ts:229` (via `lineTotalOf`), `apps/web/lib/actions/pi/helpers.ts:223` (`(l.quantity * l.unitPrice).toFixed(2)`), `packages/db/src/seeds/day8.ts:472`, `day11.ts:354,:468`, `multi-rate.ts:516,:601,:680` (`lineSubtotal`). So no stored per-line figure can be invalidated by this change.

**Beware the `lineTotal` name collision** (carried from F.3's day prompt, which measured it): the DB column `line_total` is `qty × price`, pre-tax and pre-discount; the engine's `lineTotal` field (`compute.ts:84`) is `lineTaxable + lineTaxTotal`, post-discount and tax-inclusive. Same name, opposite semantics.

---

## READ THIS FIRST — where the sources disagree with the code

**R-1 — "Document scalars do not move" is three-of-seven, not seven-of-seven.** See the premise check. The row's claim at `docs/stage-f-tasks.json:146` and the brief both overstate it. The corrected claim is still strong enough for the chosen shape — the three columns that define what was _charged as a discount_ are immovable — but the day must measure the other four rather than assert them.

**R-2 — THE 14 REFERENCE PDFs PRINT PER-LINE DISCOUNTED FIGURES, AND AT LEAST ONE REFERENCE DOCUMENT IS DISCOUNTED.** The row and the brief treat reference movement as unlikely on the ground that no discounted seeded document is mixed-rate. Mixed-rate is the wrong protection: what protects a reference is a **zero residual in the allocation**, which is a property of the subtotals, not of the rates. And the figures are on the page:

- `templates-typst/quotation.typ:63-93` — the line table's columns are `# / Description / Qty / Unit Price / **Discount** / **Taxable Value** / GST / GST Amount / Total`, with `money(l.lineDiscount)` at `:76` and `money(l.taxableValue)` at `:77`.
- `:88` prints `data.totalTaxable`, which `apps/workers/src/pdf/view-model.ts:122` computes as `lines.reduce((t, l) => t + l.taxableValue, 0)` — **the sum of per-line taxables**, i.e. precisely the F.101-affected quantity.
- Those values reach the template from `apps/workers/src/templates/quotation.tsx:224-225` (`lineDiscount: Number(t.lineDiscount)`, `taxableValue: Number(t.lineTaxable)`), recomputed through `computeTax` on **every render** (`:186-209`).
- `templates-typst/performa-invoice.typ` imports `quotation-body` verbatim, so the PI inherits all of it.
- `packages/db/src/seeds/day8.ts:88-233` contains **five discounted plans**: `:112` (percent 5), `:141` (percent 7.5, the file's **only three-line plan**), `:150` (amount 5000), `:180` (percent 10, two lines, accepted), `:199` (amount 10000). Counter allocation is sequential per plan (`:387-397`), so plan index _i_ is `QT-<fy>-000(i+1)`. On that reading the matrix case `quotation__QT-2026-0006__inter__3line` is the 7.5% plan and `quotation__QT-2026-0010__intra__2line` is the 10% plan — **two of the four quotation reference cases are discounted**, and `PI-2026-0001` descends from an accepted quotation, of which the 10% plan is one.

  **That mapping is MY inference from the plan list and the counter order; I have no database and did not verify it.** A.0 verifies it in one query. What must not survive into the day is the belief that no reference is discounted.

**R-3 — THE SEED DUPLICATES THE OLD ALLOCATION ALGORITHM, ON FLOATS, AND IT WROTE THE STORED HEADERS.** `packages/db/src/seeds/day8.ts:235-291` is a second implementation of `computeTax`'s money math: `:258` computes `discountRatio = discountAmount / subtotal` and `:268-269` computes `lineDiscount = round2(lineSubtotal * discountRatio)` — the identical proportional allocation, on IEEE-754 doubles with `round2 = Math.round(n * 100) / 100` (`:63`). **The stored `cgst_amount`/`sgst_amount`/`igst_amount`/`total_amount` of every `day8` quotation were produced by that code.** So if F.101 changes which line receives a residual paisa on any `day8` discounted document, `quotation-engine-parity.test.ts` goes **red** against the stored value — not because the engine is wrong but because the seed is now a different algorithm.

This is the day's largest risk and it is **not** what F.86 addresses: F.86 (`docs/stage-f-tasks.json:788-794`) converts the seed's _substrate_ from float to Decimal and measured a zero diff; it does not touch the _algorithm_. Mirroring largest-remainder into `day8.ts` is a seed change that moves stored data on reseed, which can move rendered references. **D-4 settles it: do nothing here, conditional on the A.0 residual sweep covering ALL THREE document types. Do not decide it inside the day.**

**R-4 — F.3's characterisation test asserts a figure wrong by one paisa on purpose, and it is the acceptance evidence for this task.** Quoted verbatim from `packages/tax/tests/summary.test.ts:362-386`:

```
  it('DISCOUNTED — CHARACTERISES F.101: grouped taxable is 0.01 under the document figure', () => {
    // This test asserts a value that is WRONG BY ONE PAISA on purpose, to pin a
    // pre-existing engine defect F.3 may not fix. When F.101 lands and the
    // per-line allocation sums exactly, this test MUST fail — that is its job.
    // Do not "fix" it by loosening the comparison.
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: KA,
      discount: { type: 'percent', value: 12.5 },
      lines: [
        line('a', '71131900', 3, 7, 3571),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85044090', 12, 10, 8300),
        line('d', '85359090', 18, 3, 4150),
      ],
    });

    expect(s.totals.taxableValue.toFixed(2)).toBe('210325.50'); // document-level
    expect(sumD(s.byRate.map((g) => g.taxableValue))).toBe('210325.49'); // per-line
    expect(sumD(s.byHsn.map((g) => g.taxableValue))).toBe('210325.49');

    const delta =
      Number(s.totals.taxableValue.toFixed(2)) - Number(sumD(s.byRate.map((g) => g.taxableValue)));
    expect(delta.toFixed(2)).toBe('0.01');
  });
```

**The three assertions that invert are `:380`, `:381` and `:385`.** After this day: `:380` and `:381` become `'210325.50'`, and `:385`'s delta becomes `'0.00'`. `:379` (`totals.taxableValue === '210325.50'`) must be **unchanged** — that is the document figure this day preserves, and its survival is the proof that the authority did not move. **Rename the case** so its title no longer says CHARACTERISES, and **keep the case**: with the delta at zero it becomes the regression test for the fix on the exact document that found it. Do not delete it and do not loosen it (CLAUDE.md §11.1 ruling 1).

Two neighbouring blocks must be updated rather than left to read falsely:

- `summary.test.ts:42-55`, the file docblock section "The discount paisa, and why one identity is asserted differently", which states the delta as current behaviour and says "F.3 is not allowed to fix it".
- `summary.test.ts:336-339`, the comment above the DISCOUNTED tax-identity case, which says "The TAXABLE identities (1, 2) do not [hold]". After this day they do — and `:340-360` should be reviewed for whether the taxable identities should now be asserted there too, which D-5 settles: assert them there AND keep a record of the pre-change figures.
- `summary.test.ts:388-399`, the control case ("the same document WITHOUT the discount has no delta"), **loses its discriminating power** once the discounted case also has no delta. D-5 covers what replaces it. Do not simply delete a control.

**R-5 — the parity test deliberately asserts the weaker identity, and that choice was made because of this defect.** Quoted verbatim from `packages/db/tests/quotation-engine-parity.test.ts:116-129`:

```
   * The TAXABLE identity is asserted against the sum of PER-LINE taxables, not
   * against the stored `taxable_amount`: those two legitimately differ by a paisa
   * on a discounted document, because the engine derives the document discount at
   * document level and allocates it per line. That is F.101. Asserting the stored
   * column here would fail for a reason that has nothing to do with grouping.
   *
   * **If this test ever goes red on a one-paisa taxable mismatch, check F.101
   * before suspecting the grouping.** The measured shape, from a 4-rate
   * inter-state document at 12.5% with line subtotals 24997 / 119925 / 83000 /
   * 12450: `discountAmount` 30046.50 against `sum(lineDiscount)` 30046.51, and
   * `taxableAmount` 210325.50 against `sum(lineTaxable)` 210325.49. No seeded
   * document triggers it today — every discounted seeded document is single-rate
   * with cleanly-dividing subtotals — so a red here means either new seed data or
   * a real grouping defect, and the sign of the delta tells them apart: F.101
   * always leaves the per-line sum LOWER than the document figure, never higher.
```

and the assertions it justifies, at `:172-187`:

```
          const perLineTaxable = add(
            computeTax({
              tenantState: q.tenantStateAtIssue,
              placeOfSupply: q.placeOfSupply,
              discount,
              lines: engineLines,
            }).lines.map((l) => l.lineTaxable),
          );

          // 1 + 2 — both partitions cover exactly the per-line taxable total.
          expect(add(summary.byRate.map((g) => g.taxableValue)), `${where} byRate taxable`).toBe(
            perLineTaxable,
          );
          expect(add(summary.byHsn.map((g) => g.taxableValue)), `${where} byHsn taxable`).toBe(
            perLineTaxable,
          );
```

**D-3 settles it: assert against the stored `q.taxableAmount`.** The workaround's own stated reason expires with the defect, the stored column is the stronger check (it compares grouping against persisted data rather than against a second call to the same function), and leaving the weaker form in place leaves a permanent citation to a closed task. The docblock's paragraph must be rewritten to say the identity now holds against the stored column and why, with the old reason preserved as history rather than as current fact.

**R-6 — `compute.ts:13-18`'s docstring is false today, in a way that is narrower than it looks.** Verbatim:

```
 * Rounding model (see `round.ts` for the full rationale):
 *   - each line's subtotal is rounded to 2dp; the document `subtotal` is the
 *     SUM of those rounded line subtotals — so an invoice's printed line
 *     amounts always add up to the printed subtotal exactly;
```

The promise holds for `subtotal` (`:33` really is the sum) and **fails for discount, taxable and total** once a discount exists. The phrase "an invoice's printed line amounts always add up to the printed subtotal exactly" is the part that reads as a general guarantee and is not one. Correct it **in this task** and state the new invariant positively: the allocation sums to the document discount exactly, so printed line taxables sum to the printed taxable amount. Do not add a claim the day has not measured.

**R-7 — a related but separate promise lives in `round.ts:3-23`** and cites "CLAUDE.md §6" for the round-off rule that is actually in §5. It is **not** this day's to fix (it is F.100's population: `docs/stage-f-tasks.json:914-920`), and whether `round.ts` needs a sentence about allocation at all is settled by **D-7: yes, minimally — and do NOT touch `round.ts:15`’s §6 miscite, which is F.100.**

**R-8 — the 12-paisa figure in `multi-rate.ts:40` is about a different mechanism.** `packages/db/src/seeds/multi-rate.ts:40` records "on 18/5/12/5 with a 5% discount the two disagree: CGST 9569.34 against 9569.35" — that is F.86's float-versus-Decimal divergence, not F.101's allocation residual. The two can both be live on one document. Do not conflate them when attributing a red parity assertion.

**R-9 — the seeded corpus cannot demonstrate either the defect or the fix.** `multi-rate.ts:232-237` passes `discount: null` on every chain, with the reason stated in the code; every discounted seeded document therefore comes from `day8`, and all of those are single-rate 18% (`day5.ts:259-337` generates every product at `gstRate: '18'`). **A green corpus after this change is not evidence that the fix works** — only that nothing broke. The positive evidence is **D-6’s**, and its sequencing is binding.

---

## Phase A — the work

### A.0 — Establish the "nothing moved" baseline, and measure the four movable columns. Before any other change.

Take the baseline recipe **verbatim** from `docs/F84_DAY_PROMPT.md` A.0 as `docs/F3_DAY_PROMPT.md` A.0 did, substituting `/tmp/f101-*`. It must include:

- `pnpm typst:install`, `pnpm typst:check`.
- `pnpm db:seed`, then `apps/workers/scripts/long-serial-fixture.sql`, then `cd apps/workers && pnpm exec tsx scripts/determinism-check.ts` (expect MATCH), then `pnpm --filter workers test`.
- Render into a **fresh** directory and hash: `pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/f101-pre`, then `sha256sum`. **Never hash `docs/pdf-references/*.pdf`** — git-tracked read-only input, empty by construction (DEV.136).
- A second independent reseed into `/tmp/f101-pre2`, and `diff` the two `.sha` files.
- **The falsifying control, EXECUTED** (DEV.138): flip one byte in one copied PDF and show the same `sha256sum`/`diff` pipeline reports it. **Report the output.** A clean diff from a pipeline never shown capable of a dirty one is not evidence.

Then **four measurements specific to this day, all to be RUN and reported, none to be reasoned about** (DEV.138, DEV.139):

1. **Which seeded documents carry a discount, and which of those are reference cases.** Query `quotations` and `performa_invoices` for `discount_amount > 0`, join the matrix's document numbers (`apps/workers/scripts/typst-matrix.json` — `QT-2026-0001`, `QT-2026-0006`, `QT-2026-0010`, `PI-2026-0001`, `PI-2026-0002`, and `QT-2026-0001` for the `sample` tenant). Report the list. R-2 predicts at least two discounted reference quotations; **report what is actually there, including if the prediction is wrong.**
2. **Which seeded discounted documents have a non-zero allocation residual today.** For every document with `discount_amount > 0`, recompute through the current engine and report `sum(lineDiscount) − discountAmount` and `taxableAmount − sum(lineTaxable)`. **If every residual is 0.00, say so and say what that means: the corpus cannot demonstrate the fix, and a green parity run after the change is a boundary check, not a proof.** If any residual is non-zero, that document is the one to watch for a moved stored column and a moved reference render.

   **D-4 MAKES THIS THE CONDITION ON THE WHOLE DAY, AND IT MUST COVER ALL THREE
   DOCUMENT TYPES.** Quotations are already measured: all 14 discounted seeded
   quotations have residual 0.00 (2026-09-21). **The eight discounted PIs and the
   orders are NOT measured.** Cover `performa_invoices`/`performa_invoice_lines` and
   `orders`/`order_lines` too. **If ANY residual is non-zero, the day STOPS** and the
   operator chooses — proceeding on D-4(a) would ship a red parity test.

3. **The current printed disagreement, if any.** For one discounted reference document, extract the rendered text and report the line-table footer's Taxable total (`quotation.typ:88`) beside the totals block's Taxable Amount (`:102`). If they differ by 0.01 today, that is the customer-facing form of this defect and belongs in the deviation entry.
4. **The parity baseline.** `pnpm --filter @dealerlink/db test` green **before** any change, so a later red is attributable.
5. **Every existing `compute.test.ts` expected output, recorded.** The stop
   condition in STOP AND ASK is "if any EXISTING fixture case changes its expected
   output, STOP" — and **the DB residual sweep cannot see these**, because the unit
   fixtures are hand-written inputs no seed produces. Capture them now so a later
   change is a diff and not a recollection: `pnpm --filter @dealerlink/tax test`
   green, and the file's expected-value literals saved to the scratchpad.

Record the pre-change values of all seven stored header columns for every discounted document, so any post-change movement is a diff and not a recollection.

### A.1 — The allocation

In `packages/tax/src/compute.ts`, replace the per-line proportional rounding (`:50` `discountRatio`, `:54` `lineDiscount`) with a largest-remainder allocation of the **existing** `discountAmount` (`:36`) across the lines.

Binding constraints:

- **`discountAmount` is the authority and is not recomputed.** `:36`, `:44-45` and the `DISCOUNT_EXCEEDS_SUBTOTAL` guard at `:37-42` keep their current behaviour and their current values.
- **`sum(lineDiscount) === discountAmount` exactly, for every input.** This is the identity the day exists to establish.
- **The zero-subtotal and zero-discount paths stay safe.** The guard at `:50` exists because a zero subtotal must not divide; the comment there records why it can only be reached with a zero discount. Preserve that property and its comment's reasoning.
- **No new field on `TaxComputationOutput`, no new parameter on `computeTax`, no change to `serialize.ts`'s shape.** If the allocation appears to need either, that is a **STOP**.
- **All money math on `Decimal`.** `compute.ts:10-11` states the rule; `day8.ts:63`'s float `round2` is the counter-example this package exists to avoid.
- **A stated tie-break, because two equal remainders must resolve deterministically or the output is not reproducible.** **D-1 settles it, overruling the drafter — see D-1.** Write the chosen rule into the code as a comment naming _why_ that rule and not the others — a future reader will otherwise assume it was arbitrary and "simplify" it.

### A.2 — The docstring

Correct `compute.ts:13-18` per R-6. State the rounding model as three facts rather than one sentence that over-promises: line subtotals rounded then summed into `subtotal`; the document discount rounded once then **allocated** so the per-line allocations sum to it exactly; per-line taxes rounded then summed into the document tax totals. Say explicitly which printed figures now reconcile and do not claim any that the day has not measured.

### A.3 — The tests that must change deliberately

- **`packages/tax/tests/summary.test.ts:362-386`** — invert `:380`, `:381`, `:385`; leave `:379` alone; rename the case; keep it as the regression test (R-4).
- **`summary.test.ts:42-55`, `:336-339`, `:388-399`** — update the reasoning and replace the now-toothless control per D-5.
- **`packages/db/tests/quotation-engine-parity.test.ts:116-129, :172-187`** — D-3: assert the stored `taxable_amount` and rewrite the docblock, or leave as is and record why.
- **`packages/tax/tests/compute.test.ts` — ADDITIONS ONLY, and the existing per-line discount assertions are a protected baseline.** Four existing cases assert per-line allocations directly: `:218-219` (`'500.00'`/`'500.00'` on a 50% two-line document) and `:473-475` (`'37500.00'`/`'250.00'`/`'1250.00'` on a 5% three-line document). My arithmetic says both allocate exactly and therefore survive largest-remainder unchanged — **that is a prediction, and if either moves it is a STOP, not an update.** The same applies to Suite 9's structural invariants (`:487-585`), in particular `:535-539` (`subtotal − discountAmount === taxableAmount`), which must stay green because the day does not move any of the three.

### A.4 — The evidence the corpus cannot supply

**D-6 settles the shape: property test, unit fixture AND seed Chain E. ITS
SEQUENCING IS BINDING — build them in this order, not in the order they appear
above.**

|     | Claim                                     | Instrument                                                                              | When                                                           |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | The defect exists, and the fix removes it | **The unit fixture**, reproducing the measured 4-rate 12.5% case against the OLD engine | **BEFORE** the fix — shown RED, then green                     |
| 2   | The printed page adds up                  | **Chain E**, `quotation.typ:88` against `:102`                                          | **AFTER** the fix — seeded only once the allocation is correct |

> **CHAIN E MUST BE SEEDED AFTER THE FIX. NEVER BEFORE.**
>
> Seeded before, its stored headers are written by the OLD engine. The moment the
> allocation changes, its four movable columns — `cgst_amount`, `sgst_amount`,
> `igst_amount`, `total_amount` — recompute differently from what is stored. That
> makes it **an F.99 historical document inside our own fixture**: the thing built to
> prove the fix becomes an example of the problem, and the parity test goes red for a
> reason that has nothing to do with the allocation being wrong.

Chain E is appended **strictly after Chain D** with its own counter allocation
(F.84's precedent), using **new fixture-only products with their own SKUs**. Not
line-level price overrides — those route through F.91's re-stamp-on-draft-save path
and would add a second variable to a fixture whose whole purpose is to isolate one.
The existing multi-rate catalogue cannot supply the prices in any case (13325 and
13125 @5%, 41500 @12%, 4150 @18%, 4165 @3%).

Whatever is chosen must be able to fail: a test over a document whose allocation has a zero residual proves nothing, so the fixture's residual must be asserted non-zero under the old algorithm — i.e. the day must include a **control that shows the new assertion red before the change and green after**, run and reported (DEV.139), not designed.

The measured case in F.101's row is the natural starting shape: a 4-rate inter-state document at 12.5% with line subtotals 24997 / 119925 / 83000 / 12450, which produces two lines tied at a half-paisa remainder and therefore **also exercises the tie-break**. State that it does; a fixture that reaches the residual but not the tie leaves the tie-break untested.

### A.5 — Documentation

- The deviation entry (Phase C) is the primary record.
- `docs/F3_F4_SPEC.md` §3's money rules (`:163-217`) contain a paragraph ending "That is wrong on any discounted document, because the discount is allocated proportionally and rounded per line (`compute.ts:54-55`)". The citation and the mechanism both change. **D-8: amend the spec in place with a dated correction (the F.3 precedent), or leave it and record the drift.**
- `docs/F3_F4_SPEC.md` §4 invariant 1 (`:224`) becomes satisfiable on discounted documents for the first time. Say so somewhere a reader of the spec will find it.

### What this day does NOT do

- **Not F.99.** No per-line tax column, no engine-version stamp, no migration. The reproducibility question stays open and this day makes it no worse.
- **Not F.4.** No file under `apps/workers/` is edited — not `templates-typst/quotation.typ`, not `pdf/view-model.ts`, not the loaders in `templates/`. The renders may be _measured_ but not _changed_.
- **Not F.6.** No round-off, no round-off column, no round-off row.
- **Not F.86.** Do not convert `day8.ts`'s float arithmetic to `Decimal` as a drive-by, even though D-4 requires reading the same function.
- **Not a rate-list change, not a schema change, not a migration, not a new ADR.**
- **Not `critical-path.spec.ts`** — protected; it contains no discount (`git grep -in discount` over the file returns nothing), so it should be unaffected. If it goes red, that is a finding for the operator.
- **No change to `subtotal`, `discount_amount` or `taxable_amount` on any document, ever, by any route.**

---

## Phase B — verification

**Must stay green** (say which ran locally and which in CI):

- `pnpm --filter @dealerlink/tax test` — `compute.test.ts` with **additions only** (`git diff` on the file shows no modified existing case) and `summary.test.ts` with exactly the deliberate inversions of A.3.
- `pnpm --filter @dealerlink/db test` — `quotation-engine-parity.test.ts` (both cases), `multi-rate-corpus.test.ts`, `quotation.test.ts`, `gst-rate-invariant.test.ts`.
- `pnpm --filter web test` — including `apps/web/lib/reports/reports.test.ts` (asserts against stored header columns) and any test touching `lib/tax/document-summary.ts`.
- `pnpm --filter workers test` — `pdf-snapshots.test.ts` by named case, `three-percent-render.test.ts`, `quotation-template.test.ts`.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm verify`, `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check`.

**The three measurements, as three statements** — they answer different questions and each can fail alone:

```
# 1 — TEXT against the Chromium reference contract
pnpm --filter workers test        # pdf-snapshots.test.ts; :147 asserts body char-identical

# 2 — BYTES against the pre-change render (fresh dir; never docs/pdf-references/)
cd apps/workers && pnpm exec tsx scripts/render-typst.ts \
  --manifest scripts/typst-matrix.json --out /tmp/f101-post
( cd /tmp/f101-post && sha256sum *.pdf | sort -k2 ) > /tmp/f101-post.sha
diff /tmp/f101-pre.sha /tmp/f101-post.sha

# 3 — BYTES across two independent reseeds
diff /tmp/f101-reseed1.sha /tmp/f101-reseed2.sha
```

Plus `determinism-check.ts` → MATCH with `git diff --stat apps/workers/scripts/determinism-expected.json` empty.

**Unlike F.3 and F.84, measurement 2 here is NOT a check on a boundary — it is a check on the rendering.** F.3 could argue the renders _cannot_ move because no file under `apps/workers/` was edited. **That argument does not hold for this day**, because the templates recompute through `computeTax` on every render (`templates/quotation.tsx:186-209`) and print per-line discount, per-line taxable and a footer sum of per-line taxables (R-2). A moved byte here is a real possibility and, if it happens, **a finding for the operator and never a re-baseline** (CLAUDE.md §11.1 rulings 1 and 4).

**Also run and report:** the stored-column comparison from A.0's measurement 4 — all seven header columns for every discounted document, pre against post. Report `0 of N moved` with the query, or name the ones that moved.

---

## Phase C — closeout

Follow `docs/BUILD_PROMPT_TEMPLATE.md` "Phase C — end-of-day routine" (`:18`) in full. Unusual for this day:

- **C2 before C4 matters.** `pnpm test` writes to the shared dev DB (DEV.91) and this day's assertions depend on a known seeded state. Reseed deliberately between steps and say when.
- **C5:** F.101's own row, plus a note on F.99 (this day does not close it, and says why) and on F.4 (whether A.0's measurement 3 showed the printed disagreement, since F.4 inherits the page).
- **C6 — a deviation entry is certain**, and must carry: the three-of-seven correction to the row's own claim (R-1); which reference documents turned out to be discounted (R-2); the residual measurement and therefore what the corpus could and could not demonstrate (R-9); whether any stored column moved; and the tie-break with its reasoning.
- **C6b — no unearned precision.** No "byte-identical", no count, no "the only" without the command that produced it; prefer an enumeration to a count.
- **ONE AUTHORISED CORRECTION TO `DEVIATIONS.md`, ALREADY DECIDED — do not treat it as a drive-by.** `DEVIATIONS.md:5937-5939` reads "No code change is attributed to this entry; **the five instances it names** are recorded in DEV.124, C6c, DEV.136, in DEV.139 …, in DEV.142 and in DEV.143." DEV.138's heading (`:5934`) says **seven**, its "The seven." sentence (`:5945`) says seven, its "covers all seven" sentence (`:5975`) says seven, and its instance table (`:5954-5962`) has **seven** rows, which I read in full. The scope line is stale at five. **Correct "five" to "seven".** This is a **derived count inside DEV.138's instance region**, which is exactly what **F.102**'s bounded append-only exception permits (`docs/stage-f-tasks.json:922-929`; the rule sites are `.claude/agents/verifier.md` §3 and `docs/BUILD_PROMPT_TEMPLATE.md:283`, whose enumerated four counts include "the scope line naming which entries carry the instances"). **Cite F.102 as the authority in the commit message, and name the edited line to `verifier`, which is required to name the lines it classifies as covered.** Nothing else in DEV.138 may be touched.
- **C7a:** `verifier` before the PR. A FAIL stops the day (§10.3).

---

## Acceptance criteria — each with the command or file that decides it

1. `sum(lineDiscount) === discountAmount` exactly, for every fixture including the 4-rate 12.5% case and the tie case. → new cases in `packages/tax/tests/compute.test.ts`, via `pnpm --filter @dealerlink/tax test`.
2. `sum(lineTaxable) === taxableAmount` exactly, on discounted and undiscounted documents alike. → the same file and command.
3. `subtotal`, `discountAmount` and `taxableAmount` are unchanged from the pre-change engine on every fixture, and `:379` of `summary.test.ts` (`'210325.50'`) still passes **unmodified**. → `git diff packages/tax/tests/summary.test.ts` shows `:379` untouched; `pnpm --filter @dealerlink/tax test`.
4. Two lines with equal remainders resolve to the tie-break D-1 settles, and the same input produces the same allocation on repeated runs. → a dedicated case asserting _which_ line receives the paisa, in `compute.test.ts`.
5. **The new assertions go RED under the old algorithm.** Executed control: revert `compute.ts`'s allocation, run, report the failure count and the output; restore. → `pnpm --filter @dealerlink/tax test`, output pasted.
6. `packages/tax/tests/compute.test.ts` has **no modified existing case** — in particular `:218-219`, `:473-475` and Suite 9 (`:487-585`) are byte-unchanged. → `git diff packages/tax/tests/compute.test.ts` shows additions only.
7. `summary.test.ts`'s inversion is exactly the three assertions at `:380`, `:381`, `:385`, plus the comment and control changes A.3 names — no assertion loosened, none deleted without a replacement. → `git diff packages/tax/tests/summary.test.ts`, read hunk by hunk in the PR body.
8. All seven stored header columns are unchanged, for every seeded quotation, against a fresh recomputation. → `pnpm --filter @dealerlink/db test` (`quotation-engine-parity.test.ts:86-94`).
9. The pre/post stored-column comparison over every discounted document reports what moved, with the query. → A.0 measurement 4 plus its post-change repeat; `0 of N` is a result, not an assumption.
10. All 14 reference cases still match on **text**. → `pnpm --filter workers test` (`pdf-snapshots.test.ts`, 14 named cases, `:147` body char-identical).
11. All 14 renders are byte-identical to the A.0 pre-change hashes and across two independent reseeds, and `determinism-check` prints MATCH with `determinism-expected.json` unmodified. → `diff /tmp/f101-pre.sha /tmp/f101-post.sha`; `diff /tmp/f101-reseed1.sha /tmp/f101-reseed2.sha`; `determinism-check.ts` + `git diff --stat`.
12. The byte-comparison pipeline is shown capable of reporting a difference. → A.0's one-byte-flip control, output reported.
13. `compute.ts:13-18`'s docstring states the allocation invariant and claims nothing unmeasured. → read the diff of `packages/tax/src/compute.ts`.
14. No file under `apps/workers/` is modified; no migration; nothing under `packages/db/src/schema/` or `docs/pdf-references/`; no entry in `apps/workers/scripts/typst-matrix.json`; `apps/web/tests/e2e/critical-path.spec.ts` unchanged. → `git diff --name-only main`.
15. `pnpm check:paths`, `pnpm check:ids`, `pnpm plan:check` exit 0; `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm verify` green.
16. `DEVIATIONS.md:5937`'s "five" reads "seven", it agrees with the table's seven rows, and no other line in DEV.138 is modified. → `git diff -U0 DEVIATIONS.md`; `verifier` names the covered line.

**Criteria checked against each other.**

- **3 and 1/2 are compatible only under the chosen shape.** If the rejected fix were implemented, 1 and 2 would pass and 3 would fail. That is the discriminator between the two designs and the reason 3 is a criterion rather than a note.
- **14 forbids editing `apps/workers/`; 10 and 11 require the renders not to move.** Unlike F.3, **14 does not imply 10/11 here** — the templates recompute tax per render, so the renders could move with `apps/workers/` untouched. Both criteria are needed and neither is redundant.
- **5 is the only criterion that makes 1, 2 and 4 non-vacuous**, and it must be **executed**, not intended (DEV.129, DEV.139).
- **9 could conflict with 8 and that would be a finding, not a failure to hide.** 8 asserts a fresh recomputation matches the stored columns; 9 asks whether the stored columns _would_ differ under the new engine. If 9 shows movement, 8 is red, and the day stops for the operator (D-4) rather than reseeding to make 8 green.
- **6 and 1 are compatible only if my arithmetic on `:218-219` and `:473-475` is right.** If it is not, 6 fails and the day stops. Do not resolve that by editing the fixture.

---

## STOP AND ASK

- **`packages/tax` IS PROTECTED AND THIS DAY EDITS ITS ENGINE. THE AUTHORISATION
  IS ALREADY GIVEN — its BOUNDS are what you check against, not whether to ask.**

  Granted by the operator, 2026-09-21, in these terms:

  > Unlike F.3, this edits the engine. **Permitted:** the per-line discount
  > allocation, `compute.ts:13-18`'s docstring, D-7's sentence in `round.ts`, and
  > the test changes above. **Not permitted:** any change to how `subtotal`,
  > `discount_amount` or `taxable_amount` are computed — those are the three immune
  > by construction and must stay that way.

  Note what this grants that F.3's D-1 explicitly refused: **test fixtures may
  change.** Cases may be ADDED to `packages/tax/tests/compute.test.ts`, and the named
  assertions in `summary.test.ts` may be INVERTED. Without that clause the day could
  not satisfy criterion 1 without breaching the standing prohibition.

  **THE STOP CONDITION, STATED SO IT IS NOT A JUDGEMENT CALL:**

  > **If any EXISTING `compute.test.ts` fixture case changes its expected output,
  > STOP.**

  Not "consider whether the change is acceptable", not "update the expectation and
  note it" — stop, and bring it to the operator. An existing case changing its
  expected output means the fix altered a document shape nobody intended it to
  touch, and that is the signal the three immune columns were not immune after all.
  Adding a case is permitted; an existing one moving is not.

  **The DB measurement does not cover this.** A.0's residual sweep reads seeded
  documents; the unit fixtures are hand-written inputs that no seed produces. **Record
  every existing `compute.test.ts` expected output at A.0** so a later change is a
  diff and not a recollection.

- **Money columns on four tables.** This day writes none, but it changes the values a future write would produce. If any step appears to need a stored per-line figure, that is F.99 and a migration: **stop**.
- **`packages/db/src/seeds/day8.ts:235-291` (D-4).** Mirroring the allocation there changes stored seeded data on reseed and can move reference renders. Do not touch it without the answer.
- **Any movement in any of the 14 reference cases** — a finding, never a re-baseline.
- **Any movement in any stored header column** — stop before reseeding, because a reseed destroys the evidence that tells a state bug from a stale fixture (CLAUDE.md §11.1 ruling 5).
- **`critical-path.spec.ts`** — no edit, not even a one-liner.
- **Any tenth decision** the nine below do not cover.
- **`round.ts:3-23`'s "CLAUDE.md §6" citation** (the round-off rule is §5). You will read this file. **Do not fix it here** — it is F.100's population (`docs/stage-f-tasks.json:914-920`).
- **`apps/web/lib/reports/gst-summary.ts:8`'s wrong section citation** — same row, same instruction.

---

---

## Settled decisions — D-1 to D-9, operator 2026-09-21

Nine questions, nine answers. **One recommendation was overruled (D-1)** and **one
carries a sequencing constraint neither the draft nor the brief stated (D-6)**.
Apply these; do not re-open them (CLAUDE.md §11).

**D-1 (was Q1) — tie-break: remainder descending, then LARGER `lineSubtotal`, then
input index. THE DRAFTER'S RECOMMENDATION IS OVERRULED.**

The drafter recommended ties on input index alone, on the ground that every
observed caller orders by `lineNumber`. Rejected, in the operator's words:

> (a) makes the printed per-line figures depend on how a caller happened to order
> its lines — the engine can't enforce that ordering, so a future caller loading by
> id instead of `lineNumber` would silently change which line carries the paisa.
> That's the determinism hazard Day 27 and F.85 exist to prevent, reintroduced
> through the caller. (b) makes allocation a function of the document's CONTENT, not
> its PRESENTATION. The final index tie-break only fires on lines equal in subtotal,
> which are genuinely indistinguishable by value.

Note what the drafter's own evidence actually established: that callers order by
`lineNumber` **today**. That is a fact about current callers, not a property the
engine holds, and the engine is where the guarantee has to live.

**D-2 (was Q2) — standard largest-remainder.** The extra paisa goes to the lines
with the largest remainders, which minimises total deviation from proportionality.
Not "give it to the biggest line".

**D-3 (was Q3) — assert against the stored `q.taxableAmount`, and rewrite the
docblock.** `taxable_amount` is one of the THREE columns immune by construction, so
it does not move; after the fix the per-line sum equals it. Keeping the workaround
would leave a comment saying "that is F.101" outliving F.101, which is how a closed
task keeps being cited as live.

**D-4 (was Q4) — do nothing to `day8.ts` in this day, CONDITIONAL ON MEASUREMENT
ACROSS ALL THREE DOCUMENT TYPES, and extend F.86 rather than filing a new row.**

The condition is not satisfied yet. **Quotations are measured at zero residual — all
14 discounted seeded quotations, 2026-09-21. The eight discounted PIs and the orders
are NOT measured.** A.0 measurement 2 must cover all three. **If any residual is
non-zero, the day STOPS and the operator chooses** — proceeding would ship a red
parity test.

**The scope extension, and its reasoning:** `day8.ts` reimplementing the allocation
on floats is **the same defect** as its float `computeTotals`, which F.86 already
owns — seed code duplicating engine logic. The real fix for both is `day8.ts`
calling `computeTax`, as `multi-rate.ts` already does. So this belongs in F.86's
scope, not in a new row beside it.

**D-5 (was Q5) — both (a) and (b).** Assert the identities where they now hold, AND
keep a written record of the pre-change figures so a future reader can tell which
direction the fix went. **Do not simply delete a control** (CLAUDE.md §11.1 ruling 1's
spirit).

**D-6 (was Q6) — all three: property test, unit fixture, AND seed Chain E. THE
SEQUENCING IS BINDING AND NEITHER THE DRAFT NOR THE BRIEF STATED IT.**

The drafter recommended the property test and unit fixture alone, filing the chain
for F.4. Overruled on the operator's standing ruling — a green run proves nothing
moved, not that the defect is gone — reinforced by two of the drafter's own points:
seed-only cannot exercise the tie-break, and **F.4 needs the chain anyway**, so
building it here is cheaper than building it twice.

**The sequencing, which is the part that will be got wrong:**

|     | Claim                                    | Instrument                                                                              | When                                                           |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | The defect exists and the fix removes it | **The unit fixture**, reproducing the measured 4-rate 12.5% case against the OLD engine | **Before** the fix — it must be shown RED, then green          |
| 2   | The printed page adds up                 | **Chain E**, `quotation.typ:88` against `:102`                                          | **After** the fix — seeded only once the allocation is correct |

**Chain E MUST be seeded AFTER the fix. Never before.** Seeded before, its stored
headers are written by the OLD engine, and the moment the allocation changes, its
four movable columns recompute differently from what is stored — **making it an F.99
historical document inside our own fixture**, and turning the thing meant to prove
the fix into an example of the problem.

Two claims, two instruments. Chain E is appended strictly after Chain D with its own
counter allocation, per F.84, using **new fixture-only products with their own SKUs**
(not line-level price overrides, which route through F.91's re-stamp-on-draft-save
path and would add a second variable to a fixture meant to isolate one).

**D-7 (was Q7) — add the sentence to `round.ts:3-23`, minimally.** `compute.ts:13`
points readers there for "the full rationale", so a reader following the pointer must
find the allocation rule. **Do NOT touch `round.ts:15`'s CLAUDE.md §6 miscite —
that is F.100.** Editing this file does not authorise fixing that.

**D-8 (was Q8) — amend `docs/F3_F4_SPEC.md` §3 in place, dated.** F.4 builds from
that spec next and is the task most exposed to the stale paragraph. The F.3
precedent applies; the spec already carries two such corrections.

**D-9 (was Q9) — extend the `exact` table with discounted variants.** Adding a
discount column makes invariant 1 a **general property** rather than a single
example. **The existing table rows must stay unchanged — this EXTENDS the baseline,
it does not edit it.**
