/**
 * Which party's state is the place of supply — the IGST Act 2017 §10(1)(a) /
 * §10(1)(b) selection. ADR-016.
 *
 * ## Why this lives in `packages/tax` and not in the actions that call it
 *
 * CLAUDE.md §5 puts tax math in this package and says never to inline it in
 * routes. This is not arithmetic, but it is the same KIND of rule as
 * `isInterState`: a statutory classification, stated once, testable without a
 * database. The two production callers each derive a place of supply in one
 * line; without this file that one line would become a two-branch conditional
 * duplicated in both, which is how `convert-form.tsx:26-27` and
 * `pi-edit-form.tsx:58` already came to hold two copies of the inter/intra rule.
 *
 * ## The two rules
 *
 * - **§10(1)(a)** — goods are delivered to the recipient. The place of supply is
 *   where delivery ends, so it derives from the **SHIP-TO** state. This is the
 *   default and the overwhelmingly common case: a dealer buying for its own
 *   premises, or for another of its own sites.
 * - **§10(1)(b)** — goods are delivered to someone else **on the direction of a
 *   third person** (the classic bill-to/ship-to). The place of supply is that
 *   third person's principal place of business, so it derives from the
 *   **BILL-TO** state.
 *
 * The arrangement is a fact about the transaction, recorded per document. It is
 * not a tenant setting — ADR-012 rejected that at `DECISIONS.md:591` on the
 * ground that §10 is statute and not a preference, and that rejection stands.
 *
 * ## (a) IS THE DEFAULT, AND THAT IS LOAD-BEARING RATHER THAN CONVENIENT
 *
 * `null`, `undefined` and any unrecognised value all resolve to (a). This is
 * what makes "no existing document reclassifies" a measured fact instead of a
 * hope: F.5a's A.0 census measured all EIGHT differing-party documents in the
 * seeded corpus (6 of 68 PIs, 2 of 48 orders) and found `place_of_supply` equal
 * to the ship-to state in every one, so the corpus is uniformly arrangement (a).
 * Defaulting to (a) therefore reproduces today's stored classification exactly,
 * for every row, without writing to a single existing column.
 *
 * A NOTE ON THE UNRECOGNISED CASE, because "be liberal in what you accept" is
 * usually the wrong instinct in a tax path: the column carries a CHECK
 * constraint, so an unrecognised value cannot arrive from the database. The
 * branch exists for the boundary where a value arrives from somewhere else — a
 * form post, a migration in flight, a future caller — and there, falling back to
 * the behaviour the whole corpus already has is safer than throwing, because
 * throwing would make an unparseable arrangement break a document that renders
 * correctly today.
 *
 * ## What this function does NOT do
 *
 * It does not know about `placeOfSupplyOverride`. Per ADR-016, an override that
 * is set WINS over this selection, because the override names a place of supply
 * directly while the arrangement only selects which party to derive one from.
 * That precedence is applied by the CALLER, which is the only place that can see
 * both; putting it here would mean this function silently ignoring one of its own
 * arguments. See ADR-016 and F.132.
 */

/**
 * The delivery arrangement, as stored in
 * `performa_invoices.delivery_arrangement` / `orders.delivery_arrangement`.
 *
 * The values name the STATUTE SUB-CLAUSE, not the party they select. That is
 * deliberate: a value named for its effect (`'ship_to'` / `'bill_to'`) would
 * restate the derivation inside the data, so if the derivation were ever
 * corrected, every stored row would become a false record of what was decided.
 * A clause reference cannot drift from the statute it cites.
 */
export type DeliveryArrangement = 's10_1_a' | 's10_1_b';

/** The two permitted values, for reuse by schema and validation code. */
export const DELIVERY_ARRANGEMENTS: readonly DeliveryArrangement[] = ['s10_1_a', 's10_1_b'];

/** True for a value this module recognises. Narrows an arbitrary string. */
export function isDeliveryArrangement(value: unknown): value is DeliveryArrangement {
  return value === 's10_1_a' || value === 's10_1_b';
}

export type PlaceOfSupplyInput = {
  /** The recorded arrangement. `null`/`undefined` means it was never asked. */
  arrangement: string | null | undefined;
  /** The Ship-To party's state, in whatever format the caller uses throughout. */
  shipToState: string;
  /** The Bill-To party's state, in the same format. */
  billToState: string;
};

/**
 * Resolve the place of supply to the state of whichever party the arrangement
 * selects. Pure: no I/O, no request context, no state vocabulary.
 *
 * The returned value is one of the two inputs, UNMODIFIED — not trimmed, not
 * uppercased. Normalising here would make this function the second place that
 * decides the state format, and `isInterState` already documents the engine's
 * position: states are opaque strings and the caller guarantees one format on
 * both sides.
 */
export function resolvePlaceOfSupply(input: PlaceOfSupplyInput): string {
  return input.arrangement === 's10_1_b' ? input.billToState : input.shipToState;
}
