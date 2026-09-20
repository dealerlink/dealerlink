import { computeTax } from './compute';
import { Decimal, sumDecimals } from './decimal';
import type { GstRate, TaxComputationOutput, TaxDiscount, TaxLineInput } from './types';

/**
 * Rate-wise and HSN-wise GST summary (F.3, `docs/F3_F4_SPEC.md` §2-§4).
 *
 * This module GROUPS; it does not compute tax. All money comes from
 * `computeTax`, which is the single authoritative engine (CLAUDE.md §7), and
 * this file adds no arithmetic beyond summing values the engine already
 * rounded.
 *
 * ## The rounding rule that makes the totals reconcile
 *
 * `computeTax` rounds **per line** (`compute.ts:64-69`) and its document totals
 * are sums of those rounded per-line figures (`compute.ts:90-92`). This module
 * sums the same already-rounded per-line values into groups, so
 * `sum(byRate) === sum(byHsn) === stored header totals` **exactly**, with no
 * paise drift. **Never round at the group level** — rounding a group's total
 * after summing, or deriving a group's tax as rate × its taxable value, both
 * reintroduce the drift this ordering exists to avoid. F.84 measured the
 * difference at CGST 562.39 (per-line) against 562.38 (document-level) on a 3%
 * intra-state document, so it is a real paisa, not a theoretical one.
 *
 * Round-off is **not** here. It is computed once at document level and belongs
 * to F.6; `totals` carries no `roundOff` field by design (day prompt A.1).
 */

/**
 * A line as this module needs it: `computeTax`'s input plus the HSN code, which
 * the engine neither takes nor returns (`TaxLineInput` and `TaxLineOutput` have
 * no HSN field — there is no HSN concept anywhere in `packages/tax`). The HSN
 * is carried alongside and rejoined positionally.
 */
export type SummaryLineInput = TaxLineInput & {
  /** HSN code as stored on the line row. Opaque string; never parsed. */
  hsnCode: string;
};

export type TaxSummaryInput = {
  tenantState: string;
  placeOfSupply: string;
  lines: SummaryLineInput[];
  discount: TaxDiscount;
};

/** One group per distinct GST rate actually present. */
export type RateGroup = {
  /** The GST rate, as a number. */
  rate: GstRate;
  /** Sum of the group's per-line taxable amounts (post-discount). */
  taxableValue: Decimal;
  /** Half the rate on an intra-state document; `null` inter-state. */
  cgstRate: number | null;
  cgstAmount: Decimal;
  /** Half the rate on an intra-state document; `null` inter-state. */
  sgstRate: number | null;
  sgstAmount: Decimal;
  /** The full rate on an inter-state document; `null` intra-state. */
  igstRate: number | null;
  igstAmount: Decimal;
};

/**
 * One row per distinct **(HSN, rate) pair** actually present.
 *
 * **The pair is the key, not the HSN** — `docs/F3_F4_SPEC.md` §2, corrected
 * 2026-09-20. The HSN partition and the rate partition are independent: seed
 * Chain B puts HSN `85414300` on both an 18% line and a 5% line
 * (`multi-rate.ts:380-404`), so that HSN yields TWO rows, and the document yields
 * three rows in total rather than two.
 *
 * The spec originally said one row per HSN with a scalar rate, which is
 * incoherent on exactly that document. A nullable rate was considered and
 * rejected: a row whose rate is null cannot resolve a Tally ledger, which is what
 * F.11 needs the table for.
 */
export type HsnGroup = {
  hsn: string;
  /** The rate for this row. Always present — the pair is the grouping key. */
  rate: GstRate;
  taxableValue: Decimal;
  /** Half the rate on an intra-state document; `null` inter-state. */
  centralRate: number | null;
  centralAmount: Decimal;
  /** Half the rate on an intra-state document; `null` inter-state. */
  stateRate: number | null;
  stateAmount: Decimal;
  /** The full rate on an inter-state document; `null` intra-state. */
  integratedRate: number | null;
  integratedAmount: Decimal;
  /** centralAmount + stateAmount + integratedAmount. */
  totalTax: Decimal;
};

export type TaxSummaryTotals = {
  /** Sum of line subtotals, pre-discount and pre-tax. */
  subtotal: Decimal;
  /** Document-level discount in INR. */
  discountAmount: Decimal;
  taxableValue: Decimal;
  totalCgst: Decimal;
  totalSgst: Decimal;
  totalIgst: Decimal;
  totalTax: Decimal;
  /** taxableValue + totalTax. No round-off — that is F.6. */
  grandTotal: Decimal;
};

/**
 * The rate-wise half on its own, for callers that have no HSN to group by.
 *
 * The quotation builder's live preview is the case this exists for: its
 * `PreviewLine` carries quantity, unitPrice and gstRate and **no HSN**
 * (`apps/web/lib/quotation/preview.ts`), and the builder shows a rate-wise block
 * rather than an HSN table. Passing a placeholder HSN to `computeTaxSummary` and
 * ignoring `byHsn` would put fabricated rows in a real return value, which the
 * next reader would eventually believe. This returns only what the caller can
 * actually supply.
 */
export type RateSummary = {
  byRate: RateGroup[];
  totals: TaxSummaryTotals;
  isInterState: boolean;
};

export type TaxSummary = {
  /** Ascending by rate. One entry per distinct rate. */
  byRate: RateGroup[];
  /**
   * Ascending by HSN string, then by rate within an HSN. One entry per distinct
   * **(HSN, rate) pair** — so this array can be longer than the number of
   * distinct HSN codes. See `HsnGroup`.
   */
  byHsn: HsnGroup[];
  totals: TaxSummaryTotals;
  isInterState: boolean;
};

/**
 * Group a document's stored lines into rate-wise and HSN-wise summaries.
 *
 * Errors are `computeTax`'s own — this function adds no validation and throws
 * nothing of its own, so a caller already handling `TaxComputationError` needs
 * no new branch.
 *
 * @throws {TaxComputationError} whatever `computeTax` throws for this input.
 */
export function computeTaxSummary(input: TaxSummaryInput): TaxSummary {
  const out = runEngine(input);
  assertPositional(out.lines.length, input.lines.length);

  const interState = out.isInterState;

  // Keyed by "<hsn>|<numeric rate>". The rate half of the key is the NUMBER, so
  // '5.0' and '5.00' cannot become two rows (the same argument the rate key makes).
  const hsnGroups = new Map<
    string,
    {
      hsn: string;
      rate: number;
      taxable: Decimal[];
      cgst: Decimal[];
      sgst: Decimal[];
      igst: Decimal[];
    }
  >();

  out.lines.forEach((line, i) => {
    // Non-null assertion is safe under assertPositional above.
    const hsn = input.lines[i]!.hsnCode;
    const rate = line.gstRate;
    const key = `${hsn}|${rate}`;
    let hg = hsnGroups.get(key);
    if (!hg) {
      hg = { hsn, rate, taxable: [], cgst: [], sgst: [], igst: [] };
      hsnGroups.set(key, hg);
    }
    hg.taxable.push(line.lineTaxable);
    hg.cgst.push(line.lineCgst);
    hg.sgst.push(line.lineSgst);
    hg.igst.push(line.lineIgst);
  });

  const byHsn: HsnGroup[] = [...hsnGroups.values()]
    // HSN ascending (string), then rate ascending within an HSN.
    .sort((x, y) => (x.hsn < y.hsn ? -1 : x.hsn > y.hsn ? 1 : x.rate - y.rate))
    .map((g) => {
      const central = sumDecimals(g.cgst);
      const state = sumDecimals(g.sgst);
      const integrated = sumDecimals(g.igst);
      return {
        hsn: g.hsn,
        rate: g.rate,
        taxableValue: sumDecimals(g.taxable),
        centralRate: interState ? null : g.rate / 2,
        centralAmount: central,
        stateRate: interState ? null : g.rate / 2,
        stateAmount: state,
        integratedRate: interState ? g.rate : null,
        integratedAmount: integrated,
        totalTax: central.plus(state).plus(integrated),
      };
    });

  return { byRate: groupByRate(out), byHsn, totals: totalsFrom(out), isInterState: interState };
}

/**
 * Rate-wise grouping only, for callers with no HSN. See `RateSummary`.
 *
 * @throws {TaxComputationError} whatever `computeTax` throws for this input.
 */
export function computeRateSummary(input: {
  tenantState: string;
  placeOfSupply: string;
  lines: TaxLineInput[];
  discount: TaxDiscount;
}): RateSummary {
  const out = computeTax(input);
  return { byRate: groupByRate(out), totals: totalsFrom(out), isInterState: out.isInterState };
}

// ── shared internals ────────────────────────────────────────────────────────

function runEngine(input: TaxSummaryInput) {
  return computeTax({
    tenantState: input.tenantState,
    placeOfSupply: input.placeOfSupply,
    discount: input.discount,
    lines: input.lines.map((l) => ({
      lineId: l.lineId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      gstRate: l.gstRate,
    })),
  });
}

/**
 * `out.lines` is documented as "same length and order as the input lines"
 * (`types.ts`), which is what makes rejoining the HSN by index correct. This
 * turns a silent mis-zip into a loud failure if that contract ever changes.
 */
function assertPositional(got: number, want: number): void {
  if (got !== want) {
    throw new Error(
      `computeTax returned ${got} lines for ${want} inputs — ` +
        'the positional contract in TaxLineOutput no longer holds',
    );
  }
}

function groupByRate(out: TaxComputationOutput): RateGroup[] {
  const interState = out.isInterState;
  // Keyed by the NUMERIC rate. Two DB rows cannot disagree on spelling (all four
  // rate columns are decimal(5,2), so Postgres returns the canonical '18.00' —
  // DEV.135), but a numeric key is still the right key: a caller passing '5.0'
  // and '5.00' would dedupe as two strings and one number, and the engine has
  // already coerced these to numbers by rejecting anything else.
  const groups = new Map<
    number,
    { taxable: Decimal[]; cgst: Decimal[]; sgst: Decimal[]; igst: Decimal[] }
  >();
  for (const line of out.lines) {
    let g = groups.get(line.gstRate);
    if (!g) {
      g = { taxable: [], cgst: [], sgst: [], igst: [] };
      groups.set(line.gstRate, g);
    }
    g.taxable.push(line.lineTaxable);
    g.cgst.push(line.lineCgst);
    g.sgst.push(line.lineSgst);
    g.igst.push(line.lineIgst);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, g]) => ({
      rate,
      taxableValue: sumDecimals(g.taxable),
      cgstRate: interState ? null : rate / 2,
      cgstAmount: sumDecimals(g.cgst),
      sgstRate: interState ? null : rate / 2,
      sgstAmount: sumDecimals(g.sgst),
      igstRate: interState ? rate : null,
      igstAmount: sumDecimals(g.igst),
    }));
}

/**
 * Totals come from the ENGINE's own document figures, never re-summed from the
 * groups. That is what makes the reconciliation tests a real check: if the
 * grouping dropped or duplicated a line, sum(byRate) would disagree with these
 * and the test fails. Re-summing the groups here would compare a number with
 * itself.
 */
function totalsFrom(out: TaxComputationOutput): TaxSummaryTotals {
  return {
    subtotal: out.subtotal,
    discountAmount: out.discountAmount,
    taxableValue: out.taxableAmount,
    totalCgst: out.cgstAmount,
    totalSgst: out.sgstAmount,
    totalIgst: out.igstAmount,
    totalTax: out.cgstAmount.plus(out.sgstAmount).plus(out.igstAmount),
    grandTotal: out.totalAmount,
  };
}
