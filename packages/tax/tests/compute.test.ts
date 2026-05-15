import { describe, expect, it } from 'vitest';

import { computeTax } from '../src/compute';
import { TaxComputationError } from '../src/types';
import type { TaxComputationInput, TaxComputationOutput } from '../src/types';

/**
 * Day 9 — authoritative GST engine test suite.
 *
 * Money assertions compare `.toFixed(2)` strings, never Decimal/number
 * equality — strings make a failure show the exact paise that drifted.
 */

const MH = 'Maharashtra';
const KA = 'Karnataka';

/** Build a single-line input with sensible defaults. */
function oneLine(
  quantity: number | string,
  unitPrice: number | string,
  gstRate: 0 | 5 | 12 | 18 | 28,
  opts: Partial<Pick<TaxComputationInput, 'tenantState' | 'placeOfSupply' | 'discount'>> = {},
): TaxComputationInput {
  return {
    tenantState: opts.tenantState ?? MH,
    placeOfSupply: opts.placeOfSupply ?? MH,
    lines: [{ lineId: 'L1', quantity, unitPrice, gstRate }],
    discount: opts.discount ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 1 — basic intra-state', () => {
  it('100 panels @ ₹15,000 @ 18% — CGST + SGST split', () => {
    const r = computeTax(oneLine(100, 15000, 18));
    expect(r.isInterState).toBe(false);
    expect(r.subtotal.toFixed(2)).toBe('1500000.00');
    expect(r.discountAmount.toFixed(2)).toBe('0.00');
    expect(r.taxableAmount.toFixed(2)).toBe('1500000.00');
    expect(r.cgstAmount.toFixed(2)).toBe('135000.00');
    expect(r.sgstAmount.toFixed(2)).toBe('135000.00');
    expect(r.igstAmount.toFixed(2)).toBe('0.00');
    expect(r.totalAmount.toFixed(2)).toBe('1770000.00');
  });

  it('1 unit @ ₹1.00 @ 18% — paise-level split', () => {
    const r = computeTax(oneLine(1, '1.00', 18));
    expect(r.cgstAmount.toFixed(2)).toBe('0.09');
    expect(r.sgstAmount.toFixed(2)).toBe('0.09');
    expect(r.igstAmount.toFixed(2)).toBe('0.00');
    expect(r.totalAmount.toFixed(2)).toBe('1.18');
  });

  it('0% GST line (exempt goods) — zero tax, total equals taxable', () => {
    const r = computeTax(oneLine(1, 10000, 0));
    expect(r.cgstAmount.toFixed(2)).toBe('0.00');
    expect(r.sgstAmount.toFixed(2)).toBe('0.00');
    expect(r.totalAmount.toFixed(2)).toBe('10000.00');
  });

  it('5% GST rate — CGST + SGST at 2.5% each', () => {
    const r = computeTax(oneLine(10, 1000, 5));
    expect(r.cgstAmount.toFixed(2)).toBe('250.00');
    expect(r.sgstAmount.toFixed(2)).toBe('250.00');
    expect(r.totalAmount.toFixed(2)).toBe('10500.00');
  });

  it('28% GST rate — CGST + SGST at 14% each', () => {
    const r = computeTax(oneLine(1, 1000, 28));
    expect(r.cgstAmount.toFixed(2)).toBe('140.00');
    expect(r.sgstAmount.toFixed(2)).toBe('140.00');
    expect(r.totalAmount.toFixed(2)).toBe('1280.00');
  });

  it('fractional quantity (2.5 units) @ 18%', () => {
    const r = computeTax(oneLine('2.5', 100, 18));
    expect(r.subtotal.toFixed(2)).toBe('250.00');
    expect(r.cgstAmount.toFixed(2)).toBe('22.50');
    expect(r.sgstAmount.toFixed(2)).toBe('22.50');
    expect(r.totalAmount.toFixed(2)).toBe('295.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 2 — basic inter-state', () => {
  it('100 panels @ ₹15,000 @ 18% — IGST only', () => {
    const r = computeTax(oneLine(100, 15000, 18, { placeOfSupply: KA }));
    expect(r.isInterState).toBe(true);
    expect(r.cgstAmount.toFixed(2)).toBe('0.00');
    expect(r.sgstAmount.toFixed(2)).toBe('0.00');
    expect(r.igstAmount.toFixed(2)).toBe('270000.00');
    expect(r.totalAmount.toFixed(2)).toBe('1770000.00');
  });

  it('cross-check — inter-state IGST equals intra-state CGST+SGST', () => {
    const intra = computeTax(oneLine(100, 15000, 18));
    const inter = computeTax(oneLine(100, 15000, 18, { placeOfSupply: KA }));
    expect(inter.igstAmount.toFixed(2)).toBe(intra.cgstAmount.plus(intra.sgstAmount).toFixed(2));
    expect(inter.totalAmount.toFixed(2)).toBe(intra.totalAmount.toFixed(2));
  });

  it('12% inter-state single line', () => {
    const r = computeTax(oneLine(5, 2000, 12, { placeOfSupply: KA }));
    expect(r.igstAmount.toFixed(2)).toBe('1200.00');
    expect(r.totalAmount.toFixed(2)).toBe('11200.00');
  });

  it('0% inter-state — no IGST', () => {
    const r = computeTax(oneLine(1, 5000, 0, { placeOfSupply: KA }));
    expect(r.igstAmount.toFixed(2)).toBe('0.00');
    expect(r.totalAmount.toFixed(2)).toBe('5000.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 3 — mixed GST rates in one quotation', () => {
  it('panels @ 18% + accessories @ 12%, intra-state', () => {
    const r = computeTax({
      tenantState: MH,
      placeOfSupply: MH,
      lines: [
        { lineId: 'A', quantity: 100, unitPrice: 15000, gstRate: 18 },
        { lineId: 'B', quantity: 50, unitPrice: 200, gstRate: 12 },
      ],
      discount: null,
    });
    expect(r.subtotal.toFixed(2)).toBe('1510000.00');
    expect(r.cgstAmount.toFixed(2)).toBe('135600.00'); // 135000 + 600
    expect(r.sgstAmount.toFixed(2)).toBe('135600.00');
    expect(r.totalAmount.toFixed(2)).toBe('1781200.00');
  });

  it('panels + inverter @ 18% + service @ 0%, intra-state', () => {
    const r = computeTax({
      tenantState: MH,
      placeOfSupply: MH,
      lines: [
        { lineId: 'A', quantity: 10, unitPrice: 15000, gstRate: 18 },
        { lineId: 'B', quantity: 5, unitPrice: 20000, gstRate: 18 },
        { lineId: 'C', quantity: 1, unitPrice: 5000, gstRate: 0 },
      ],
      discount: null,
    });
    expect(r.subtotal.toFixed(2)).toBe('255000.00');
    expect(r.cgstAmount.toFixed(2)).toBe('22500.00'); // 13500 + 9000 + 0
    expect(r.sgstAmount.toFixed(2)).toBe('22500.00');
    expect(r.lines[2]!.lineTaxTotal.toFixed(2)).toBe('0.00'); // service untaxed
    expect(r.totalAmount.toFixed(2)).toBe('300000.00');
  });

  it('all four GST rates (5, 12, 18, 28) in one quotation, intra-state', () => {
    const r = computeTax({
      tenantState: MH,
      placeOfSupply: MH,
      lines: [
        { lineId: 'A', quantity: 10, unitPrice: 1000, gstRate: 5 },
        { lineId: 'B', quantity: 10, unitPrice: 1000, gstRate: 12 },
        { lineId: 'C', quantity: 10, unitPrice: 1000, gstRate: 18 },
        { lineId: 'D', quantity: 10, unitPrice: 1000, gstRate: 28 },
      ],
      discount: null,
    });
    expect(r.subtotal.toFixed(2)).toBe('40000.00');
    expect(r.cgstAmount.toFixed(2)).toBe('3150.00'); // 250+600+900+1400
    expect(r.sgstAmount.toFixed(2)).toBe('3150.00');
    expect(r.totalAmount.toFixed(2)).toBe('46300.00');
  });

  it('mixed rates inter-state — each line taxed at its own IGST rate', () => {
    const r = computeTax({
      tenantState: MH,
      placeOfSupply: KA,
      lines: [
        { lineId: 'A', quantity: 10, unitPrice: 14000, gstRate: 18 },
        { lineId: 'B', quantity: 5, unitPrice: 2000, gstRate: 12 },
      ],
      discount: null,
    });
    expect(r.subtotal.toFixed(2)).toBe('150000.00');
    expect(r.igstAmount.toFixed(2)).toBe('26400.00'); // 25200 + 1200
    expect(r.totalAmount.toFixed(2)).toBe('176400.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 4 — discount application', () => {
  it('10% percent discount, 18% intra-state', () => {
    const r = computeTax(oneLine(10, 10000, 18, { discount: { type: 'percent', value: 10 } }));
    expect(r.subtotal.toFixed(2)).toBe('100000.00');
    expect(r.discountAmount.toFixed(2)).toBe('10000.00');
    expect(r.taxableAmount.toFixed(2)).toBe('90000.00');
    expect(r.cgstAmount.toFixed(2)).toBe('8100.00');
    expect(r.sgstAmount.toFixed(2)).toBe('8100.00');
    expect(r.totalAmount.toFixed(2)).toBe('106200.00');
  });

  it('₹5,000 amount discount, 18% inter-state', () => {
    const r = computeTax(
      oneLine(10, 10000, 18, { placeOfSupply: KA, discount: { type: 'amount', value: 5000 } }),
    );
    expect(r.discountAmount.toFixed(2)).toBe('5000.00');
    expect(r.taxableAmount.toFixed(2)).toBe('95000.00');
    expect(r.igstAmount.toFixed(2)).toBe('17100.00');
    expect(r.totalAmount.toFixed(2)).toBe('112100.00');
  });

  it('50% discount across multi-line mixed-rate — proportional allocation', () => {
    const r = computeTax({
      tenantState: MH,
      placeOfSupply: KA,
      lines: [
        { lineId: 'A', quantity: 1, unitPrice: 1000, gstRate: 18 },
        { lineId: 'B', quantity: 1, unitPrice: 1000, gstRate: 12 },
      ],
      discount: { type: 'percent', value: 50 },
    });
    expect(r.taxableAmount.toFixed(2)).toBe('1000.00');
    expect(r.lines[0]!.lineDiscount.toFixed(2)).toBe('500.00');
    expect(r.lines[1]!.lineDiscount.toFixed(2)).toBe('500.00');
    expect(r.lines[0]!.lineIgst.toFixed(2)).toBe('90.00'); // 500 * 18%
    expect(r.lines[1]!.lineIgst.toFixed(2)).toBe('60.00'); // 500 * 12%
    expect(r.igstAmount.toFixed(2)).toBe('150.00');
    expect(r.totalAmount.toFixed(2)).toBe('1150.00');
  });

  it('100% percent discount — taxable 0, all taxes 0, total 0', () => {
    const r = computeTax(oneLine(1, 1000, 18, { discount: { type: 'percent', value: 100 } }));
    expect(r.taxableAmount.toFixed(2)).toBe('0.00');
    expect(r.cgstAmount.toFixed(2)).toBe('0.00');
    expect(r.sgstAmount.toFixed(2)).toBe('0.00');
    expect(r.igstAmount.toFixed(2)).toBe('0.00');
    expect(r.totalAmount.toFixed(2)).toBe('0.00');
  });

  it('0% percent discount — identical to no discount', () => {
    const withZero = computeTax(oneLine(1, 1000, 18, { discount: { type: 'percent', value: 0 } }));
    const without = computeTax(oneLine(1, 1000, 18));
    expect(withZero.totalAmount.toFixed(2)).toBe(without.totalAmount.toFixed(2));
    expect(withZero.totalAmount.toFixed(2)).toBe('1180.00');
  });

  it('amount discount exactly equal to subtotal — taxable 0, allowed', () => {
    const r = computeTax(oneLine(1, 1000, 18, { discount: { type: 'amount', value: 1000 } }));
    expect(r.taxableAmount.toFixed(2)).toBe('0.00');
    expect(r.totalAmount.toFixed(2)).toBe('0.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 5 — rounding edge cases', () => {
  it('fractional paise — 1 unit @ ₹333.33 @ 18% intra-state', () => {
    // 333.33 * 0.09 = 29.9997 → rounds to 30.00
    const r = computeTax(oneLine(1, '333.33', 18));
    expect(r.cgstAmount.toFixed(2)).toBe('30.00');
    expect(r.sgstAmount.toFixed(2)).toBe('30.00');
    expect(r.totalAmount.toFixed(2)).toBe('393.33');
  });

  it('half-up tie — ₹2.50 @ 18% intra-state rounds 0.225 → 0.23', () => {
    const r = computeTax(oneLine(1, '2.50', 18));
    expect(r.cgstAmount.toFixed(2)).toBe('0.23');
    expect(r.sgstAmount.toFixed(2)).toBe('0.23');
    expect(r.totalAmount.toFixed(2)).toBe('2.96');
  });

  it('penny-precision — ₹0.01 line @ 18% intra-state rounds tax to 0.00', () => {
    const r = computeTax(oneLine(1, '0.01', 18));
    expect(r.cgstAmount.toFixed(2)).toBe('0.00');
    expect(r.sgstAmount.toFixed(2)).toBe('0.00');
    expect(r.totalAmount.toFixed(2)).toBe('0.01');
  });

  it('line-level rounding — document tax equals the sum of rounded line taxes', () => {
    const r = computeTax({
      tenantState: MH,
      placeOfSupply: MH,
      lines: [
        { lineId: 'A', quantity: 3, unitPrice: '111.11', gstRate: 18 },
        { lineId: 'B', quantity: 7, unitPrice: '333.33', gstRate: 5 },
        { lineId: 'C', quantity: 1, unitPrice: '999.99', gstRate: 28 },
      ],
      discount: null,
    });
    const summed = r.lines.reduce(
      (acc, l) => acc.plus(l.lineCgst).plus(l.lineSgst).plus(l.lineIgst),
      r.lines[0]!.lineCgst.minus(r.lines[0]!.lineCgst), // Decimal(0)
    );
    expect(r.cgstAmount.plus(r.sgstAmount).plus(r.igstAmount).toFixed(2)).toBe(summed.toFixed(2));
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 6 — validation errors', () => {
  function expectCode(fn: () => unknown, code: string): void {
    try {
      fn();
      throw new Error('expected computeTax to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TaxComputationError);
      expect((err as TaxComputationError).code).toBe(code);
    }
  }

  it('empty lines → EMPTY_LINES', () => {
    expectCode(
      () => computeTax({ tenantState: MH, placeOfSupply: MH, lines: [], discount: null }),
      'EMPTY_LINES',
    );
  });

  it('zero quantity → NEGATIVE_QUANTITY', () => {
    expectCode(() => computeTax(oneLine(0, 1000, 18)), 'NEGATIVE_QUANTITY');
  });

  it('negative quantity → NEGATIVE_QUANTITY', () => {
    expectCode(() => computeTax(oneLine(-5, 1000, 18)), 'NEGATIVE_QUANTITY');
  });

  it('negative unit price → NEGATIVE_UNIT_PRICE', () => {
    expectCode(() => computeTax(oneLine(1, -1000, 18)), 'NEGATIVE_UNIT_PRICE');
  });

  it('invalid GST rate (10) → INVALID_GST_RATE', () => {
    expectCode(() => computeTax(oneLine(1, 1000, 10 as unknown as 18)), 'INVALID_GST_RATE');
  });

  it('invalid GST rate (100) → INVALID_GST_RATE', () => {
    expectCode(() => computeTax(oneLine(1, 1000, 100 as unknown as 18)), 'INVALID_GST_RATE');
  });

  it('negative discount → NEGATIVE_DISCOUNT', () => {
    expectCode(
      () => computeTax(oneLine(1, 1000, 18, { discount: { type: 'amount', value: -100 } })),
      'NEGATIVE_DISCOUNT',
    );
  });

  it('discount percent > 100 → DISCOUNT_PERCENT_OUT_OF_RANGE', () => {
    expectCode(
      () => computeTax(oneLine(1, 1000, 18, { discount: { type: 'percent', value: 150 } })),
      'DISCOUNT_PERCENT_OUT_OF_RANGE',
    );
  });

  it('discount amount > subtotal → DISCOUNT_EXCEEDS_SUBTOTAL', () => {
    expectCode(
      () => computeTax(oneLine(1, 1000, 18, { discount: { type: 'amount', value: 5000 } })),
      'DISCOUNT_EXCEEDS_SUBTOTAL',
    );
  });

  it('empty tenant state → EMPTY_STATE', () => {
    expectCode(() => computeTax(oneLine(1, 1000, 18, { tenantState: '   ' })), 'EMPTY_STATE');
  });

  it('empty place of supply → EMPTY_STATE', () => {
    expectCode(() => computeTax(oneLine(1, 1000, 18, { placeOfSupply: '' })), 'EMPTY_STATE');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 7 — state comparison (DEV.33 — opaque strings)', () => {
  it('full state names — different states → inter-state', () => {
    expect(computeTax(oneLine(1, 100, 18, { placeOfSupply: KA })).isInterState).toBe(true);
  });

  it('identical full names → intra-state', () => {
    expect(computeTax(oneLine(1, 100, 18, { placeOfSupply: MH })).isInterState).toBe(false);
  });

  it('different case is treated as different state → inter-state (case-sensitive)', () => {
    // Engine does an exact match; if real data ever differs only by case it
    // is a data inconsistency to log as DEV.34, not something to mask here.
    const r = computeTax(
      oneLine(1, 100, 18, { tenantState: 'Maharashtra', placeOfSupply: 'maharashtra' }),
    );
    expect(r.isInterState).toBe(true);
  });

  it('trailing/leading whitespace is trimmed before comparison', () => {
    const r = computeTax(
      oneLine(1, 100, 18, { tenantState: '  Maharashtra ', placeOfSupply: 'Maharashtra' }),
    );
    expect(r.isInterState).toBe(false);
  });

  it('multi-word state names compare correctly', () => {
    const same = computeTax(
      oneLine(1, 100, 18, { tenantState: 'Tamil Nadu', placeOfSupply: 'Tamil Nadu' }),
    );
    const diff = computeTax(
      oneLine(1, 100, 18, { tenantState: 'Tamil Nadu', placeOfSupply: 'Andhra Pradesh' }),
    );
    expect(same.isInterState).toBe(false);
    expect(diff.isInterState).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 8 — real-world distributor scenarios', () => {
  it('5 panels @ ₹15,000 @ 18% intra-state — ₹88,500 total', () => {
    const r = computeTax(oneLine(5, 15000, 18));
    expect(r.cgstAmount.toFixed(2)).toBe('6750.00');
    expect(r.sgstAmount.toFixed(2)).toBe('6750.00');
    expect(r.totalAmount.toFixed(2)).toBe('88500.00');
  });

  it('100 panels @ ₹14,800 @ 18% inter-state, ₹50,000 discount', () => {
    const r = computeTax(
      oneLine(100, 14800, 18, { placeOfSupply: KA, discount: { type: 'amount', value: 50000 } }),
    );
    expect(r.subtotal.toFixed(2)).toBe('1480000.00');
    expect(r.discountAmount.toFixed(2)).toBe('50000.00');
    expect(r.taxableAmount.toFixed(2)).toBe('1430000.00');
    expect(r.igstAmount.toFixed(2)).toBe('257400.00');
    expect(r.totalAmount.toFixed(2)).toBe('1687400.00');
  });

  it('mixed quote — panels (18%) + clamps (12%) + service (0%) intra, 5% discount', () => {
    const r = computeTax({
      tenantState: MH,
      placeOfSupply: MH,
      lines: [
        { lineId: 'PANEL', quantity: 50, unitPrice: 15000, gstRate: 18 },
        { lineId: 'CLAMP', quantity: 50, unitPrice: 100, gstRate: 12 },
        { lineId: 'SERVICE', quantity: 1, unitPrice: 25000, gstRate: 0 },
      ],
      discount: { type: 'percent', value: 5 },
    });
    expect(r.subtotal.toFixed(2)).toBe('780000.00');
    expect(r.discountAmount.toFixed(2)).toBe('39000.00');
    expect(r.taxableAmount.toFixed(2)).toBe('741000.00');
    // per-line discount allocation
    expect(r.lines[0]!.lineDiscount.toFixed(2)).toBe('37500.00');
    expect(r.lines[1]!.lineDiscount.toFixed(2)).toBe('250.00');
    expect(r.lines[2]!.lineDiscount.toFixed(2)).toBe('1250.00');
    // per-line tax at own rate on discounted base
    expect(r.lines[0]!.lineCgst.toFixed(2)).toBe('64125.00'); // 712500 * 9%
    expect(r.lines[1]!.lineCgst.toFixed(2)).toBe('285.00'); //   4750 * 6%
    expect(r.lines[2]!.lineTaxTotal.toFixed(2)).toBe('0.00');
    expect(r.cgstAmount.toFixed(2)).toBe('64410.00');
    expect(r.sgstAmount.toFixed(2)).toBe('64410.00');
    expect(r.totalAmount.toFixed(2)).toBe('869820.00');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Suite 9 — output structure invariants', () => {
  const fixtures: TaxComputationInput[] = [
    oneLine(100, 15000, 18),
    oneLine(100, 15000, 18, { placeOfSupply: KA }),
    oneLine(1, '333.33', 18),
    oneLine(7, '111.11', 5, { discount: { type: 'percent', value: 12.5 } }),
    {
      tenantState: MH,
      placeOfSupply: MH,
      lines: [
        { lineId: 'A', quantity: 13, unitPrice: '777.77', gstRate: 18 },
        { lineId: 'B', quantity: 4, unitPrice: '250.50', gstRate: 12 },
        { lineId: 'C', quantity: 9, unitPrice: '1000', gstRate: 28 },
      ],
      discount: { type: 'amount', value: 1234 },
    },
    {
      tenantState: MH,
      placeOfSupply: KA,
      lines: [
        { lineId: 'A', quantity: 50, unitPrice: 15000, gstRate: 18 },
        { lineId: 'B', quantity: 50, unitPrice: 100, gstRate: 12 },
        { lineId: 'C', quantity: 1, unitPrice: 25000, gstRate: 0 },
      ],
      discount: { type: 'percent', value: 5 },
    },
  ];

  function run(): TaxComputationOutput[] {
    return fixtures.map((f) => computeTax(f));
  }

  it('lines.length equals input lines length', () => {
    run().forEach((out, i) => {
      expect(out.lines.length).toBe(fixtures[i]!.lines.length);
    });
  });

  it('sum of line subtotals equals document subtotal', () => {
    run().forEach((out) => {
      const summed = out.lines.reduce(
        (acc, l) => acc.plus(l.lineSubtotal),
        out.subtotal.minus(out.subtotal),
      );
      expect(summed.toFixed(2)).toBe(out.subtotal.toFixed(2));
    });
  });

  it('subtotal − discountAmount equals taxableAmount exactly', () => {
    run().forEach((out) => {
      expect(out.subtotal.minus(out.discountAmount).toFixed(2)).toBe(out.taxableAmount.toFixed(2));
    });
  });

  it('cgst + sgst + igst equals the sum of per-line tax totals', () => {
    run().forEach((out) => {
      const lineTax = out.lines.reduce(
        (acc, l) => acc.plus(l.lineTaxTotal),
        out.subtotal.minus(out.subtotal),
      );
      expect(out.cgstAmount.plus(out.sgstAmount).plus(out.igstAmount).toFixed(2)).toBe(
        lineTax.toFixed(2),
      );
    });
  });

  it('inter-state outputs have zero CGST and SGST', () => {
    run().forEach((out) => {
      if (out.isInterState) {
        expect(out.cgstAmount.toFixed(2)).toBe('0.00');
        expect(out.sgstAmount.toFixed(2)).toBe('0.00');
      }
    });
  });

  it('intra-state outputs have zero IGST', () => {
    run().forEach((out) => {
      if (!out.isInterState) {
        expect(out.igstAmount.toFixed(2)).toBe('0.00');
      }
    });
  });

  it('totalAmount equals taxableAmount + cgst + sgst + igst exactly', () => {
    run().forEach((out) => {
      expect(
        out.taxableAmount.plus(out.cgstAmount).plus(out.sgstAmount).plus(out.igstAmount).toFixed(2),
      ).toBe(out.totalAmount.toFixed(2));
    });
  });

  it('every line: lineTaxable + lineTaxTotal equals lineTotal', () => {
    run().forEach((out) => {
      out.lines.forEach((l) => {
        expect(l.lineTaxable.plus(l.lineTaxTotal).toFixed(2)).toBe(l.lineTotal.toFixed(2));
      });
    });
  });
});
