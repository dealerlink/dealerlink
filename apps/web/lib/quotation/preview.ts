/**
 * Client-side tax preview helper.
 *
 * As of Day 9 this file is a THIN ADAPTER. All money math lives in the
 * canonical engine `@dealerlink/tax` (`computeTax`). This adapter exists
 * only to bridge two shapes:
 *
 *   - the Builder's loose, mid-edit input (number-or-string fields, lines
 *     that are not yet complete, a discount the user is still typing) →
 *     the engine's strict `TaxComputationInput`;
 *   - the engine's `Decimal` output → plain `number`s for the live preview
 *     (the UI does not need Decimal precision to render rupees).
 *
 * Tolerances applied here, and ONLY here (the engine itself stays strict):
 *   - incomplete lines (quantity ≤ 0) are dropped — they contribute nothing;
 *   - the inter/intra-state decision is case-INsensitive (the engine is
 *     case-sensitive; persisted data is already uppercased consistently);
 *   - an over-large discount is capped at the subtotal instead of throwing,
 *     so the live preview never blows up while the user edits.
 *
 * Rules (per CLAUDE.md §6 + BRD §4) are all enforced by the engine:
 *   - Inter-state → IGST at full rate; intra-state → CGST + SGST at half.
 *   - Discount applies BEFORE tax, allocated proportionally per line.
 */
import {
  Decimal,
  computeTax,
  round2,
  toDecimal,
  type GstRate,
  type TaxDiscount,
} from '@dealerlink/tax';

export interface PreviewLine {
  quantity: number | string;
  unitPrice: number | string;
  gstRate: number | string;
}

export interface PreviewDiscount {
  type: 'percent' | 'amount';
  value: number;
}

export interface PreviewInput {
  lines: PreviewLine[];
  tenantState: string;
  placeOfSupply: string;
  discount: PreviewDiscount | null;
}

export interface PreviewOutput {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  isInterState: boolean;
}

const toNum = (v: number | string): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pure function used by both the client preview and the Server Actions.
 * Same inputs → same outputs by construction — it delegates to `computeTax`.
 */
export function computeQuotationTotals(input: PreviewInput): PreviewOutput {
  // Case-insensitive state comparison — the documented preview behaviour.
  const isInterState =
    input.tenantState.trim().toUpperCase() !== input.placeOfSupply.trim().toUpperCase();

  // Drop incomplete lines; a quantity ≤ 0 contributes nothing to a preview.
  const engineLines = input.lines
    .map((l, i) => ({
      lineId: `preview-${i}`,
      quantity: toNum(l.quantity),
      unitPrice: toNum(l.unitPrice),
      gstRate: toNum(l.gstRate) as GstRate,
    }))
    .filter((l) => l.quantity > 0 && l.unitPrice >= 0);

  if (engineLines.length === 0) {
    return {
      subtotal: 0,
      discountAmount: 0,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total: 0,
      isInterState,
    };
  }

  // Subtotal (sum of rounded line subtotals) — only needed to cap the
  // discount before handing it to the strict engine.
  const subtotalD = engineLines.reduce(
    (acc, l) => acc.plus(round2(toDecimal(l.quantity).times(l.unitPrice))),
    new Decimal(0),
  );

  // Resolve any discount to a concrete, non-negative, subtotal-capped amount
  // so the engine (which rejects over-large discounts) never throws here.
  let discount: TaxDiscount = null;
  if (input.discount) {
    const v = Math.max(toNum(input.discount.value), 0);
    const rawAmount =
      input.discount.type === 'percent'
        ? subtotalD.times(Math.min(v, 100)).dividedBy(100)
        : toDecimal(v);
    const capped = Decimal.min(round2(rawAmount), subtotalD);
    discount = { type: 'amount', value: capped.toNumber() };
  }

  // The engine only uses the two state strings for the inter/intra decision;
  // pass canonical non-empty sentinels so a half-filled state never throws.
  const out = computeTax({
    tenantState: 'INTRA',
    placeOfSupply: isInterState ? 'INTER' : 'INTRA',
    lines: engineLines,
    discount,
  });

  return {
    subtotal: out.subtotal.toNumber(),
    discountAmount: out.discountAmount.toNumber(),
    taxableAmount: out.taxableAmount.toNumber(),
    cgst: out.cgstAmount.toNumber(),
    sgst: out.sgstAmount.toNumber(),
    igst: out.igstAmount.toNumber(),
    total: out.totalAmount.toNumber(),
    isInterState,
  };
}

/** Line total before tax (quantity × unitPrice), rounded to 2 dp. */
export function lineTotalOf(line: {
  quantity: number | string;
  unitPrice: number | string;
}): number {
  return round2(toDecimal(toNum(line.quantity)).times(toNum(line.unitPrice))).toNumber();
}
