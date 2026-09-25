/**
 * Rate-wise and HSN-wise tax groups for the PDF templates (F.4, D-3).
 *
 * Both loaders — `templates/quotation.tsx` and `templates/performa-invoice.tsx` —
 * derive their groups here rather than each rolling its own, because they already
 * duplicate the single-rate `gstRateLabel` derivation and a third copy of the same
 * reasoning is how the two drift apart.
 *
 * **Computed in the LOADERS on purpose (D-3).** The loaders are shared by production
 * (`jobs/render-pdf.ts`), the snapshot test (`tests/pdf-snapshots.test.ts`) and
 * `scripts/render-typst.ts`. Computing here therefore reaches all three, including the
 * byte-measurement harness. Computing it in `buildViewModel` would reach the first two
 * and miss the third, which is the fork F.108 records and the false-negative the F.4 day
 * prompt opens with.
 *
 * **One engine call yields both groupings.** `computeTaxSummary` returns `byRate` and
 * `byHsn` together; calling it twice would run the same pure function over the same
 * input for no reason and invite the two results to be taken from different calls.
 *
 * This module GROUPS; it does not compute tax. `computeTaxSummary` in `@dealerlink/tax`
 * owns both (CLAUDE.md §7), and the money here is its output converted to `number` for
 * the view model — never re-derived.
 */
import { computeTaxSummary, type TaxDiscount } from '@dealerlink/tax';

import type { PdfTaxHsnGroup, PdfTaxRateGroup } from './types';

export type TaxGroupLine = {
  lineId: string;
  quantity: number | string;
  unitPrice: number | string;
  gstRate: number;
  hsnCode: string | null;
};

/**
 * Rate-wise groups (one per distinct rate, ascending) and HSN-wise groups (one per
 * distinct **(HSN, rate) pair**, ascending by HSN then rate).
 *
 * The pair is the HSN key, not the HSN — `packages/tax/src/summary.ts` documents why,
 * and seed Chain B is the case that proves it: one HSN on both an 18% and a 5% line
 * yields two rows, so this array can be longer than the number of distinct HSN codes.
 *
 * `Decimal` does not survive `JSON.stringify` as a 2dp string, so every amount is
 * converted to `number` here and formatted once, later, by the view builders (D-4).
 */
export function buildTaxGroups(input: {
  tenantState: string;
  placeOfSupply: string;
  discount: TaxDiscount;
  lines: TaxGroupLine[];
}): { rateGroups: PdfTaxRateGroup[]; hsnGroups: PdfTaxHsnGroup[] } {
  const summary = computeTaxSummary({
    tenantState: input.tenantState,
    placeOfSupply: input.placeOfSupply,
    discount: input.discount,
    lines: input.lines.map((l) => ({
      lineId: l.lineId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      gstRate: l.gstRate,
      // An HSN is nullable on the row but not in practice on a line that came from
      // a product. Empty string groups such rows together rather than dropping
      // them, matching the web adapter's choice so the two cannot disagree.
      hsnCode: l.hsnCode ?? '',
    })),
  });

  const n = (d: { toFixed(dp: number): string }) => Number(d.toFixed(2));

  return {
    rateGroups: summary.byRate.map((g) => ({
      rate: g.rate,
      cgstRate: g.cgstRate,
      cgstAmount: n(g.cgstAmount),
      sgstRate: g.sgstRate,
      sgstAmount: n(g.sgstAmount),
      igstRate: g.igstRate,
      igstAmount: n(g.igstAmount),
    })),
    hsnGroups: summary.byHsn.map((g) => ({
      hsn: g.hsn,
      rate: g.rate,
      taxableValue: n(g.taxableValue),
      centralRate: g.centralRate,
      centralAmount: n(g.centralAmount),
      stateRate: g.stateRate,
      stateAmount: n(g.stateAmount),
      integratedRate: g.integratedRate,
      integratedAmount: n(g.integratedAmount),
      totalTax: n(g.totalTax),
    })),
  };
}
