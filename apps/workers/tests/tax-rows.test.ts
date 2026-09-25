import { describe, expect, it } from 'vitest';

import { buildTaxRows, rateLabel } from '../src/pdf/tax-rows';

/**
 * F.4 A.1 — the rate-wise rows, and the one property the day's measurement rests on.
 *
 * ## Why the label format is asserted rather than assumed
 *
 * All 8 tax-bearing reference documents are single-rate 18% (measured against the
 * seeded corpus, 2026-09-24). Before F.4, `pdf/view-model.ts` renders their half-rate
 * label as `` `${Number('18') / 2}%` `` — the string `9%`. The F.4 day prompt's R2
 * partition says the only thing that may change on those 8 references is the added
 * HSN/SAC table, so the totals block must come out byte-identical.
 *
 * A rate-wise block emitting `9.0%` or `9.00%` would move all 8 for a FORMATTING
 * reason. The byte diff would be non-empty, the added segment would no longer be the
 * HSN table alone, and R2's partition would be void — the day would have lost its
 * ability to tell an intended move from an unintended one. That is why this is a test
 * and not a comment.
 */
describe('F.4 — rate-wise tax rows', () => {
  const intra18 = {
    rate: 18,
    cgstRate: 9,
    cgstAmount: 13671,
    sgstRate: 9,
    sgstAmount: 13671,
    igstRate: null,
    igstAmount: 0,
  };

  it('R3 — reproduces the pre-F.4 half-rate label EXACTLY on a single-rate 18% document', () => {
    const rows = buildTaxRows([intra18], false);

    // The literal the 8 references were rendered with, and the expression that
    // produced it in view-model.ts before this change.
    expect(rows[0]!.label).toBe('CGST 9%');
    expect(rows[1]!.label).toBe('SGST 9%');
    expect(rows[0]!.label).toBe(`CGST ${Number('18') / 2}%`);

    // The three ways this could silently move all 8 references.
    expect(rows[0]!.label).not.toBe('CGST 9.0%');
    expect(rows[0]!.label).not.toBe('CGST 9.00%');
    expect(rows[0]!.label).not.toContain('.');
  });

  it('drops trailing zeros but keeps a genuine fraction', () => {
    expect(rateLabel(9)).toBe('9%');
    expect(rateLabel(2.5)).toBe('2.5%'); // 5% halved
    expect(rateLabel(1.5)).toBe('1.5%'); // 3% halved
    expect(rateLabel(14)).toBe('14%'); // 28% halved
  });

  it('emits CGST then SGST per rate intra-state, so a reader sees the pair together', () => {
    const rows = buildTaxRows(
      [
        intra18,
        {
          rate: 5,
          cgstRate: 2.5,
          cgstAmount: 100,
          sgstRate: 2.5,
          sgstAmount: 100,
          igstRate: null,
          igstAmount: 0,
        },
      ],
      false,
    );
    expect(rows.map((r) => r.label)).toEqual(['CGST 9%', 'SGST 9%', 'CGST 2.5%', 'SGST 2.5%']);
  });

  it('emits one IGST row per rate at the FULL rate inter-state', () => {
    const rows = buildTaxRows(
      [
        {
          rate: 18,
          cgstRate: null,
          cgstAmount: 0,
          sgstRate: null,
          sgstAmount: 0,
          igstRate: 18,
          igstAmount: 27342,
        },
        {
          rate: 5,
          cgstRate: null,
          cgstAmount: 0,
          sgstRate: null,
          sgstAmount: 0,
          igstRate: 5,
          igstAmount: 200,
        },
      ],
      true,
    );
    expect(rows.map((r) => r.label)).toEqual(['IGST 18%', 'IGST 5%']);
  });

  it('never produces the empty rate label that ships today on a mixed-rate document', () => {
    // Before F.4: `gstRateLabel` is null when rates differ, view-model.ts turns null
    // into '', and quotation.typ:106 concatenates it — rendering `CGST ` with a
    // trailing space and no rate. Every row here carries its own rate instead.
    const rows = buildTaxRows(
      [
        intra18,
        {
          rate: 5,
          cgstRate: 2.5,
          cgstAmount: 100,
          sgstRate: 2.5,
          sgstAmount: 100,
          igstRate: null,
          igstAmount: 0,
        },
      ],
      false,
    );
    for (const r of rows) {
      expect(r.label).not.toMatch(/^(CGST|SGST|IGST) $/);
      expect(r.label).toMatch(/^(CGST|SGST|IGST) \d+(\.\d+)?%$/);
    }
  });

  it('formats money the way every other PDF figure is formatted', () => {
    expect(buildTaxRows([intra18], false)[0]!.amount).toBe('13,671.00');
  });
});
