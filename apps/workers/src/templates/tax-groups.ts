/**
 * Rate-wise tax groups for the PDF templates (F.4, D-3).
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
 * This module GROUPS; it does not compute tax. `computeTaxSummary` in `@dealerlink/tax`
 * owns both (CLAUDE.md §7), and the money here is its output converted to `number` for
 * the view model — never re-derived.
 */
import { computeTaxSummary, type TaxDiscount } from '@dealerlink/tax';

import type { PdfTaxRateGroup } from './types';

export type TaxGroupLine = {
  lineId: string;
  quantity: number | string;
  unitPrice: number | string;
  gstRate: number;
  hsnCode: string | null;
};

/**
 * One entry per distinct GST rate actually present, ascending.
 *
 * `Decimal` does not survive `JSON.stringify` as a 2dp string, so every amount is
 * converted to `number` here and formatted once, later, by the view builders (D-4).
 */
export function buildTaxRateGroups(input: {
  tenantState: string;
  placeOfSupply: string;
  discount: TaxDiscount;
  lines: TaxGroupLine[];
}): PdfTaxRateGroup[] {
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

  return summary.byRate.map((g) => ({
    rate: g.rate,
    cgstRate: g.cgstRate,
    cgstAmount: Number(g.cgstAmount.toFixed(2)),
    sgstRate: g.sgstRate,
    sgstAmount: Number(g.sgstAmount.toFixed(2)),
    igstRate: g.igstRate,
    igstAmount: Number(g.igstAmount.toFixed(2)),
  }));
}
