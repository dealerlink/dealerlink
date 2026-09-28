import { isInterState, resolvePlaceOfSupply, type DeliveryArrangement } from '@dealerlink/tax';

/**
 * The classification preview both Ship-To forms render, derived on the SERVER
 * (F.5a D-8).
 *
 * ## WHY THE FORMS DO NOT COMPUTE THIS THEMSELVES
 *
 * `convert-form.tsx` and `pi-edit-form.tsx` each carried their own copy of
 * `tenantState.trim() !== placeOfSupply.trim() ? 'IGST' : 'CGST + SGST'`. That was
 * already two implementations of a rule CLAUDE.md §5 says lives in exactly one
 * place; teaching each of them the §10(1)(a)/(b) branch would have made three,
 * and a client-side copy that drifts shows a FALSE tax classification to the
 * person choosing the arrangement — worse than showing none.
 *
 * So the rule stays in `packages/tax` and the answer is computed here, in a
 * server module, and passed down as data.
 *
 * ## NO ROUND TRIP, BECAUSE NONE IS NEEDED
 *
 * D-8 permits a round trip on every change and says to take it if a live preview
 * requires one. It does not: the arrangement has exactly TWO values, and the
 * candidate Ship-To dealers are already loaded and passed to the form. So the
 * complete preview is a small precomputed table — every (dealer, arrangement)
 * pair — built once per page render from the same functions the write path uses.
 * The form becomes a lookup, with no rule inside it and no latency.
 *
 * If the candidate list ever grows past a few hundred dealers this becomes the
 * wrong shape and a round trip becomes the right one. It is 200 today
 * (`listDealers(..., { limit: 200 })`), so two entries per dealer is 400 rows of
 * two short strings.
 *
 * ## IT MIRRORS THE WRITE PATH DELIBERATELY
 *
 * `resolvePlaceOfSupply` here is the same function
 * `convert-quotation-to-pi.ts` and `update-pi.ts` call, so the preview cannot
 * disagree with what gets stored. The one thing this does NOT model is
 * `placeOfSupplyOverride`, which wins over the arrangement (ADR-016) — and that is
 * correct rather than an omission, because no UI sets the override, so no form can
 * preview one. If a UI ever does, this module must take it as an input on the same
 * day, or the preview starts lying.
 */

/** What a form needs to render one candidate choice. */
export type PlaceOfSupplyPreview = {
  /** The state the place of supply resolves to. */
  placeOfSupply: string;
  /** How the tax will be split. Label, not a rule — the rule produced it. */
  taxLabel: 'IGST' | 'CGST + SGST';
  isInterState: boolean;
};

/**
 * Keyed `"<shipToDealerId>|<arrangement>"`, where `arrangement` is the literal
 * string `'none'` when the parties match and the question is not asked.
 *
 * A flat string-keyed record rather than a nested object because it crosses the
 * server/client boundary as JSON and a missing key must be detectable: the form
 * asserts on lookup rather than falling back to a computed default, since a
 * silent fallback would reintroduce the client-side rule this module exists to
 * remove.
 */
export type PlaceOfSupplyPreviewMap = Record<string, PlaceOfSupplyPreview>;

export function previewKey(
  shipToDealerId: string,
  arrangement: DeliveryArrangement | 'none',
): string {
  return `${shipToDealerId}|${arrangement}`;
}

function build(
  tenantState: string,
  shipToState: string,
  billToState: string,
  arrangement: DeliveryArrangement | 'none',
): PlaceOfSupplyPreview {
  const placeOfSupply = resolvePlaceOfSupply({
    // 'none' is not a stored arrangement — it resolves to (a) like any absent
    // value, which is the whole point of the default.
    arrangement: arrangement === 'none' ? null : arrangement,
    shipToState,
    billToState,
  }).toUpperCase();
  const inter = isInterState(tenantState, placeOfSupply);
  return { placeOfSupply, taxLabel: inter ? 'IGST' : 'CGST + SGST', isInterState: inter };
}

/**
 * Every (candidate Ship-To, arrangement) combination, precomputed.
 *
 * `billTo` is fixed for a document: Bill-To is the quotation's dealer on convert,
 * and immutable on a PI edit. Only Ship-To and the arrangement vary.
 */
export function buildPlaceOfSupplyPreviews(input: {
  tenantState: string;
  billTo: { id: string; state: string };
  candidates: { id: string; state: string }[];
}): PlaceOfSupplyPreviewMap {
  const map: PlaceOfSupplyPreviewMap = {};
  const billToState = input.billTo.state;
  for (const c of input.candidates) {
    // When the candidate IS the Bill-To, the parties match, the question cannot
    // arise, and only the 'none' entry is meaningful. The two arrangement entries
    // are still emitted — they resolve identically, since both parties' states are
    // the same string — so a form that keys on a stale arrangement while the user
    // switches back to the Bill-To dealer cannot hit a missing key.
    for (const arrangement of ['none', 's10_1_a', 's10_1_b'] as const) {
      map[previewKey(c.id, arrangement)] = build(
        input.tenantState,
        c.state,
        billToState,
        arrangement,
      );
    }
  }
  return map;
}
