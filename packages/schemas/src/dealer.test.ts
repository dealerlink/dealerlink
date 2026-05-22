import { describe, expect, it } from 'vitest';

import {
  bulkImportDealersSchema,
  createDealerSchema,
  deactivateDealerSchema,
  dealerListFilterSchema,
  updateDealerCommercialSchema,
} from './dealer';

describe('createDealerSchema', () => {
  it('accepts a minimal valid dealer', () => {
    const r = createDealerSchema.safeParse({
      legalName: 'Acme Solar Pvt Ltd',
      displayName: 'Acme',
      type: 'retailer',
      category: 'B',
      riskLevel: 'low',
      country: 'IN',
      discountPercent: 0,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a malformed GSTIN', () => {
    const r = createDealerSchema.safeParse({
      legalName: 'X Co',
      displayName: 'X',
      gstin: 'notagstin',
    });
    expect(r.success).toBe(false);
  });

  it('rejects a pincode starting with 0', () => {
    const r = createDealerSchema.safeParse({
      legalName: 'X Co',
      displayName: 'X',
      pincode: '012345',
    });
    expect(r.success).toBe(false);
  });

  it('caps tags at 20', () => {
    const r = createDealerSchema.safeParse({
      legalName: 'X Co',
      displayName: 'X',
      tags: Array.from({ length: 21 }, (_, i) => `t${i}`),
    });
    expect(r.success).toBe(false);
  });

  it('normalises a state name to its ISO code (CSV import path)', () => {
    const r = createDealerSchema.safeParse({
      legalName: 'X Co',
      displayName: 'X Co',
      state: 'Maharashtra',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.state).toBe('MH');
  });

  it('accepts a state code as-is (dropdown path)', () => {
    const r = createDealerSchema.safeParse({ legalName: 'X Co', displayName: 'X Co', state: 'KA' });
    expect(r.success && r.data.state).toBe('KA');
  });

  it('treats a blank state as absent (→ NULL)', () => {
    const r = createDealerSchema.safeParse({ legalName: 'X Co', displayName: 'X Co', state: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.state).toBeUndefined();
  });

  it('rejects an unknown state', () => {
    const r = createDealerSchema.safeParse({
      legalName: 'X Co',
      displayName: 'X Co',
      state: 'Atlantis',
    });
    expect(r.success).toBe(false);
  });
});

describe('updateDealerCommercialSchema', () => {
  it('rejects discount above 100', () => {
    const r = updateDealerCommercialSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000000',
      discountPercent: 110,
    });
    expect(r.success).toBe(false);
  });

  it('accepts null creditLimit (reset to no limit)', () => {
    const r = updateDealerCommercialSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000000',
      creditLimit: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejects creditPeriodDays above 365', () => {
    const r = updateDealerCommercialSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000000',
      creditPeriodDays: 400,
    });
    expect(r.success).toBe(false);
  });
});

describe('deactivateDealerSchema', () => {
  it('requires a reason of at least 2 characters', () => {
    const r = deactivateDealerSchema.safeParse({
      id: '00000000-0000-0000-0000-000000000000',
      reason: '',
    });
    expect(r.success).toBe(false);
  });
});

describe('dealerListFilterSchema', () => {
  it('coerces limit/offset from strings', () => {
    const r = dealerListFilterSchema.safeParse({ limit: '25', offset: '50' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(25);
      expect(r.data.offset).toBe(50);
    }
  });
});

describe('bulkImportDealersSchema', () => {
  it('rejects empty arrays', () => {
    const r = bulkImportDealersSchema.safeParse({ rows: [] });
    expect(r.success).toBe(false);
  });

  it('caps imports at 500 rows', () => {
    const r = bulkImportDealersSchema.safeParse({
      rows: Array.from({ length: 501 }, () => ({
        legalName: 'X Co',
        displayName: 'X',
      })),
    });
    expect(r.success).toBe(false);
  });
});
