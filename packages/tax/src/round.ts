import { Decimal } from 'decimal.js';

/**
 * Rounding policy for the GST engine.
 *
 * DECISION — line-level tax rounding.
 * Indian GST invoicing rounds the tax of *each line* to 2 decimal places,
 * then sums the rounded line taxes to get the document tax totals. This is
 * the convention followed by the BRD §4 reference purchase order
 * (`3 PO Premier.pdf`) and by standard accounting software (Tally, Zoho).
 * The engine therefore calls `round2` on every per-line CGST/SGST/IGST
 * value, and the document `cgstAmount`/`sgstAmount`/`igstAmount` are the
 * sums of those already-rounded line values — never a re-rounded aggregate.
 *
 * THE DISCOUNT GOES THE OTHER WAY, and the asymmetry is deliberate. Tax is
 * computed per line and summed upward; the discount is computed once at
 * document level and allocated downward, by largest remainder, so the
 * per-line shares sum to the document figure exactly (F.101). Rounding each
 * line's share independently — the obvious alternative — does not sum, because
 * the per-line errors do not cancel.
 *
 * CLAUDE.md §6 says "Round-off: applied at grand total, not per line". That
 * rule concerns a *different* quantity: the optional whole-rupee "Round Off"
 * adjustment line that nudges the grand total to a round figure (±0.99
 * paise). That is a separate, document-level line item — it is NOT modelled
 * by this engine (the quotation schema has no round-off column in Phase 1),
 * and it does not contradict line-level rounding of the tax components
 * themselves. If/when a round-off line is introduced, it is computed once on
 * `totalAmount`, consistent with §6.
 */
export function round2(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
