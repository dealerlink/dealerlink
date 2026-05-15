import { describe, expect, it } from 'vitest';

import { computeQuotationTotals } from './preview';

describe('computeQuotationTotals', () => {
  it('intra-state single line — CGST + SGST split', () => {
    // MH tenant → MH dealer, 100 panels @ ₹15,000 @ 18% GST
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'MH',
      lines: [{ quantity: 100, unitPrice: 15000, gstRate: 18 }],
      discount: null,
    });
    expect(r.isInterState).toBe(false);
    expect(r.subtotal).toBe(1_500_000);
    expect(r.discountAmount).toBe(0);
    expect(r.taxableAmount).toBe(1_500_000);
    expect(r.cgst).toBe(135_000);
    expect(r.sgst).toBe(135_000);
    expect(r.igst).toBe(0);
    expect(r.total).toBe(1_770_000);
  });

  it('inter-state single line — IGST only', () => {
    // MH tenant → KA dealer, 100 panels @ ₹15,000 @ 18% GST
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'KA',
      lines: [{ quantity: 100, unitPrice: 15000, gstRate: 18 }],
      discount: null,
    });
    expect(r.isInterState).toBe(true);
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.igst).toBe(270_000);
    expect(r.total).toBe(1_770_000);
  });

  it('mixed GST rates within one quotation (18% panels + 12% accessories)', () => {
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'KA',
      lines: [
        { quantity: 10, unitPrice: 14000, gstRate: 18 }, // 140000 → IGST 25200
        { quantity: 5, unitPrice: 2000, gstRate: 12 }, //  10000 → IGST  1200
      ],
      discount: null,
    });
    expect(r.subtotal).toBe(150_000);
    expect(r.igst).toBe(26_400);
    expect(r.total).toBe(176_400);
  });

  it('percent discount applied before tax', () => {
    // ₹1,000,000 subtotal, 10% discount → taxable 900,000, IGST 18% = 162,000
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'KA',
      lines: [{ quantity: 100, unitPrice: 10000, gstRate: 18 }],
      discount: { type: 'percent', value: 10 },
    });
    expect(r.subtotal).toBe(1_000_000);
    expect(r.discountAmount).toBe(100_000);
    expect(r.taxableAmount).toBe(900_000);
    expect(r.igst).toBe(162_000);
    expect(r.total).toBe(1_062_000);
  });

  it('amount discount applied before tax', () => {
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'MH',
      lines: [{ quantity: 10, unitPrice: 10000, gstRate: 18 }],
      discount: { type: 'amount', value: 10000 },
    });
    expect(r.subtotal).toBe(100_000);
    expect(r.discountAmount).toBe(10_000);
    expect(r.taxableAmount).toBe(90_000);
    expect(r.cgst).toBe(8_100);
    expect(r.sgst).toBe(8_100);
    expect(r.total).toBe(106_200);
  });

  it('zero discount', () => {
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'MH',
      lines: [{ quantity: 1, unitPrice: 1000, gstRate: 18 }],
      discount: null,
    });
    expect(r.discountAmount).toBe(0);
    expect(r.total).toBe(1180);
  });

  it('zero GST rate line (exempt services)', () => {
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'MH',
      lines: [
        { quantity: 1, unitPrice: 10000, gstRate: 0 },
        { quantity: 1, unitPrice: 5000, gstRate: 18 },
      ],
      discount: null,
    });
    expect(r.subtotal).toBe(15_000);
    // Only the 18% line taxed → CGST 450 + SGST 450 (9% each on 5000)
    expect(r.cgst).toBe(450);
    expect(r.sgst).toBe(450);
    expect(r.igst).toBe(0);
    expect(r.total).toBe(15_900);
  });

  it('amount discount capped at subtotal (no negative base)', () => {
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'MH',
      lines: [{ quantity: 1, unitPrice: 1000, gstRate: 18 }],
      discount: { type: 'amount', value: 5000 },
    });
    expect(r.discountAmount).toBe(1000);
    expect(r.taxableAmount).toBe(0);
    expect(r.total).toBe(0);
  });

  it('proportional discount across mixed-rate lines (per-line tax base)', () => {
    // 50% discount on a mixed-rate quote — each line should be discounted
    // by 50% then taxed at its own rate.
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'KA',
      lines: [
        { quantity: 1, unitPrice: 1000, gstRate: 18 }, // → 500 taxable → 90 IGST
        { quantity: 1, unitPrice: 1000, gstRate: 12 }, // → 500 taxable → 60 IGST
      ],
      discount: { type: 'percent', value: 50 },
    });
    expect(r.subtotal).toBe(2000);
    expect(r.discountAmount).toBe(1000);
    expect(r.taxableAmount).toBe(1000);
    expect(r.igst).toBe(150);
    expect(r.total).toBe(1150);
  });

  it('zero subtotal does not divide by zero', () => {
    const r = computeQuotationTotals({
      tenantState: 'MH',
      placeOfSupply: 'KA',
      lines: [],
      discount: { type: 'percent', value: 10 },
    });
    expect(r.subtotal).toBe(0);
    expect(r.discountAmount).toBe(0);
    expect(r.total).toBe(0);
  });

  it('state comparison is case-insensitive', () => {
    const r = computeQuotationTotals({
      tenantState: 'mh',
      placeOfSupply: 'MH',
      lines: [{ quantity: 1, unitPrice: 1000, gstRate: 18 }],
      discount: null,
    });
    expect(r.isInterState).toBe(false);
  });
});
