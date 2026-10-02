import { Decimal } from '@dealerlink/tax';

import { AppError } from '@/lib/errors';

/**
 * The whole-rupee total and its round-off term (F6 D-3).
 *
 * ## THE ROUNDING MODE IS A DECISION, NOT A DERIVATION
 *
 * The client's evidence is ONE voucher: `ROUND OFFS 0.46` closing
 * 12,629.50 + 557.02 + 557.02 = 13,743.54 against a stated total of 13,744.00. That
 * shows a whole-rupee total, rounded UP, once.
 *
 * **A single observation cannot distinguish four rules.** 13,743.54 → 13,744.00 is
 * equally consistent with HALF_UP, with always-up, and with banker's rounding.
 * HALF_UP is CHOSEN, as the ordinary commercial convention — it is not read off the
 * evidence, and this comment exists so nobody later mistakes it for a measurement.
 *
 * **If a tenant's accountant says otherwise, THIS is the line that changes**, and
 * the alternatives by name so that answer can be acted on without looking anything
 * up:
 *
 *  - `Decimal.ROUND_HALF_UP` — current. .50 and above goes up. ₹13,743.50 → ₹13,744.
 *  - `Decimal.ROUND_CEIL` — always up to the next rupee, however small the
 *    fraction. ₹13,743.01 → ₹13,744. Some suppliers do this deliberately.
 *  - `Decimal.ROUND_HALF_EVEN` — banker's rounding; .50 goes to the nearest EVEN
 *    rupee, so ₹13,743.50 → ₹13,744 but ₹13,744.50 → ₹13,744. Reduces cumulative
 *    bias across many documents and is what some accounting standards prefer.
 *
 * Changing it changes every tenant, because **F6 D-4 settled that round-off is
 * always applied with no per-tenant flag** — on CLAUDE.md §8's precedent, where the
 * fiscal year and the currency are likewise locked with the column already present.
 */
const ROUNDING_MODE = Decimal.ROUND_HALF_UP;

/** Below a rupee it is a rounding; at a rupee or more it is a mis-stated total. */
const MAX_ABS_ROUND_OFF = new Decimal(1);

export interface RoundOffResult {
  /** The whole-rupee figure written to `invoices.total_amount`. */
  storedTotal: Decimal;
  /** `storedTotal − (taxable + grouped tax)`. SIGNED. Written to `invoices.round_off`. */
  roundOff: Decimal;
}

/**
 * Compute the stored total and the round-off term, for WRITING at issuance.
 *
 * ## IT IS COMPUTED HERE AND STORED. THE LOADER READS IT AND ASSERTS IT.
 *
 * Both inputs come from the same `computeTax` call that produces the stored money
 * columns, so the identity holds by construction at write time. The PDF loader then
 * **reads** `round_off` and asserts the identity — it does not recompute it. A
 * reconciliation term computed at render time is a recomputation by another name,
 * which is precisely what F.152 removed; and a stored `round_off` that the loader
 * recomputed would be a column incapable of disagreeing with anything, which is
 * decoration rather than a check.
 *
 * ## GROUPED TAX, NOT STORED TAX
 *
 * `groupedTax` is the sum over the per-rate groups derived from the lines (F6 D-12,
 * acceptance criterion 3). Using the stored tax columns would compare two numbers
 * written by the same call and could not catch a grouping error.
 */
export function computeRoundOff(input: {
  /** The engine's own total, before whole-rupee rounding. */
  engineTotal: Decimal | string;
  /** The engine's taxable amount. */
  taxableAmount: Decimal | string;
  /** Sum of CGST+SGST+IGST over the per-rate GROUPS derived from the lines. */
  groupedTax: Decimal | string;
  /** For the diagnosis if the bound is breached. */
  documentLabel: string;
  /** Where to send whoever hits it — see the throw below. */
  sourceLabel: string;
}): RoundOffResult {
  const engineTotal = new Decimal(input.engineTotal);
  const taxableAmount = new Decimal(input.taxableAmount);
  const groupedTax = new Decimal(input.groupedTax);

  const storedTotal = engineTotal.toDecimalPlaces(0, ROUNDING_MODE);
  const roundOff = storedTotal.minus(taxableAmount.plus(groupedTax));

  if (roundOff.abs().greaterThanOrEqualTo(MAX_ABS_ROUND_OFF)) {
    // FAIL AT WRITE. Not clamped — clamping would store a false `round_off` and a
    // total that does not reconcile. Not stored either — that would trip
    // `invoices_round_off_chk` and surface as an opaque constraint name instead of
    // a problem.
    //
    // AND THE MESSAGE IS A DIAGNOSIS, because the cause is UPSTREAM and an operator
    // who hits this has no reason to guess that.
    throw new AppError(
      'CONFLICT',
      `Cannot issue ${input.documentLabel}: the round-off term computes to ` +
        `${roundOff.toFixed(2)}, a rupee or more. ` +
        `THAT IS A MIS-STATED TOTAL, NOT A ROUNDING — the engine's total ` +
        `(${engineTotal.toFixed(2)}) and the whole-rupee total ` +
        `(${storedTotal.toFixed(2)}) cannot legitimately differ by a rupee. ` +
        `LOOK UPSTREAM, AT ${input.sourceLabel}: its stored money columns disagree ` +
        `with what the tax engine computes from its own line items. Nothing is wrong ` +
        `with this invoice request; the document it descends from is already ` +
        `inconsistent, and issuing a tax invoice from it would put that inconsistency ` +
        `on a legal record. Reconcile the source document first.`,
    );
  }

  return { storedTotal, roundOff };
}

/** Exported for the boundary test — the bound the app enforces, so a test can assert it matches the CHECK. */
export const ROUND_OFF_BOUND = MAX_ABS_ROUND_OFF;
export const ROUND_OFF_MODE = ROUNDING_MODE;
