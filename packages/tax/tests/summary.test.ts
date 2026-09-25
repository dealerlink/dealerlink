import { describe, expect, it } from 'vitest';

import { computeTax } from '../src/compute';
import { computeRateSummary, computeTaxSummary, type SummaryLineInput } from '../src/summary';

/**
 * F.3 — rate-wise and HSN-wise grouping.
 *
 * ## WHAT THESE TESTS CAN AND CANNOT CATCH — read before trusting a green run
 *
 * `computeTaxSummary` calls `computeTax`, and the reconciliation assertions
 * below compare its grouped output against `computeTax`'s own document totals.
 * The stored header columns these totals mirror in production were **also**
 * written by `computeTax` — through the quotation and PI actions, and through
 * the seed, which computes its totals with the production engine rather than a
 * local copy (`packages/db/src/seeds/multi-rate.ts:28-56`).
 *
 * **So the reconciliation is a ROUND-TRIP. It catches GROUPING errors — a lost
 * line, a duplicated line, a mis-keyed group, a group-level rounding — and it
 * CANNOT catch an engine error.** If `computeTax` computed the wrong tax, every
 * assertion here would still pass, because both sides of the comparison come
 * from the same function.
 *
 * That is accepted rather than overlooked: F.3's authorisation requires
 * composing on the one authoritative engine (day prompt D-1), so there is no
 * second implementation available to disagree with, and inventing one would mean
 * checking the engine against code known to be less trustworthy. The point of
 * writing it down here is that "reconciles exactly to the stored totals" reads
 * like the engine is verified, and it is not. What is verified is that the
 * grouping preserves every paisa the engine produced.
 *
 * Engine correctness is `packages/tax/tests/compute.test.ts`'s job, and the
 * durability of recomputing at all is F.99.
 *
 * ## The (HSN, rate) key
 *
 * `byHsn` is keyed on the **pair**, per the 2026-09-20 correction to
 * `docs/F3_F4_SPEC.md` §2. The spec originally said one row per HSN with a scalar
 * rate, which is incoherent when one HSN carries two rates — the case Chain B
 * seeds deliberately. A nullable rate was rejected because a null rate cannot
 * resolve a Tally ledger, which is what F.11 needs the table for.
 *
 * ## The discount paisa — closed by F.101, and the record of how
 *
 * **All five identities now hold exactly, on discounted and undiscounted
 * documents alike.** This section used to explain why one of them could not.
 *
 * Before F.101, `computeTax` derived `discountAmount` at DOCUMENT level but
 * allocated it PER LINE by independent proportional rounding, so
 * `sum(lineDiscount)` could exceed `discountAmount` by a paisa and
 * `sum(lineTaxable)` fall short of `taxableAmount` by the same paisa. Measured on
 * a 4-rate inter-state document at 12.5%: 30046.51 against 30046.50, and
 * 210325.49 against 210325.50.
 *
 * That was an engine defect rather than a grouping defect, which is why F.3 was
 * not allowed to fix it and instead CHARACTERISED it — asserting the wrong figure
 * on purpose so the day it stopped being wrong, the test would fail loudly. It
 * did exactly that: F.101 replaced the allocation with a largest-remainder one,
 * and the pinned case failed on the assertion it named rather than drifting
 * silently into irrelevance. The case is kept, inverted, as the regression test.
 *
 * The pre-change figures are retained in that case and here so the direction of
 * the fix stays legible. **`discountAmount` and `taxableAmount` did not move** —
 * F.101 adjusted only how the document figure is split across lines, which is why
 * no historical document was re-stated.
 */

const MH = 'MH';
const KA = 'KA';

function line(id: string, hsn: string, rate: number, qty: number, price: number): SummaryLineInput {
  return { lineId: id, hsnCode: hsn, gstRate: rate, quantity: qty, unitPrice: price };
}

describe('computeTaxSummary — rate groups', () => {
  it('groups by distinct rate and orders ASCENDING even though the input is not', () => {
    // Seed Chain A's shape: 18 / 5 / 12 / 5. Deliberately not ascending, so a
    // missing sort fails here instead of passing by accident
    // (multi-rate.ts:350-356 makes the same argument for the fixture).
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [
        line('a', '85359090', 18, 3, 4150),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85044090', 12, 10, 8300),
        line('d', '85414300', 5, 3, 13325),
      ],
    });

    expect(s.byRate.map((g) => g.rate)).toEqual([5, 12, 18]);
    // The two 5% lines MERGE into one group — 9×13325 + 3×13325 = 159900.
    expect(s.byRate[0]!.taxableValue.toFixed(2)).toBe('159900.00');
    expect(s.byRate).toHaveLength(3);
  });

  it('a single-rate document yields ONE group — the existing case is a subset', () => {
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [line('a', '71131900', 3, 3, 4165), line('b', '71131900', 3, 7, 3571)],
    });
    expect(s.byRate).toHaveLength(1);
    expect(s.byRate[0]!.rate).toBe(3);
  });

  it('intra-state populates CGST/SGST at half rate and leaves IGST null', () => {
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [line('a', '85414300', 18, 1, 1000)],
    });
    const g = s.byRate[0]!;
    expect(g.cgstRate).toBe(9);
    expect(g.sgstRate).toBe(9);
    expect(g.igstRate).toBeNull();
    expect(g.cgstAmount.toFixed(2)).toBe('90.00');
    expect(g.sgstAmount.toFixed(2)).toBe('90.00');
    expect(g.igstAmount.toFixed(2)).toBe('0.00');
  });

  it('inter-state populates IGST at the full rate and leaves CGST/SGST null', () => {
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: KA,
      discount: null,
      lines: [line('a', '85414300', 18, 1, 1000)],
    });
    const g = s.byRate[0]!;
    expect(g.igstRate).toBe(18);
    expect(g.cgstRate).toBeNull();
    expect(g.sgstRate).toBeNull();
    expect(g.igstAmount.toFixed(2)).toBe('180.00');
    expect(g.cgstAmount.toFixed(2)).toBe('0.00');
    expect(g.sgstAmount.toFixed(2)).toBe('0.00');
  });

  it('never populates both CGST/SGST and IGST on the same group', () => {
    for (const pos of [MH, KA]) {
      const s = computeTaxSummary({
        tenantState: MH,
        placeOfSupply: pos,
        discount: null,
        lines: [line('a', '85414300', 18, 1, 1000), line('b', '85359090', 5, 2, 500)],
      });
      for (const g of s.byRate) {
        const intra = g.cgstAmount.plus(g.sgstAmount).greaterThan(0);
        const inter = g.igstAmount.greaterThan(0);
        expect(intra && inter).toBe(false);
      }
    }
  });
});

describe('computeTaxSummary — HSN rows are keyed on the (HSN, rate) PAIR', () => {
  it('one HSN carrying two rates yields TWO rows for it, THREE for the document', () => {
    // Seed Chain B's shape (multi-rate.ts:380-404): HSN 85414300 on an 18% line
    // AND a 5% line, plus a second HSN at 18%. THREE rows are correct, and every
    // row carries a non-null rate. Keying on HSN alone would give two rows, one
    // of which could not state its rate.
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: KA,
      discount: null,
      lines: [
        line('a', '85414300', 18, 4, 11125),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85359090', 18, 6, 4150),
      ],
    });

    expect(s.byRate).toHaveLength(2); // 5 and 18
    expect(s.byHsn).toHaveLength(3); // 85359090@18, 85414300@5, 85414300@18

    expect(s.byHsn.map((g) => [g.hsn, g.rate])).toEqual([
      ['85359090', 18],
      ['85414300', 5],
      ['85414300', 18],
    ]);

    // Every row states its rate. This is the property the nullable design lost.
    for (const g of s.byHsn) expect(g.rate).toBeTypeOf('number');

    // 4×11125 = 44500 at 18%, 9×13325 = 119925 at 5%, on the SAME HSN.
    const h18 = s.byHsn.find((g) => g.hsn === '85414300' && g.rate === 18)!;
    const h5 = s.byHsn.find((g) => g.hsn === '85414300' && g.rate === 5)!;
    expect(h18.taxableValue.toFixed(2)).toBe('44500.00');
    expect(h5.taxableValue.toFixed(2)).toBe('119925.00');
  });

  it('CONTROL: the two partitions differ in SIZE on that document', () => {
    // 2 rate groups, 3 HSN rows, 2 distinct HSN codes — three different numbers
    // from the same three lines. If byHsn ever returns 2, it has been re-keyed on
    // the HSN alone; if byRate ever returns 3, it has been keyed on the pair.
    const lines = [
      line('a', '85414300', 18, 4, 11125),
      line('b', '85414300', 5, 9, 13325),
      line('c', '85359090', 18, 6, 4150),
    ];
    const s = computeTaxSummary({ tenantState: MH, placeOfSupply: KA, discount: null, lines });
    expect(new Set(lines.map((l) => l.gstRate)).size).toBe(2);
    expect(new Set(lines.map((l) => l.hsnCode)).size).toBe(2);
    expect(new Set(lines.map((l) => `${l.hsnCode}|${l.gstRate}`)).size).toBe(3);
    expect(s.byRate).toHaveLength(2);
    expect(s.byHsn).toHaveLength(3);
  });

  it('merges lines that share BOTH the HSN and the rate', () => {
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [line('a', '71131900', 3, 3, 4165), line('b', '71131900', 3, 7, 3571)],
    });
    expect(s.byHsn).toHaveLength(1);
    expect(s.byHsn[0]!.taxableValue.toFixed(2)).toBe('37492.00');
  });

  it('orders by HSN ascending, then by rate ascending within an HSN', () => {
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [
        line('a', '85414300', 18, 1, 100),
        line('b', '71131900', 3, 1, 100),
        line('c', '85414300', 5, 1, 100),
        line('d', '85044090', 12, 1, 100),
      ],
    });
    expect(s.byHsn.map((g) => `${g.hsn}@${g.rate}`)).toEqual([
      '71131900@3',
      '85044090@12',
      '85414300@5',
      '85414300@18',
    ]);
  });

  it('intra-state HSN rows carry half rates; inter-state carry the full rate', () => {
    const intra = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [line('a', '85414300', 18, 1, 1000)],
    });
    expect(intra.byHsn[0]!.centralRate).toBe(9);
    expect(intra.byHsn[0]!.stateRate).toBe(9);
    expect(intra.byHsn[0]!.integratedRate).toBeNull();

    const inter = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: KA,
      discount: null,
      lines: [line('a', '85414300', 18, 1, 1000)],
    });
    expect(inter.byHsn[0]!.integratedRate).toBe(18);
    expect(inter.byHsn[0]!.centralRate).toBeNull();
    expect(inter.byHsn[0]!.stateRate).toBeNull();
  });
});

describe('computeTaxSummary — the reconciliation invariants (spec §4)', () => {
  const sumD = (xs: { toFixed: (n: number) => string }[]) =>
    xs.reduce((a, x) => a + Number(x.toFixed(2)), 0).toFixed(2);

  // UNDISCOUNTED cases. Here every identity holds EXACTLY, and that is the
  // contract F.3 ships. Rate counts 1, 2, 3, 4; both supply types; an HSN
  // carrying two rates; odd rupee subtotals that produce half-paisa ties on 3%
  // and 5% (whose intra-state halves are 1.5% and 2.5%).
  const exact: [string, string, string, SummaryLineInput[]][] = [
    ['1 rate, intra', MH, MH, [line('a', '71131900', 3, 3, 4165)]],
    ['1 rate, inter', MH, KA, [line('a', '71131900', 3, 3, 4165)]],
    [
      '2 rates, intra',
      MH,
      MH,
      [line('a', '85414300', 5, 9, 13325), line('b', '85359090', 18, 6, 4150)],
    ],
    [
      '2 rates, inter, one HSN carrying both',
      MH,
      KA,
      [
        line('a', '85414300', 18, 4, 11125),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85359090', 18, 6, 4150),
      ],
    ],
    [
      '3 rates, intra, two lines sharing a rate',
      MH,
      MH,
      [
        line('a', '85359090', 18, 3, 4150),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85044090', 12, 10, 8300),
        line('d', '85414300', 5, 3, 13325),
      ],
    ],
    [
      '4 rates, intra, odd rupee subtotals (half-paisa ties on 3% and 5%)',
      MH,
      MH,
      [
        line('a', '71131900', 3, 3, 4165),
        line('b', '85414300', 5, 7, 3571),
        line('c', '85044090', 12, 1, 12495),
        line('d', '85359090', 18, 1, 24997),
      ],
    ],
    [
      '4 rates, inter, odd rupee subtotals',
      MH,
      KA,
      [
        line('a', '71131900', 3, 7, 3571),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85044090', 12, 10, 8300),
        line('d', '85359090', 18, 3, 4150),
      ],
    ],
  ];

  it.each(exact)('UNDISCOUNTED — %s: all five identities hold exactly', (_l, ts, pos, lines) => {
    const s = computeTaxSummary({ tenantState: ts, placeOfSupply: pos, discount: null, lines });

    // 1 — sum(byRate.taxableValue) === totals.taxableValue
    expect(sumD(s.byRate.map((g) => g.taxableValue))).toBe(s.totals.taxableValue.toFixed(2));
    // 2 — sum(byHsn.taxableValue) === totals.taxableValue
    expect(sumD(s.byHsn.map((g) => g.taxableValue))).toBe(s.totals.taxableValue.toFixed(2));
    // 3 — every tax amount across byRate === totals.totalTax
    expect(sumD(s.byRate.map((g) => g.cgstAmount.plus(g.sgstAmount).plus(g.igstAmount)))).toBe(
      s.totals.totalTax.toFixed(2),
    );
    // 4 — the same across byHsn
    expect(sumD(s.byHsn.map((g) => g.totalTax))).toBe(s.totals.totalTax.toFixed(2));
    // 5 — the two partitions agree with EACH OTHER, not only with the total
    expect(sumD(s.byRate.map((g) => g.taxableValue))).toBe(
      sumD(s.byHsn.map((g) => g.taxableValue)),
    );
  });

  // DISCOUNTED cases. ALL FIVE identities now hold exactly, including the TAXABLE
  // ones (1, 2). Before F.101 they did not: the engine allocated the document
  // discount per line by independent proportional rounding, so the per-line
  // taxables summed a paisa UNDER the document figure. F.101 replaced that with a
  // largest-remainder allocation and the gap is closed at the source. The case
  // below that used to characterise the gap now asserts its absence.
  it('DISCOUNTED — the tax identities still hold exactly', () => {
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
    expect(sumD(s.byRate.map((g) => g.cgstAmount.plus(g.sgstAmount).plus(g.igstAmount)))).toBe(
      s.totals.totalTax.toFixed(2),
    );
    expect(sumD(s.byHsn.map((g) => g.totalTax))).toBe(s.totals.totalTax.toFixed(2));
    // The two partitions agree with each other even here.
    expect(sumD(s.byRate.map((g) => g.taxableValue))).toBe(
      sumD(s.byHsn.map((g) => g.taxableValue)),
    );
  });

  it('DISCOUNTED — grouped taxable equals the document figure exactly (F.101 regression)', () => {
    // THIS CASE WAS DELIBERATELY WRONG AND CAME DUE ON SCHEDULE. F.3 wrote it
    // asserting a figure one paisa under the document total, to pin an engine
    // defect F.3 was not allowed to fix, with the instruction: "When F.101 lands
    // and the per-line allocation sums exactly, this test MUST fail — that is its
    // job. Do not 'fix' it by loosening the comparison."
    //
    // F.101 landed and it failed, on exactly the assertion it named. The
    // pre-change figures are kept here so a future reader can tell which
    // direction the fix went: `byRate` and `byHsn` each summed to 210325.49
    // against a document `taxableValue` of 210325.50, a delta of 0.01.
    //
    // It is KEPT rather than deleted, now as the regression test for the fix on
    // the exact document that found the defect.
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

    // UNCHANGED, and that is the point: the document figure is the authority and
    // F.101 did not move it. Its survival is the proof that the fix adjusted the
    // ALLOCATION rather than recomputing the total from the parts — which is the
    // rejected fix that would have moved every historical discounted document.
    expect(s.totals.taxableValue.toFixed(2)).toBe('210325.50'); // document-level

    // Was '210325.49' before F.101, on both partitions.
    expect(sumD(s.byRate.map((g) => g.taxableValue))).toBe('210325.50'); // per-line
    expect(sumD(s.byHsn.map((g) => g.taxableValue))).toBe('210325.50');

    const delta =
      Number(s.totals.taxableValue.toFixed(2)) - Number(sumD(s.byRate.map((g) => g.taxableValue)));
    expect(delta.toFixed(2)).toBe('0.00'); // was '0.01'
  });

  it('CONTROL: the undiscounted document also has no delta', () => {
    // This control USED TO DISCRIMINATE and no longer does on its own, which is
    // worth stating rather than quietly dropping. Its job was to show the
    // characterised delta came from the discount allocation and not from grouping
    // being broken in general: discounted document 0.01, undiscounted 0.00. After
    // F.101 both are 0.00, so the contrast is gone.
    //
    // It is KEPT because "the undiscounted path still reconciles" is a real claim
    // that would catch a grouping regression, and D-5 says not to simply delete a
    // control. What replaces its discriminating power is the case below, which
    // asserts the identity that was FALSE before F.101 and is true after.
    const lines = [
      line('a', '71131900', 3, 7, 3571),
      line('b', '85414300', 5, 9, 13325),
      line('c', '85044090', 12, 10, 8300),
      line('d', '85359090', 18, 3, 4150),
    ];
    const s = computeTaxSummary({ tenantState: MH, placeOfSupply: KA, discount: null, lines });
    expect(sumD(s.byRate.map((g) => g.taxableValue))).toBe(s.totals.taxableValue.toFixed(2));
  });

  it('the per-line discounts sum to the document discount EXACTLY — the F.101 identity', () => {
    // THE REPLACEMENT DISCRIMINATOR. This assertion was false before F.101 on this
    // exact document — sum(lineDiscount) came to 30046.51 against a document
    // discount of 30046.50 — so it fails against the old allocation and passes
    // against the new one. The taxable identities above are downstream of it:
    // lineTaxable is lineSubtotal minus lineDiscount, so if the discounts sum
    // exactly, the taxables must too.
    const out = computeTax({
      tenantState: MH,
      placeOfSupply: KA,
      discount: { type: 'percent', value: 12.5 },
      lines: [
        { lineId: 'a', quantity: 7, unitPrice: 3571, gstRate: 3 },
        { lineId: 'b', quantity: 9, unitPrice: 13325, gstRate: 5 },
        { lineId: 'c', quantity: 10, unitPrice: 8300, gstRate: 12 },
        { lineId: 'd', quantity: 3, unitPrice: 4150, gstRate: 18 },
      ],
    });
    expect(sumD(out.lines.map((l) => l.lineDiscount))).toBe(out.discountAmount.toFixed(2));
    expect(out.discountAmount.toFixed(2)).toBe('30046.50'); // unchanged by F.101
    expect(sumD(out.lines.map((l) => l.lineTaxable))).toBe(out.taxableAmount.toFixed(2));
  });

  it('per-line rounding is preserved — a group total is NOT re-rounded', () => {
    // F.84's measured case: two odd-rupee 3% lines intra-state give CGST 562.39
    // summed per line, against 562.38 if the group's taxable value were taxed and
    // rounded once. The first is correct because the stored headers are sums of
    // per-line figures.
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [line('a', '71131900', 3, 3, 4165), line('b', '71131900', 3, 7, 3571)],
    });
    expect(s.byRate[0]!.cgstAmount.toFixed(2)).toBe('562.39');

    // And the group-level alternative really does differ, so the assertion above
    // is discriminating rather than decorative: 37492 × 1.5% = 562.38.
    expect((37492 * 0.015).toFixed(2)).toBe('562.38');
  });

  it('an empty rate group never appears — groups come from lines, not a list', () => {
    const s = computeTaxSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [line('a', '85414300', 18, 1, 100)],
    });
    expect(s.byRate.map((g) => g.rate)).toEqual([18]);
    expect(s.byRate.some((g) => g.taxableValue.isZero())).toBe(false);
  });
});

describe('computeRateSummary — the rate-only entry point cannot drift from the full one', () => {
  // The builder's live preview has no HSN to group by, so it calls this instead
  // of feeding a placeholder HSN into computeTaxSummary and ignoring byHsn. These
  // tests exist because two entry points are two things to get subtly wrong
  // independently — the same argument that merged the two Zod rate rules into one
  // schema on the F.55 day.
  const shapes: [
    string,
    string,
    string,
    SummaryLineInput[],
    { type: 'percent'; value: number } | null,
  ][] = [
    ['single rate intra', MH, MH, [line('a', '71131900', 3, 3, 4165)], null],
    [
      'three rates intra, unsorted input',
      MH,
      MH,
      [
        line('a', '85359090', 18, 3, 4150),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85044090', 12, 10, 8300),
        line('d', '85414300', 5, 3, 13325),
      ],
      null,
    ],
    [
      'two rates inter, one HSN carrying both',
      MH,
      KA,
      [
        line('a', '85414300', 18, 4, 11125),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85359090', 18, 6, 4150),
      ],
      null,
    ],
    [
      'discounted, four rates inter',
      MH,
      KA,
      [
        line('a', '71131900', 3, 7, 3571),
        line('b', '85414300', 5, 9, 13325),
        line('c', '85044090', 12, 10, 8300),
        line('d', '85359090', 18, 3, 4150),
      ],
      { type: 'percent', value: 12.5 },
    ],
  ];

  it.each(shapes)(
    '%s — byRate and totals are identical either way',
    (_l, ts, pos, lines, discount) => {
      const full = computeTaxSummary({ tenantState: ts, placeOfSupply: pos, discount, lines });
      const rateOnly = computeRateSummary({
        tenantState: ts,
        placeOfSupply: pos,
        discount,
        // The HSN is DROPPED here — that is the whole point of the entry point.
        lines: lines.map(({ lineId, quantity, unitPrice, gstRate }) => ({
          lineId,
          quantity,
          unitPrice,
          gstRate,
        })),
      });

      expect(rateOnly.isInterState).toBe(full.isInterState);
      expect(rateOnly.byRate.map((g) => g.rate)).toEqual(full.byRate.map((g) => g.rate));
      expect(rateOnly.byRate.map((g) => g.taxableValue.toFixed(2))).toEqual(
        full.byRate.map((g) => g.taxableValue.toFixed(2)),
      );
      expect(rateOnly.byRate.map((g) => g.cgstAmount.toFixed(2))).toEqual(
        full.byRate.map((g) => g.cgstAmount.toFixed(2)),
      );
      expect(rateOnly.byRate.map((g) => g.sgstAmount.toFixed(2))).toEqual(
        full.byRate.map((g) => g.sgstAmount.toFixed(2)),
      );
      expect(rateOnly.byRate.map((g) => g.igstAmount.toFixed(2))).toEqual(
        full.byRate.map((g) => g.igstAmount.toFixed(2)),
      );
      expect(rateOnly.totals.totalTax.toFixed(2)).toBe(full.totals.totalTax.toFixed(2));
      expect(rateOnly.totals.grandTotal.toFixed(2)).toBe(full.totals.grandTotal.toFixed(2));
    },
  );

  it('returns no byHsn field at all — it cannot fabricate one', () => {
    const r = computeRateSummary({
      tenantState: MH,
      placeOfSupply: MH,
      discount: null,
      lines: [{ lineId: 'a', quantity: 1, unitPrice: 100, gstRate: 18 }],
    });
    expect('byHsn' in r).toBe(false);
  });
});
