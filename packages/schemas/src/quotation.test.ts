/**
 * Quotation-line schema tests (F.55).
 *
 * The package had no quotation test before this day, which is why the inline
 * `[0, 5, 12, 18, 28].includes(n)` refine on `quotationLineInputSchema` was never
 * exercised at any rate at all — the enum could have been anything. These tests
 * cover the shape rule that replaced it (`docs/F55_SPEC.md` §1), and they cover
 * it on the LINE schema specifically, because `piLineInputSchema` in
 * `./performa-invoice` is the same object and therefore inherits every case here:
 * one site, two document kinds.
 */
import { describe, expect, it } from 'vitest';

import { piLineInputSchema } from './performa-invoice';
import { quotationLineInputSchema } from './quotation';

/** Otherwise-valid line, so every case below varies ONLY the rate. */
const validLine = {
  productId: '00000000-0000-0000-0000-000000000001',
  productSku: 'MR-MOD-555',
  productName: 'Premier 555W TOPCon Module',
  hsnCode: '85414300',
  quantity: 7,
  unitPrice: 13325,
};

const rateIssues = (gstRate: unknown) => {
  const r = quotationLineInputSchema.safeParse({ ...validLine, gstRate });
  return r.success ? [] : r.error.issues.filter((i) => i.path[0] === 'gstRate');
};

describe('quotationLineInputSchema — gstRate is validated by shape, not membership', () => {
  it('accepts every shape-valid rate, including ones the old enum omitted', () => {
    for (const rate of [0, 0.25, 3, 5, 12, 18, 28, 40, 100, 999.99]) {
      const r = quotationLineInputSchema.safeParse({ ...validLine, gstRate: rate });
      expect(r.success, `rate ${rate} should be accepted`).toBe(true);
    }
  });

  it('rejects what cannot be a rate, and attributes it to gstRate', () => {
    expect(rateIssues(-1).length, 'negative').toBeGreaterThan(0);
    expect(rateIssues(1000).length, 'above the numeric(5,2) magnitude').toBeGreaterThan(0);
    expect(rateIssues(0.125).length, 'three decimal places').toBeGreaterThan(0);
  });

  it('raises NO rate issue for a valid rate — the control', () => {
    // Without this, the rejections above could all be passing because the
    // fixture is invalid for an unrelated reason. That is exactly how
    // product.test.ts's predecessor stayed green while testing nothing (F.55).
    expect(rateIssues(18)).toEqual([]);
    expect(quotationLineInputSchema.safeParse({ ...validLine, gstRate: 18 }).success).toBe(true);
  });

  it('coerces the numeric string a form submits', () => {
    // z.coerce.number() — the catalogue form and the quotation builder both
    // submit strings, and the DB returns `'18.00'` for a decimal(5,2) column.
    const r = quotationLineInputSchema.safeParse({ ...validLine, gstRate: '18.00' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gstRate).toBe(18);
  });

  it('applies the identical rule to PI lines — same object, two document kinds', () => {
    // piLineInputSchema IS quotationLineInputSchema (performa-invoice.ts). If that
    // ever stops being true, these two assertions diverge and this test says so.
    expect(piLineInputSchema).toBe(quotationLineInputSchema);
    expect(piLineInputSchema.safeParse({ ...validLine, gstRate: 40 }).success).toBe(true);
    expect(piLineInputSchema.safeParse({ ...validLine, gstRate: -1 }).success).toBe(false);
  });
});
