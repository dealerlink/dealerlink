# F.6 — the reference-render move prediction, written BEFORE the change

**Written 2026-09-30, on `main` at `9537024`, before any file in this branch was
modified.** This document exists so that the answer cannot be written after the
result is known. Per **F6 D-2** (`docs/F6_SPEC.md` §1), the day must predict the
move-set per figure before re-running `pdf-snapshots.test.ts`, because the
discrimination between an intended and an unintended move cannot be automated:
there is no expected-diff manifest, no per-case classification field, and no way
to re-baseline (`docs/pdf-references/README.md` records the one-way door, and the
capture tool it names is absent from `apps/workers/scripts/`).

## THE PREDICTION: the move-set is EMPTY. All 14 cases unchanged.

Not "probably unchanged", and not "unchanged except the PI cases". **Zero figures
move on any of the three measures `pdf-snapshots.test.ts` asserts** — page count
(`:181`), footer text (`:184`) and body text (`:200`/`:206`).

### Why, in three independent reasons

1. **Measured, not reasoned.** F.152's settled note records a comparison of every
   stored money column against `serializeOutput(computeTax(...))` using the
   loader's exact call shape, run 2026-09-30 against `dealerlink_dev`:
   **quotations 0 of 48 with lines differ; PIs 0 of 31 differ.** The change in
   A.1 is precisely "print the stored column instead of the recomputed one", so
   where the two are equal the printed string is identical.
2. **Every reference case has lines.** They render today, and
   `pdf-snapshots.test.ts` reads a reference PDF for every case, so a case
   without lines could not be in the matrix. The line-less documents that bound
   F.152's measurement (F.97) are therefore not among the 14.
3. **No new row enters any totals block.** `round_off` lands on the **invoice**
   table only (**F6 D-9**). No quotation or PI gains a Round Off row, so the
   `rows:` tuple passed to `totals-block` is unchanged in length and content for
   all 14.

`typst-determinism` also cannot move: `determinism-check.ts` pins one dispatch
case, which no quotation or PI loader change reaches.

## THE PREDICTION IS CONDITIONAL, and here is the condition

**It holds only while `round_off` stays off `performa_invoices`.** If F.165 were
folded into this day, three PI reference cases would gain a Round Off row and
**move for real** — the prediction would be false, and the day would need a
justified per-figure expected-move manifest instead of an empty one. F.165 is
deferred precisely so that the two possible causes of movement (the loader
contract, and a new totals row) cannot arrive on the same day and be confused.

## What a non-empty diff MEANS

**Any figure that moves is a FINDING, reported before it is fixed.** It is not
re-baselined, the tolerated segment in `pdf-snapshots.test.ts` is not widened
(its own header: "If this assertion fails, the fix is never to widen the
segment"), and `docs/pdf-references/` is not touched. A move would mean one of
the three reasons above is false — most likely reason 1, which would mean the
corpus contains a document whose stored columns disagree with the engine, which
is F.152's hazard instantiated rather than a rendering problem.

## Procedure, and where the evidence lands

1. Pre-change capture on `main`:
   `cd apps/workers && pnpm exec tsx scripts/render-typst.ts --manifest scripts/typst-matrix.json --out /tmp/pre-f6`
2. After the A.1 change, the same command to `/tmp/post-f6`.
3. `REFS_DIR=/tmp/pre-f6 node apps/workers/scripts/compare-figures.mjs /tmp/post-f6`
   — exits non-zero on any difference and prints the set difference in both
   directions per document. **That output is the move manifest**, and it is
   recorded in the closeout whether it is empty or not.
4. `pnpm --filter @dealerlink/workers test` for `pdf-snapshots.test.ts` itself,
   which is the gate inside the required `test` job.

Steps 1–3 need the scratch rasteriser install (`docs/RUNBOOKS.md` R25) and none
of them runs in CI.

## RESULT

**THE PREDICTION HELD. The move-set is empty.**

`compare-figures.mjs`, pre against post, verbatim tail:

```
same BRANDED__dispatch__DSP-2026-0005.pdf                   0 figures
same BRANDED__payment_receipt__PAY-2026-0007.pdf            4 figures
same BRANDED__performa_invoice__PI-2026-0001.pdf           27 figures
same BRANDED__quotation__QT-2026-0001.pdf                  21 figures
same dispatch__DSP-2026-0005__in_transit__8line.pdf         0 figures
same dispatch__DSP-REF-0026__26serials.pdf                  0 figures
same dispatch__DSP-REF-0500__500serials.pdf                 0 figures
same payment_receipt__PAY-2026-0007__verified.pdf           4 figures
same performa_invoice__PI-2026-0001__intra__2line.pdf      27 figures
same performa_invoice__PI-2026-0002__inter__1line.pdf      18 figures
same quotation__QT-2026-0001__inter-sample-tenant__1line.pdf  18 figures
same quotation__QT-2026-0001__intra__1line.pdf             21 figures
same quotation__QT-2026-0006__inter__3line.pdf             29 figures
same quotation__QT-2026-0010__intra__2line.pdf             27 figures

ALL 196 FIGURES IDENTICAL across 14 documents
```

**Exit code 0.** Both captures rendered 14/14. And
`pdf-snapshots.test.ts` is **17/17** with the whole workers suite at **74/74**,
before and after.

### What this result does and does not establish

It establishes that the loader change is **invisible on the current corpus**,
which is what reasons 1–3 predicted. It does **not** establish that stored and
recomputed agree in general — that is F.152's limit 3, and it is worth repeating
here because a green figure comparison is exactly the kind of result that gets
over-read: **if every row in the dev corpus was written by the current engine,
agreement is guaranteed by construction, and neither this comparison nor
`pdf-snapshots.test.ts` can distinguish "no drift" from "no old data".**

That is precisely why A.1.5's mutate-and-rollback fixture is not optional. An
empty diff here means the change is safe to land; it says nothing about whether
the loader is now reading the column, because reading and recomputing produce the
same bytes on this data. Only a test that makes them disagree can tell.
