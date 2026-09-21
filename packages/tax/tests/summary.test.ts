import { describe, expect, it } from 'vitest';

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
 * ## The discount paisa, and why one identity is asserted differently
 *
 * `computeTax` derives `discountAmount` at DOCUMENT level but allocates and
 * rounds the discount PER LINE, so `sum(lineDiscount)` can exceed
 * `discountAmount` by a paisa and `sum(lineTaxable)` can fall short of
 * `taxableAmount` by the same paisa. Measured: a 4-rate inter-state document at
 * 12.5% gives 30046.51 against 30046.50, and 210325.49 against 210325.50.
 *
 * **That is a pre-existing engine defect, not a grouping defect, and F.3 is not
 * allowed to fix it** (`packages/tax` behaviour is protected; day prompt D-1's
 * stop condition). It is **F.101**, sequenced before F.4. So the taxable-value
 * identities are asserted EXACTLY on undiscounted documents, and the known delta
 * is CHARACTERISED on discounted ones — pinned, so that when F.101 lands, these
 * tests fail loudly and are updated deliberately rather than drifting.
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

  // DISCOUNTED cases. The tax identities (3, 4, 5) still hold exactly, because
  // taxes are summed per line on both sides. The TAXABLE identities (1, 2) do
  // not, and the reason is F.101 rather than anything in this module — see the
  // file docblock. Characterised, not skipped.
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

  it('CONTROL: the same document WITHOUT the discount has no delta', () => {
    // Without this, the test above could be passing because the grouping is
    // broken in general rather than because the discount allocation is.
    const lines = [
      line('a', '71131900', 3, 7, 3571),
      line('b', '85414300', 5, 9, 13325),
      line('c', '85044090', 12, 10, 8300),
      line('d', '85359090', 18, 3, 4150),
    ];
    const s = computeTaxSummary({ tenantState: MH, placeOfSupply: KA, discount: null, lines });
    expect(sumD(s.byRate.map((g) => g.taxableValue))).toBe(s.totals.taxableValue.toFixed(2));
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
