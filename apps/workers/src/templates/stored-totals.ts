import { Decimal, sumDecimals } from '@dealerlink/tax';

import type { PdfLineItem, PdfTaxRateGroup } from './types';

/**
 * The header money figures a document PRINTS, read from its stored columns.
 *
 * ## WHY THIS EXISTS (F.152, F6 D-1)
 *
 * Both PDF loaders used to call `computeTax` over the stored lines and print the
 * RESULT as the document's header totals, while `apps/workers/src/pdf/view-model.ts`
 * asserted the opposite rule and called it structural. They agreed numerically
 * only because the stored columns had themselves been written by `computeTax` over
 * the same lines — a coincidence of provenance, not a property.
 *
 * The coincidence breaks in two places, one already real:
 *
 *  - **`orders` cannot reproduce its own discount.** It stores `discount_amount`
 *    but not `discount_type`/`discount_value` (F.114), so a recomputing loader
 *    passes `discount: null` and returns a discount of zero. Measured on the dev
 *    corpus: one order stores 30046.50 and recomputes to 0.00, cascading
 *    +32414.89 onto the total. An invoice descends from an order, so a recomputing
 *    invoice loader would print a different number on a legal document.
 *  - **Round-off.** A whole-rupee total (F6 D-3) is by construction a number no
 *    pure function of the lines reproduces, so a recomputing loader cannot see it.
 *
 * ## WHAT IS READ AND WHAT IS STILL DERIVED
 *
 * Read: the seven header columns. Derived: everything per-line and both grouping
 * axes, because **no per-line tax is stored at any grain** (F.99 — the `*_lines`
 * tables carry `quantity`, `unit_price`, `gst_rate` and `line_total` and nothing
 * else). That split is F.152's ruling, not a compromise: totals are read, grouping
 * is derived, and the two must reconcile.
 */
export interface StoredTotalsRow {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
}

/** Thrown when the stored header disagrees with what the lines group to. */
export class TotalsReconciliationError extends Error {
  constructor(
    readonly documentNumber: string,
    readonly figure: string,
    readonly stored: string,
    readonly derived: string,
  ) {
    super(
      `Document ${documentNumber}: stored ${figure} is ${stored} but its line items ` +
        `group to ${derived}. The stored column and the line items disagree, so the ` +
        `rendered document would state a figure its own lines do not support. ` +
        `This is a data defect, not a rendering one — do not "fix" it in the loader.`,
    );
    this.name = 'TotalsReconciliationError';
  }
}

/** Fixed 2dp, so two values are never compared as floats. */
function at2(value: Decimal | string | number): string {
  return new Decimal(value).toFixed(2);
}

/**
 * Assert the stored header and the derived grouping agree, then return the header
 * as numbers for the view model.
 *
 * ## TWO ASSERTIONS, NOT ONE, AND THE SECOND IS NOT OPTIONAL
 *
 * The identity in F6_SPEC §2 — `total − (taxable + tax)` — **cannot detect a wrong
 * `taxable_amount`, because `taxable` appears on both sides and cancels.** So the
 * tax half and the taxable half are checked separately:
 *
 *  1. `Σ rateGroups(cgst+sgst+igst)` against `stored cgst + sgst + igst`. This is
 *     the check that can catch a GROUPING error — comparing the stored tax columns
 *     against each other would compare two numbers written by the same call
 *     (`packages/tax/src/summary.ts:290-296` makes the same argument about why its
 *     reconciliation test is real).
 *  2. `Σ line taxableValue` against `stored taxable_amount`.
 *
 * Both throw rather than warn, and both name the document by NUMBER rather than by
 * id, because a uuid in a log tells the reader nothing about which document on a
 * desk is wrong.
 */
export function readStoredTotals(input: {
  documentNumber: string;
  stored: StoredTotalsRow;
  lines: Pick<PdfLineItem, 'taxableValue'>[];
  rateGroups: PdfTaxRateGroup[];
}): {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  /** The stored total as a Decimal, for `amountInWords` — which must say the same number. */
  totalAmountDecimal: Decimal;
} {
  const { documentNumber, stored, lines, rateGroups } = input;

  const storedTax = new Decimal(stored.cgstAmount).plus(stored.sgstAmount).plus(stored.igstAmount);
  const groupedTax = sumDecimals(
    rateGroups.map((g) => new Decimal(g.cgstAmount).plus(g.sgstAmount).plus(g.igstAmount)),
  );
  if (at2(storedTax) !== at2(groupedTax)) {
    throw new TotalsReconciliationError(
      documentNumber,
      'CGST+SGST+IGST',
      at2(storedTax),
      at2(groupedTax),
    );
  }

  const groupedTaxable = sumDecimals(lines.map((l) => new Decimal(l.taxableValue)));
  if (at2(stored.taxableAmount) !== at2(groupedTaxable)) {
    throw new TotalsReconciliationError(
      documentNumber,
      'taxable_amount',
      at2(stored.taxableAmount),
      at2(groupedTaxable),
    );
  }

  return {
    subtotal: Number(stored.subtotal),
    discountAmount: Number(stored.discountAmount),
    taxableAmount: Number(stored.taxableAmount),
    cgstAmount: Number(stored.cgstAmount),
    sgstAmount: Number(stored.sgstAmount),
    igstAmount: Number(stored.igstAmount),
    totalAmount: Number(stored.totalAmount),
    totalAmountDecimal: new Decimal(stored.totalAmount),
  };
}
