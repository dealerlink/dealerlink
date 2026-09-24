/**
 * The rate-wise tax rows as the Typst totals block consumes them (F.4).
 *
 * **Imported by BOTH view builders — `pdf/view-model.ts` and
 * `scripts/render-typst.ts`.** That is the point of the module. `render-typst.ts` is a
 * fork of `view-model.ts` (F.108) and is also the harness every byte measurement runs
 * through, so a derivation added to only one of them would leave the instrument
 * reporting the old output while production moved — a false negative, DEV.138's
 * signature. Sharing one function is not the fork's removal, which is F.108's work; it
 * is a refusal to widen it.
 *
 * ## The label format is load-bearing, not cosmetic
 *
 * All 8 tax-bearing reference documents are single-rate 18% (measured 2026-09-24, not
 * inferred). Today `view-model.ts` renders their half-rate label as
 * `` `${Number('18') / 2}%` `` → `9%`. These rows MUST reproduce that byte for byte: a
 * `9.0%` or `9.00%` would move all 8 references for a formatting reason, which voids the
 * F.4 day prompt's R2 partition — the added segment would no longer be the HSN table
 * alone. `${n}%` on a `number` is what produces `9%`, `2.5%`, `1.5%`; `toFixed` is not,
 * and must not be introduced here.
 */
import { formatMoney } from '../lib/format';

export type TaxRateGroupInput = {
  rate: number;
  cgstRate: number | null;
  cgstAmount: number;
  sgstRate: number | null;
  sgstAmount: number;
  igstRate: number | null;
  igstAmount: number;
};

/** A label/amount pair, ready for `totals-block`'s `rows:` tuple. */
export type TaxRow = { label: string; amount: string };

/**
 * Format a rate for a label: `9`, `2.5`, `1.5` — never `9.0`.
 *
 * Trailing zeros are dropped because a half-rate is frequently fractional (3% halves to
 * 1.5%, 5% to 2.5%) and `9.0%` reads as a precision claim the number does not make.
 * `Number.prototype.toString` already does this; the wrapper states the intent once.
 */
export function rateLabel(rate: number): string {
  return `${rate}%`;
}

/**
 * One row per rate on an inter-state document; two — CGST then SGST — per rate on an
 * intra-state one, so a reader reconciling a document reads the pair for a given rate
 * together rather than all the CGSTs then all the SGSTs.
 *
 * Money is formatted HERE rather than by `MONEY_KEYS` (D-4). `MONEY_KEYS` is a global
 * name-keyed rule applied by field name in two forked files; adding names to it would
 * have to be done twice and would silently catch any future field sharing one.
 */
export function buildTaxRows(groups: TaxRateGroupInput[], isInterState: boolean): TaxRow[] {
  return groups.flatMap((g) =>
    isInterState
      ? [{ label: `IGST ${rateLabel(g.igstRate ?? g.rate)}`, amount: formatMoney(g.igstAmount) }]
      : [
          {
            label: `CGST ${rateLabel(g.cgstRate ?? g.rate / 2)}`,
            amount: formatMoney(g.cgstAmount),
          },
          {
            label: `SGST ${rateLabel(g.sgstRate ?? g.rate / 2)}`,
            amount: formatMoney(g.sgstAmount),
          },
        ],
  );
}
