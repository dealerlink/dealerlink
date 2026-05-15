/**
 * Client-side tax preview helper.
 *
 * The Builder uses this to update totals live as the user edits a quotation,
 * without making a server round-trip. The Day 9 tax engine in packages/tax
 * will replace the math inside `computeQuotationTotals` (the shared
 * pure-function below). Until then, server-side actions call the SAME
 * function so the numbers are guaranteed identical to the preview.
 *
 * Rules (per CLAUDE.md §6 + BRD §4):
 *   - Inter-state when tenantState !== placeOfSupply → IGST at full rate
 *   - Intra-state → CGST + SGST, each at half the rate
 *   - Discount applies BEFORE tax (Phase 1 only)
 *   - Discount distributes proportionally across lines so each line's tax
 *     is computed against its own discounted base (lines with different
 *     GST rates need this)
 *   - All money rounded to 2dp via half-up rounding
 */

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

const round2 = (n: number): number => Math.round(n * 100) / 100;

const toNum = (v: number | string): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pure function used by both the client preview and the Server Actions.
 * Same inputs → same outputs by construction.
 */
export function computeQuotationTotals(input: PreviewInput): PreviewOutput {
  const isInterState = input.tenantState.toUpperCase() !== input.placeOfSupply.toUpperCase();

  let subtotal = 0;
  for (const l of input.lines) {
    subtotal += toNum(l.quantity) * toNum(l.unitPrice);
  }
  subtotal = round2(subtotal);

  let discountAmount = 0;
  if (input.discount) {
    const v = toNum(input.discount.value);
    if (input.discount.type === 'percent') {
      discountAmount = round2((subtotal * v) / 100);
    } else {
      // Amount discount capped at subtotal to avoid negative bases.
      discountAmount = round2(Math.min(v, subtotal));
    }
  }

  const taxableAmount = round2(subtotal - discountAmount);
  const discountRatio = subtotal > 0 ? discountAmount / subtotal : 0;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  for (const l of input.lines) {
    const lineGross = toNum(l.quantity) * toNum(l.unitPrice);
    const lineAfterDiscount = lineGross * (1 - discountRatio);
    const rate = toNum(l.gstRate) / 100;
    if (isInterState) {
      igst += lineAfterDiscount * rate;
    } else {
      cgst += lineAfterDiscount * (rate / 2);
      sgst += lineAfterDiscount * (rate / 2);
    }
  }

  cgst = round2(cgst);
  sgst = round2(sgst);
  igst = round2(igst);

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    total: round2(taxableAmount + cgst + sgst + igst),
    isInterState,
  };
}

/** Line total before tax (quantity × unitPrice), rounded to 2 dp. */
export function lineTotalOf(line: {
  quantity: number | string;
  unitPrice: number | string;
}): number {
  return round2(toNum(line.quantity) * toNum(line.unitPrice));
}
