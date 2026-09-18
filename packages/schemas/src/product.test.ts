import { describe, expect, it } from 'vitest';

import { bulkImportProductsSchema, createProductSchema, updateProductSchema } from './product';

describe('createProductSchema', () => {
  it('accepts a valid product', () => {
    const r = createProductSchema.safeParse({
      sku: 'PRE-540-TC',
      name: 'Premier 540W TOPCon',
      hsnCode: '85414300',
      gstRate: 18,
      requiresSerial: true,
      unitOfMeasure: 'Nos',
    });
    expect(r.success).toBe(true);
  });

  it('rejects SKU with whitespace', () => {
    const r = createProductSchema.safeParse({
      sku: 'PRE 540 TC',
      name: 'Premier',
      hsnCode: '85414300',
      gstRate: 18,
    });
    expect(r.success).toBe(false);
  });

  it('rejects HSN code with letters', () => {
    const r = createProductSchema.safeParse({
      sku: 'X',
      name: 'X',
      hsnCode: 'ABCD',
      gstRate: 18,
    });
    expect(r.success).toBe(false);
  });

  it('rejects HSN code shorter than 4 digits', () => {
    const r = createProductSchema.safeParse({
      sku: 'X',
      name: 'X',
      hsnCode: '123',
      gstRate: 18,
    });
    expect(r.success).toBe(false);
  });

  // ── F.55: shape-only rate validation ──────────────────────────────────────
  //
  // The predecessor of the first test here read "rejects GST rate not in
  // {0,5,12,18,28}" with `gstRate: 10`. Under shape-only validation 10 is a
  // valid rate, so that assertion should have inverted — but it did NOT go red.
  // Its fixture used `sku: 'X'` and `name: 'X'`, both one character against
  // `min(2)`, so `safeParse` failed on SKU and name and the test stayed green
  // WITHOUT EXERCISING THE RATE AT ALL. Measured: the issues were
  // "SKU is required" and "Name is required", and the same fixture with a valid
  // sku/name accepts 10.
  //
  // That is worse than an inverted test, because it is green. Every case below
  // therefore varies ONLY the rate against a fixture that is otherwise valid,
  // and each asserts the reason as well as the outcome.
  const valid = { sku: 'XX-1', name: 'Panel', hsnCode: '85414300' };
  const rateIssues = (gstRate: unknown) => {
    const r = createProductSchema.safeParse({ ...valid, gstRate });
    return r.success ? [] : r.error.issues.filter((i) => i.path[0] === 'gstRate');
  };

  it('accepts any shape-valid rate, including ones the old enum omitted', () => {
    for (const rate of [0, 0.25, 3, 5, 12, 18, 28, 40, 100, 999.99]) {
      const r = createProductSchema.safeParse({ ...valid, gstRate: rate });
      expect(r.success, `rate ${rate} should be accepted`).toBe(true);
    }
  });

  it('rejects what cannot be a rate, and for the RATE reason', () => {
    // Negative, above the numeric(5,2) magnitude, and more than 2dp.
    expect(rateIssues(-1).length, 'negative').toBeGreaterThan(0);
    expect(rateIssues(1000).length, 'above 999.99').toBeGreaterThan(0);
    expect(rateIssues(0.125).length, 'three decimal places').toBeGreaterThan(0);
    // The control that the predecessor lacked: a valid rate produces NO rate
    // issue, so the assertions above are not passing for an unrelated reason.
    expect(rateIssues(18), 'a valid rate must raise no rate issue').toEqual([]);
  });

  it('encodes no upper bound beyond the column: 100 and 40 are accepted', () => {
    // Deliberate. A `<= 100` bound was never in the code, and adding one would
    // be a statutory claim that goes stale; `<= 40` is the old enum compressed
    // into one number. See docs/GST_RATE_MODEL_AUDIT.md §5.4a.
    expect(createProductSchema.safeParse({ ...valid, gstRate: 100 }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...valid, gstRate: 40 }).success).toBe(true);
  });

  it('rejects negative MRP', () => {
    const r = createProductSchema.safeParse({
      sku: 'X',
      name: 'X',
      hsnCode: '85414300',
      gstRate: 18,
      mrp: -100,
    });
    expect(r.success).toBe(false);
  });
});

describe('updateProductSchema', () => {
  it('allows partial updates', () => {
    const r = updateProductSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000000',
      name: 'New name',
    });
    expect(r.success).toBe(true);
  });
});

describe('bulkImportProductsSchema', () => {
  it('rejects empty arrays', () => {
    const r = bulkImportProductsSchema.safeParse({ rows: [] });
    expect(r.success).toBe(false);
  });
});
