import { Decimal, sumDecimals, toDecimal } from './decimal';
import { round2 } from './round';
import { isInterState } from './state';
import { TaxComputationError } from './types';
import type { TaxComputationInput, TaxComputationOutput, TaxLineOutput } from './types';

const VALID_GST_RATES = [0, 5, 12, 18, 28];

/**
 * The authoritative GST computation for Dealerlink (CLAUDE.md §6, BRD §4).
 *
 * Pure function: input → output, no I/O, no framework. All money math runs
 * on `Decimal` — never native floats.
 *
 * Rounding model (see `round.ts` for the full rationale):
 *   - each line's subtotal is rounded to 2dp; the document `subtotal` is the
 *     SUM of those rounded line subtotals — so an invoice's printed line
 *     amounts always add up to the printed subtotal exactly;
 *   - each line's CGST/SGST/IGST is rounded to 2dp; the document tax totals
 *     are the SUM of the rounded per-line taxes (line-level rounding).
 *
 * @throws {TaxComputationError} on any invalid input — branch on `.code`.
 */
export function computeTax(input: TaxComputationInput): TaxComputationOutput {
  // ── Phase 1 — validate ────────────────────────────────────────────────
  validateInput(input);

  const interState = isInterState(input.tenantState, input.placeOfSupply);

  // ── Phase 2 — per-line subtotals (rounded), then the document subtotal ─
  const perLine = input.lines.map((line) => ({
    line,
    lineSubtotal: round2(toDecimal(line.quantity).times(toDecimal(line.unitPrice))),
  }));
  const subtotal = sumDecimals(perLine.map((p) => p.lineSubtotal));

  // ── Phase 3 — document-level discount ─────────────────────────────────
  const discountAmount = round2(computeDiscountAmount(input.discount, subtotal));
  if (discountAmount.greaterThan(subtotal)) {
    throw new TaxComputationError(
      'DISCOUNT_EXCEEDS_SUBTOTAL',
      `Discount ₹${discountAmount.toFixed(2)} exceeds subtotal ₹${subtotal.toFixed(2)}`,
    );
  }

  // subtotal and discountAmount are both exact 2dp → the difference is too.
  const taxableAmount = subtotal.minus(discountAmount);

  // Proportional discount allocation. The guard makes a zero subtotal safe
  // (no division by zero); a zero subtotal can only reach here with a zero
  // discount, since a positive amount discount would have thrown above.
  const discountRatio = subtotal.isZero() ? new Decimal(0) : discountAmount.dividedBy(subtotal);

  // ── Phase 4 — per-line tax (rounded individually) ─────────────────────
  const lines: TaxLineOutput[] = perLine.map(({ line, lineSubtotal }) => {
    const lineDiscount = round2(lineSubtotal.times(discountRatio));
    const lineTaxable = lineSubtotal.minus(lineDiscount);
    const rate = new Decimal(line.gstRate).dividedBy(100);

    let lineCgst = new Decimal(0);
    let lineSgst = new Decimal(0);
    let lineIgst = new Decimal(0);

    if (interState) {
      // Inter-state: the full GST rate is levied as IGST.
      lineIgst = round2(lineTaxable.times(rate));
    } else {
      // Intra-state: the rate splits equally into CGST + SGST.
      const halfRate = rate.dividedBy(2);
      lineCgst = round2(lineTaxable.times(halfRate));
      lineSgst = round2(lineTaxable.times(halfRate));
    }

    const lineTaxTotal = lineCgst.plus(lineSgst).plus(lineIgst);

    return {
      lineId: line.lineId,
      lineSubtotal,
      lineDiscount,
      lineTaxable,
      gstRate: line.gstRate,
      lineCgst,
      lineSgst,
      lineIgst,
      lineTaxTotal,
      lineTotal: lineTaxable.plus(lineTaxTotal),
    };
  });

  // ── Phase 5 — aggregate document totals ───────────────────────────────
  // Sum the already-rounded per-line taxes (Indian line-level convention).
  const cgstAmount = sumDecimals(lines.map((l) => l.lineCgst));
  const sgstAmount = sumDecimals(lines.map((l) => l.lineSgst));
  const igstAmount = sumDecimals(lines.map((l) => l.lineIgst));

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalAmount: taxableAmount.plus(cgstAmount).plus(sgstAmount).plus(igstAmount),
    isInterState: interState,
    lines,
  };
}

function validateInput(input: TaxComputationInput): void {
  if (input.lines.length === 0) {
    throw new TaxComputationError('EMPTY_LINES', 'At least one line item is required');
  }
  if (!input.tenantState || !input.tenantState.trim()) {
    throw new TaxComputationError('EMPTY_STATE', 'tenantState is required');
  }
  if (!input.placeOfSupply || !input.placeOfSupply.trim()) {
    throw new TaxComputationError('EMPTY_STATE', 'placeOfSupply is required');
  }

  for (const line of input.lines) {
    const qty = toDecimal(line.quantity);
    if (qty.lessThanOrEqualTo(0)) {
      throw new TaxComputationError(
        'NEGATIVE_QUANTITY',
        `Line ${line.lineId}: quantity must be > 0`,
      );
    }
    const price = toDecimal(line.unitPrice);
    if (price.lessThan(0)) {
      throw new TaxComputationError(
        'NEGATIVE_UNIT_PRICE',
        `Line ${line.lineId}: unitPrice must be >= 0`,
      );
    }
    if (!VALID_GST_RATES.includes(line.gstRate)) {
      throw new TaxComputationError(
        'INVALID_GST_RATE',
        `Line ${line.lineId}: gstRate ${String(line.gstRate)} not in {0,5,12,18,28}`,
      );
    }
  }

  if (input.discount) {
    const value = toDecimal(input.discount.value);
    if (value.lessThan(0)) {
      throw new TaxComputationError('NEGATIVE_DISCOUNT', 'Discount value cannot be negative');
    }
    if (input.discount.type === 'percent' && value.greaterThan(100)) {
      throw new TaxComputationError(
        'DISCOUNT_PERCENT_OUT_OF_RANGE',
        'Discount percent must be 0-100',
      );
    }
  }
}

function computeDiscountAmount(
  discount: TaxComputationInput['discount'],
  subtotal: Decimal,
): Decimal {
  if (!discount) return new Decimal(0);
  const value = toDecimal(discount.value);
  if (discount.type === 'percent') {
    return subtotal.times(value.dividedBy(100));
  }
  return value;
}
