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

  it('rejects GST rate not in {0,5,12,18,28}', () => {
    const r = createProductSchema.safeParse({
      sku: 'X',
      name: 'X',
      hsnCode: '85414300',
      gstRate: 10,
    });
    expect(r.success).toBe(false);
  });

  it('accepts canonical GST rates 5, 12, 18, 28', () => {
    for (const rate of [5, 12, 18, 28]) {
      const r = createProductSchema.safeParse({
        sku: `XX${rate}`,
        name: 'Panel',
        hsnCode: '85414300',
        gstRate: rate,
      });
      expect(r.success).toBe(true);
    }
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
