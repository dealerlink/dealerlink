import { Decimal, sumDecimals, toDecimal } from './decimal';
import { round2 } from './round';
import { isInterState } from './state';
import { TaxComputationError } from './types';
import type { TaxComputationInput, TaxComputationOutput, TaxLineOutput } from './types';

/**
 * The authoritative GST computation for Dealerlink (CLAUDE.md §6, BRD §4).
 *
 * Pure function: input → output, no I/O, no framework. All money math runs
 * on `Decimal` — never native floats.
 *
 * Rounding model (see `round.ts` for the full rationale), as three separate
 * facts rather than one sentence that over-promises:
 *   - each line's subtotal is rounded to 2dp, and the document `subtotal` is the
 *     SUM of those rounded line subtotals;
 *   - the document discount is rounded ONCE at document level and then
 *     ALLOCATED across the lines by largest remainder, so the per-line
 *     allocations sum to it exactly (F.101);
 *   - each line's CGST/SGST/IGST is rounded to 2dp, and the document tax totals
 *     are the SUM of the rounded per-line taxes (line-level rounding).
 *
 * What that guarantees on a printed document: line subtotals sum to `subtotal`,
 * line discounts sum to `discountAmount`, line taxables sum to `taxableAmount`,
 * and line taxes sum to each document tax total — on discounted and undiscounted
 * documents alike.
 *
 * It deliberately claims nothing about `totalAmount` against a round figure. No
 * round-off adjustment is modelled here; that is F.6.
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

  // Largest-remainder allocation of the document discount across the lines.
  //
  // `discountAmount` above is the AUTHORITY and is never recomputed from these
  // parts. This distributes it so that `sum(lineDiscount) === discountAmount`
  // EXACTLY, for every input.
  //
  // What it replaces, and why: the previous code derived a ratio here and applied
  // `round2(lineSubtotal * ratio)` per line, independently. Each line rounded on
  // its own and the errors did not cancel, so the per-line figures did not sum to
  // the document one. Measured on a 4-rate 12.5% document with line subtotals
  // 24997 / 119925 / 83000 / 12450: `discountAmount` 30046.50 against
  // `sum(lineDiscount)` 30046.51, which left `sum(lineTaxable)` a paisa UNDER
  // `taxableAmount`. A printed invoice whose line amounts do not add up to its own
  // total is the defect F.101 exists to remove.
  //
  // The zero-subtotal guard moves INTO the helper and keeps its reason: a zero
  // subtotal must not be divided by, and it can only be reached with a zero
  // discount, because a positive amount discount would have thrown above.
  const lineDiscounts = allocateDiscount(
    perLine.map((p) => p.lineSubtotal),
    subtotal,
    discountAmount,
  );

  // ── Phase 4 — per-line tax (rounded individually) ─────────────────────
  const lines: TaxLineOutput[] = perLine.map(({ line, lineSubtotal }, lineIndex) => {
    // Non-null assertion is safe: allocateDiscount returns one entry per line.
    const lineDiscount = lineDiscounts[lineIndex]!;
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
    // SHAPE, NOT MEMBERSHIP (F.55, `docs/F55_SPEC.md` §1). A rate is tenant
    // data; the engine rejects only what cannot be a rate at all.
    //
    // The `typeof` check is load-bearing and is NOT redundant with the type.
    // The predecessor was `[0, 5, 12, 18, 28].includes(gstRate)` over a NUMBER
    // array, so it threw on the raw driver string '18.00' — which guaranteed
    // every caller coerced before calling. Six call sites widen a DB-read value
    // into `GstRate` with `as`, which is compile-time only: nothing at runtime
    // stops a string arriving here. Written `Number(x) < 0` this guard would
    // silently ACCEPT '18.00' and lose that property (day prompt D-3).
    //
    // The upper bound is the `numeric(5,2)` column's own magnitude, not a
    // statutory claim: no `<= 100`, no `<= 40` (spec §1).
    const rate: unknown = line.gstRate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 999.99) {
      throw new TaxComputationError(
        'INVALID_GST_RATE',
        `Line ${line.lineId}: gstRate ${String(line.gstRate)} is not a valid rate — ` +
          'expected a finite number >= 0 and <= 999.99 (the numeric(5,2) column bound)',
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

/**
 * Allocate a document-level discount across lines by LARGEST REMAINDER.
 *
 * Returns one amount per line, in input order, whose sum is EXACTLY
 * `discountAmount`. The document figure is the authority; this only decides how
 * it is split.
 *
 * ## The tie-break is part of the contract, not an implementation detail
 *
 * Order: **remainder descending, then LARGER `lineSubtotal`, then input index**
 * (F.101 D-1).
 *
 * The middle key is the one that matters, and it was chosen over the simpler
 * "input index alone". Index-only ordering makes the printed per-line figures a
 * function of how a caller happened to order its lines — and this engine cannot
 * enforce that ordering. Every caller sorts by `lineNumber` today, but that is a
 * fact about today's callers, not a property the engine holds; a future caller
 * loading lines by id would silently move which line carries the extra paisa.
 * Sorting by subtotal first makes the allocation a function of the document's
 * CONTENT rather than its PRESENTATION. The index key then only decides between
 * lines with equal subtotals, which are genuinely indistinguishable by value.
 *
 * ## Why ROUND_DOWN and not `round2`
 *
 * The base share must be the FLOOR at 2dp so every remainder is non-negative and
 * the sum of the bases never exceeds the document figure. `round2` is HALF_UP and
 * would produce negative remainders, which makes "largest remainder" meaningless
 * and could over-allocate.
 */
function allocateDiscount(
  lineSubtotals: Decimal[],
  subtotal: Decimal,
  discountAmount: Decimal,
): Decimal[] {
  const zero = new Decimal(0);
  // A zero subtotal must not be divided by. It can only be reached with a zero
  // discount, because a positive amount discount would already have thrown
  // DISCOUNT_EXCEEDS_SUBTOTAL; a zero discount allocates zero to every line
  // either way, so both cases take this branch.
  if (subtotal.isZero() || discountAmount.isZero()) return lineSubtotals.map(() => zero);

  const exact = lineSubtotals.map((s) => s.times(discountAmount).dividedBy(subtotal));
  const base = exact.map((e) => e.toDecimalPlaces(2, Decimal.ROUND_DOWN));

  // Both `discountAmount` and every `base` are exact at 2dp, so the shortfall is a
  // whole number of paise. Each line's remainder is strictly under one paisa, so
  // the shortfall is strictly fewer paise than there are lines — the loop below
  // can never run past the end of `order`.
  const shortfall = discountAmount.minus(sumDecimals(base)).times(100).toNumber();
  const paise = Math.round(shortfall);

  const order = base
    .map((b, i) => ({ i, remainder: exact[i]!.minus(b), lineSubtotal: lineSubtotals[i]! }))
    .sort(
      (a, b) =>
        b.remainder.comparedTo(a.remainder) ||
        b.lineSubtotal.comparedTo(a.lineSubtotal) ||
        a.i - b.i,
    );

  const out = base.slice();
  const onePaisa = new Decimal('0.01');
  for (let k = 0; k < paise; k++) {
    const target = order[k]!;
    out[target.i] = out[target.i]!.plus(onePaisa);
  }
  return out;
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
