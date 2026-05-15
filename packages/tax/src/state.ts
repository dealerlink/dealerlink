/**
 * Inter-state vs intra-state determination.
 *
 * Per DEV.33, state values are stored as full names ("Maharashtra",
 * "Karnataka") rather than 2-letter codes. The engine treats them as
 * OPAQUE STRINGS: it does not normalise, map, or know any state vocabulary.
 * It only requires that the caller passes both values in the same format.
 *
 * Comparison is a case-SENSITIVE exact match after trimming surrounding
 * whitespace. Case sensitivity is deliberate — the persisted data is already
 * uppercased consistently at the write boundary
 * (`create-quotation.ts` → `.toUpperCase()`), so a case mismatch here would
 * signal a genuine data inconsistency rather than something to paper over.
 */
export function isInterState(tenantState: string, placeOfSupply: string): boolean {
  return tenantState.trim() !== placeOfSupply.trim();
}
