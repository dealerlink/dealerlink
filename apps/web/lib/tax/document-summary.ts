import { computeTaxSummary } from '@dealerlink/tax';

import type { TaxSummaryRow } from '@/components/tax/tax-summary-block';

/**
 * Turn a stored document's lines into the rate groups the screens render (F.3).
 *
 * One adapter for all three saved views — quotation, PI and order — because
 * three copies of this call are three things to get subtly wrong independently.
 * The same argument that merged the two Zod rate rules into one schema on the
 * F.55 day, and that gave the four screens one component instead of four.
 *
 * ## It reads stored lines and derives through the engine
 *
 * This is `docs/F3_F4_SPEC.md` §3's money rule as corrected on 2026-09-19: money
 * is derived through `computeTax` over the stored line rows — the pattern
 * `apps/workers/src/templates/quotation.tsx:186-196` already uses on every PDF
 * render — never re-derived from header totals and never recomputed as
 * rate × an approximated taxable value.
 *
 * **It does not re-derive the header figures.** `subtotal`, `taxableAmount`,
 * `cgstAmount`, `sgstAmount`, `igstAmount` and `totalAmount` are read from their
 * stored columns by the caller and rendered as stored. This function supplies
 * only the per-rate BREAKDOWN, which is stored at no grain at all (F.99). The
 * breakdown sums to the stored totals exactly on an undiscounted document; on a
 * discounted one it can fall a paisa short of the stored `taxable_amount`, which
 * is F.101 and not this function's doing.
 *
 * ## Server-only
 *
 * Every caller is a Server Component reading stored rows. Nothing here needs to
 * reach the client, and `Decimal` would not survive the boundary anyway — the
 * amounts come back as fixed-2dp strings.
 */

export type DocumentSummaryInput = {
  tenantStateAtIssue: string;
  placeOfSupply: string;
  discountType: 'percent' | 'amount' | null;
  /** The stored discount value. A string out of the driver is fine. */
  discountValue: string | number | null;
  lines: {
    id: string;
    hsnCode: string | null;
    quantity: number | string;
    unitPrice: number | string;
    gstRate: number | string;
  }[];
};

export type DocumentSummary = {
  /** One entry per distinct rate, ascending. Ready for `TaxSummaryBlock`. */
  rows: TaxSummaryRow[];
  /**
   * One entry per distinct (HSN, rate) pair, ascending by HSN then rate.
   *
   * **THIS FIELD HAS NO CONSUMER AND THE REASON RECORDED FOR KEEPING IT WAS FALSE.**
   * It said F.4 "is the next task and needs exactly this shape from exactly this
   * call". F.4 has now shipped and did not use it, because it could not:
   *
   * - `apps/workers/package.json` declares `@dealerlink/db`, `@dealerlink/schemas`
   *   and `@dealerlink/tax`, and has never declared a dependency on `apps/web`. A
   *   workers module cannot import this file at all. That was true when the reason
   *   was written, so it was not a forecast that went stale.
   * - The amounts here are `toFixed(2)` strings — `"13671.00"`. Every money value on
   *   a PDF goes through `formatMoney`, which emits `"13,671.00"`. The docstring
   *   above says so itself.
   *
   * F.4 instead calls `computeTaxSummary` from `@dealerlink/tax` directly, in
   * `apps/workers/src/templates/tax-groups.ts`. The full account is DEV.146.
   *
   * **Deleting this field and the four lines that populate it remains the right fix**
   * — nothing reads them. It was not done inside F.4 because that was an
   * `apps/workers` day and this is `apps/web` (D-8, CLAUDE.md §11.2); the deletion is
   * filed as its own row.
   */
  hsnRows: {
    hsn: string;
    rate: number;
    taxableValue: string;
    centralRate: number | null;
    centralAmount: string;
    stateRate: number | null;
    stateAmount: string;
    integratedRate: number | null;
    integratedAmount: string;
    totalTax: string;
  }[];
  isInterState: boolean;
};

/**
 * Returns `null` when there is nothing to summarise — no lines at all. The
 * caller renders its existing stored-total rows and the block's empty state.
 * **Returning `null` rather than an empty summary is deliberate:** 38 of 64
 * seeded PIs have no line rows (F.97), so "no lines" is a real state in this
 * data, not a defensive branch, and a zero-valued group would render as a
 * spurious `CGST @ 0%` row on a document whose header claims money.
 */
export function summariseDocument(input: DocumentSummaryInput): DocumentSummary | null {
  if (input.lines.length === 0) return null;

  const summary = computeTaxSummary({
    tenantState: input.tenantStateAtIssue,
    placeOfSupply: input.placeOfSupply,
    discount:
      input.discountType && input.discountValue != null && Number(input.discountValue) > 0
        ? { type: input.discountType, value: Number(input.discountValue) }
        : null,
    lines: input.lines.map((l) => ({
      lineId: l.id,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      // The rate is coerced HERE, at the boundary between a DB value and the
      // engine. DEV.135's live hazard is a DB string meeting a hand-written
      // literal; the engine's own guard rejects a non-number outright, which is
      // what forces this coercion to be explicit rather than incidental.
      gstRate: Number(l.gstRate),
      // An HSN is nullable in the type but not in practice on a line that came
      // from a product. Empty string groups such rows together rather than
      // dropping them, so their money still appears in the HSN table.
      hsnCode: l.hsnCode ?? '',
    })),
  });

  return {
    isInterState: summary.isInterState,
    rows: summary.byRate.map((g) => ({
      rate: g.rate,
      cgstRate: g.cgstRate,
      cgstAmount: g.cgstAmount.toFixed(2),
      sgstRate: g.sgstRate,
      sgstAmount: g.sgstAmount.toFixed(2),
      igstRate: g.igstRate,
      igstAmount: g.igstAmount.toFixed(2),
    })),
    hsnRows: summary.byHsn.map((g) => ({
      hsn: g.hsn,
      rate: g.rate,
      taxableValue: g.taxableValue.toFixed(2),
      centralRate: g.centralRate,
      centralAmount: g.centralAmount.toFixed(2),
      stateRate: g.stateRate,
      stateAmount: g.stateAmount.toFixed(2),
      integratedRate: g.integratedRate,
      integratedAmount: g.integratedAmount.toFixed(2),
      totalTax: g.totalTax.toFixed(2),
    })),
  };
}
