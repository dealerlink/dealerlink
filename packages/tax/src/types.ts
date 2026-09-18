import { Decimal } from 'decimal.js';

/**
 * A GST rate as a percentage.
 *
 * SHAPE, NOT MEMBERSHIP (F.55, `docs/F55_SPEC.md` §1). This was the union
 * `0 | 5 | 12 | 18 | 28` — an enumeration of the slabs that existed when it was
 * written, which is a statutory claim and went stale in both directions: it never
 * carried 3% (which the DB CHECK accepted from 2026-09-07), and it still carried
 * 12% and 28% after the September 2025 rationalisation removed them.
 *
 * A rate is now TENANT DATA rather than application knowledge. The engine holds
 * no opinion about which rates exist; it rejects only values that cannot be a
 * rate at all — see `validateInput` in `compute.ts`, which enforces
 * non-negative and within the `numeric(5,2)` column's own magnitude.
 *
 * The alias is kept rather than replaced by `number` at each site: it documents
 * intent at the six call sites that widen a DB-read value into it, and renaming
 * it would have been churn rather than a change.
 */
export type GstRate = number;

export type TaxLineInput = {
  /** Unique line identifier — passed through to output for reconciliation. */
  lineId: string;
  /** Quantity (can be fractional, e.g. 2.5 kg). */
  quantity: number | string | Decimal;
  /** Unit price in INR (decimal, 2-3 places typical). */
  unitPrice: number | string | Decimal;
  /** GST rate as a percentage. Shape-validated, not enumerated — see `GstRate`. */
  gstRate: GstRate;
};

export type TaxDiscount =
  | { type: 'percent'; value: number | string | Decimal } // 0-100
  | { type: 'amount'; value: number | string | Decimal } // INR
  | null;

export type TaxComputationInput = {
  /** Tenant's state at point of issue (opaque string; consistent format per DEV.33). */
  tenantState: string;
  /** Place of supply (opaque string; same format as tenantState). */
  placeOfSupply: string;
  /** Line items — at least one required. */
  lines: TaxLineInput[];
  /** Document-level discount applied BEFORE tax. */
  discount: TaxDiscount;
};

export type TaxLineOutput = {
  lineId: string;
  /** Quantity × unitPrice (pre-discount, pre-tax). */
  lineSubtotal: Decimal;
  /** Portion of the document discount allocated to this line. */
  lineDiscount: Decimal;
  /** lineSubtotal − lineDiscount. */
  lineTaxable: Decimal;
  /** GST rate for this line. */
  gstRate: GstRate;
  /** CGST amount for this line (zero if inter-state). */
  lineCgst: Decimal;
  /** SGST amount for this line (zero if inter-state). */
  lineSgst: Decimal;
  /** IGST amount for this line (zero if intra-state). */
  lineIgst: Decimal;
  /** Total tax on this line (cgst + sgst + igst). */
  lineTaxTotal: Decimal;
  /** lineTaxable + lineTaxTotal. */
  lineTotal: Decimal;
};

export type TaxComputationOutput = {
  /** Sum of line subtotals (pre-discount, pre-tax). */
  subtotal: Decimal;
  /** Document-level discount amount in INR. */
  discountAmount: Decimal;
  /** subtotal − discountAmount. */
  taxableAmount: Decimal;
  /** Aggregate CGST across all lines (0 if inter-state). */
  cgstAmount: Decimal;
  /** Aggregate SGST across all lines (0 if inter-state). */
  sgstAmount: Decimal;
  /** Aggregate IGST across all lines (0 if intra-state). */
  igstAmount: Decimal;
  /** taxableAmount + cgstAmount + sgstAmount + igstAmount. */
  totalAmount: Decimal;
  /** True if tenantState !== placeOfSupply. */
  isInterState: boolean;
  /** Per-line breakdown — same length and order as the input lines. */
  lines: TaxLineOutput[];
};

export type TaxErrorCode =
  | 'EMPTY_LINES'
  | 'NEGATIVE_QUANTITY'
  | 'NEGATIVE_UNIT_PRICE'
  | 'INVALID_GST_RATE'
  | 'NEGATIVE_DISCOUNT'
  | 'DISCOUNT_EXCEEDS_SUBTOTAL'
  | 'DISCOUNT_PERCENT_OUT_OF_RANGE'
  | 'EMPTY_STATE';

/**
 * The single error type the engine throws. Callers can branch on `.code`
 * for stable, message-independent handling.
 */
export class TaxComputationError extends Error {
  public readonly code: TaxErrorCode;

  constructor(code: TaxErrorCode, message: string) {
    super(message);
    this.name = 'TaxComputationError';
    this.code = code;
  }
}
