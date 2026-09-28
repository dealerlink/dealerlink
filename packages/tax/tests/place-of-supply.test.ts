/**
 * F.5a — the §10(1)(a) / §10(1)(b) place-of-supply selection (ADR-016).
 *
 * ## THE SAME PAIR OF STATES IN EVERY BRANCH CASE, AND THAT IS THE POINT
 *
 * Both arrangement fixtures use ONE identical pair — bill-to `MH`, ship-to `AS`.
 * If each branch had its own pair, a test could pass while the function ignored
 * the arrangement entirely and simply returned whichever field happened to be
 * right for that pair. Holding the states fixed and varying only the arrangement
 * makes the arrangement the sole cause of the difference, which is the property
 * actually under test.
 *
 * The pair is not invented. It is `demo/PI-2026-0003` as F.5a's A.0 census
 * measured it: `tenant_state_at_issue = MH`, bill-to `MH`, ship-to `AS`, stored
 * `place_of_supply = AS`. That document is deliberately used as INPUT here and is
 * never written to — it is the evidence that arrangement (a) is preserved, so
 * reclassifying it would destroy the thing it is being kept for.
 *
 * It is also the pair where the two branches produce different TAX TYPES rather
 * than merely different strings: under (a) the place of supply is `AS`, which
 * differs from the tenant's `MH`, so the document is inter-state (IGST); under
 * (b) it is `MH`, equal to the tenant state, so it is intra-state (CGST+SGST).
 * A fixture whose branches differed in the resolved state but not in the
 * resulting classification would be a weaker test of a rule that exists to
 * decide classification.
 *
 * ## THE (b) CASE IS THE EXECUTED RED-THEN-GREEN CONTROL (F.5a A.4)
 *
 * Before the branch existed, every derivation in production resolved to the
 * ship-to state — `convert-quotation-to-pi.ts:71` and `update-pi.ts:41` are both
 * `(input.placeOfSupplyOverride ?? shipTo.state).toUpperCase()`. So the (b)
 * expectations below MUST fail against that behaviour, and they were run against
 * it and observed to fail before the branch was written. The failure output is in
 * the day's deviation entry. An assertion that has never been shown capable of
 * failing is not evidence (DEV.138).
 */
import { describe, expect, it } from 'vitest';

import {
  DELIVERY_ARRANGEMENTS,
  isDeliveryArrangement,
  resolvePlaceOfSupply,
  type DeliveryArrangement,
} from '../src/place-of-supply';

/** demo/PI-2026-0003 as the A.0 census measured it. Read-only fixture. */
const TENANT_STATE = 'MH';
const BILL_TO = 'MH';
const SHIP_TO = 'AS';

/** The classification the engine would reach, restated locally on purpose. */
function classify(tenantState: string, placeOfSupply: string): 'inter' | 'intra' {
  return tenantState.trim() !== placeOfSupply.trim() ? 'inter' : 'intra';
}

describe('resolvePlaceOfSupply — the two delivery arrangements', () => {
  it('§10(1)(a) resolves to the SHIP-TO state', () => {
    expect(
      resolvePlaceOfSupply({ arrangement: 's10_1_a', shipToState: SHIP_TO, billToState: BILL_TO }),
    ).toBe(SHIP_TO);
  });

  it('§10(1)(b) resolves to the BILL-TO state — same pair, opposite answer', () => {
    expect(
      resolvePlaceOfSupply({ arrangement: 's10_1_b', shipToState: SHIP_TO, billToState: BILL_TO }),
    ).toBe(BILL_TO);
  });

  it('the two branches produce DIFFERENT TAX TYPES on that one pair', () => {
    const a = resolvePlaceOfSupply({
      arrangement: 's10_1_a',
      shipToState: SHIP_TO,
      billToState: BILL_TO,
    });
    const b = resolvePlaceOfSupply({
      arrangement: 's10_1_b',
      shipToState: SHIP_TO,
      billToState: BILL_TO,
    });
    expect(classify(TENANT_STATE, a), '(a) is inter-state — MH selling into AS').toBe('inter');
    expect(classify(TENANT_STATE, b), '(b) is intra-state — MH billing MH').toBe('intra');
  });
});

describe('resolvePlaceOfSupply — (a) is the default, so nothing existing reclassifies', () => {
  // Each of these is a way the arrangement can be absent or unusable. All must
  // reproduce today's behaviour exactly, because the A.0 census measured the
  // entire seeded corpus as uniformly arrangement (a).
  const NOT_B: { label: string; value: string | null | undefined }[] = [
    { label: 'null — the parties are the same and the question was never asked', value: null },
    { label: 'undefined — the column was not selected', value: undefined },
    { label: 'empty string', value: '' },
    { label: 'an unrecognised value', value: 'some_future_clause' },
    { label: 'the (a) value itself', value: 's10_1_a' },
    { label: 'wrong case — the CHECK is case-sensitive, so this is not (b)', value: 'S10_1_B' },
    { label: 'whitespace-padded (b) — not the stored form', value: ' s10_1_b' },
  ];

  for (const c of NOT_B) {
    it(`resolves to the ship-to state for ${c.label}`, () => {
      expect(
        resolvePlaceOfSupply({
          arrangement: c.value,
          shipToState: SHIP_TO,
          billToState: BILL_TO,
        }),
      ).toBe(SHIP_TO);
    });
  }

  it('ONLY the exact stored (b) value selects bill-to', () => {
    // The positive half of the case above: the narrowness is deliberate, not an
    // oversight, so it is asserted rather than left implied.
    const selectsBillTo = [...NOT_B.map((c) => c.value), 's10_1_b'].filter(
      (v) =>
        resolvePlaceOfSupply({ arrangement: v, shipToState: SHIP_TO, billToState: BILL_TO }) ===
        BILL_TO,
    );
    expect(selectsBillTo).toEqual(['s10_1_b']);
  });
});

describe('resolvePlaceOfSupply — it returns an input unmodified', () => {
  it('does not trim or re-case the value it selects', () => {
    // The engine treats states as opaque strings and the caller guarantees one
    // format on both sides (`isInterState`). A second normaliser here would be a
    // second place that decides the state format.
    expect(
      resolvePlaceOfSupply({ arrangement: 's10_1_a', shipToState: ' as ', billToState: 'MH' }),
    ).toBe(' as ');
    expect(
      resolvePlaceOfSupply({ arrangement: 's10_1_b', shipToState: 'AS', billToState: ' mh ' }),
    ).toBe(' mh ');
  });
});

describe('the arrangement vocabulary', () => {
  it('is exactly the two clauses, enumerated rather than counted', () => {
    expect([...DELIVERY_ARRANGEMENTS]).toEqual(['s10_1_a', 's10_1_b']);
  });

  it('isDeliveryArrangement accepts both and rejects everything else', () => {
    for (const v of DELIVERY_ARRANGEMENTS) expect(isDeliveryArrangement(v)).toBe(true);
    for (const v of [null, undefined, '', 'S10_1_A', 's10_1_c', 0, {}, ['s10_1_a']]) {
      expect(isDeliveryArrangement(v), `${JSON.stringify(v)} must be rejected`).toBe(false);
    }
  });

  it('every permitted value is usable by resolvePlaceOfSupply', () => {
    // Guards the drift this pair of exports could develop independently: a value
    // added to DELIVERY_ARRANGEMENTS that the resolver does not handle would fall
    // through to (a) silently.
    const resolved = DELIVERY_ARRANGEMENTS.map((a: DeliveryArrangement) =>
      resolvePlaceOfSupply({ arrangement: a, shipToState: SHIP_TO, billToState: BILL_TO }),
    );
    expect(resolved).toEqual([SHIP_TO, BILL_TO]);
  });
});
