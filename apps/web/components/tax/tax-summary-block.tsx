import { formatTaxAmount } from '@/lib/format';

/**
 * The shared rate-wise tax block (F.3, `docs/F3_F4_SPEC.md` §2 and §5).
 *
 * One row per distinct GST rate actually present, replacing the single
 * `CGST @ mixed` / bare `CGST` rows that four screens rendered independently.
 * This is a **presentation** component: it takes already-computed groups and
 * formats them. It performs no arithmetic and no grouping — `computeTaxSummary`
 * in `@dealerlink/tax` owns both (CLAUDE.md §7).
 *
 * ## What this closes
 *
 * - **P-7** (`docs/UX_FINDINGS.md:156`) — the saved quotation, PI and order views
 *   rendered `CGST` / `SGST` / `IGST` with **no rate at all**, so a customer could
 *   not verify what they were charged. Every row now states its rate.
 * - **P-8** (`:164`) — amounts rendered at 1 decimal, so `211.50` displayed as
 *   `₹211.5`. Every amount here goes through `formatTaxAmount`, which forces 2dp.
 *   A rate group can legitimately end in `.50`.
 *
 * ## Serializable props, deliberately
 *
 * Amounts arrive as a string OR a number, never `Decimal`. `Decimal` does not survive the
 * Server Component boundary, and three of the four call sites are server-rendered
 * pages reading stored columns. Callers pass `String(...)` or the value straight
 * out of the DB driver, or a number from the builder's in-memory preview. This
 * component coerces once for formatting and never does money math on the result.
 */

/**
 * One rate group, already summed by `@dealerlink/tax`. Amounts are whatever the
 * caller holds — a fixed-2dp string from the DB, or a number from the builder's
 * in-memory preview. Formatting happens here; no arithmetic does.
 */
export type TaxSummaryRow = {
  /** The GST rate as a number, e.g. `18` or `2.5`. */
  rate: number;
  /** Half the rate on an intra-state document; `null` inter-state. */
  cgstRate: number | null;
  cgstAmount: string | number;
  /** Half the rate on an intra-state document; `null` inter-state. */
  sgstRate: number | null;
  sgstAmount: string | number;
  /** The full rate on an inter-state document; `null` intra-state. */
  igstRate: number | null;
  igstAmount: string | number;
};

export type TaxSummaryBlockProps = {
  rows: TaxSummaryRow[];
  isInterState: boolean;
  /**
   * When the caller has no rate groups to show — an empty builder, a document
   * whose lines have not loaded. Renders a single em-dash row rather than
   * nothing, so the block never collapses silently.
   */
  emptyLabel?: string;
};

/**
 * Format a rate for a label: `9`, `2.5`, `1.5` — never `9.0`.
 *
 * Trailing zeros are dropped because a half-rate is frequently fractional
 * (3% halves to 1.5%, 5% to 2.5%) and `9.0%` reads as a precision claim the
 * number does not make. `Number.prototype.toString` already does this; the
 * wrapper exists so the intent is stated once rather than inferred at four
 * call sites.
 */
function rateLabel(rate: number): string {
  return `${rate}%`;
}

function Row({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline justify-between" data-testid={testId}>
      <dt className="text-mute text-[12px]">{label}</dt>
      <dd className="text-ink font-mono text-[12.5px]">{value}</dd>
    </div>
  );
}

export function TaxSummaryBlock({
  rows,
  isInterState,
  emptyLabel = 'No tax lines',
}: TaxSummaryBlockProps) {
  if (rows.length === 0) {
    return (
      <div className="flex items-baseline justify-between" data-testid="tax-summary-empty">
        <dt className="text-mute text-[12px]">{emptyLabel}</dt>
        <dd className="text-mute font-mono text-[12.5px]">—</dd>
      </div>
    );
  }

  return (
    <>
      {rows.map((r) =>
        isInterState ? (
          // Inter-state: one IGST row per rate, at the FULL rate.
          <Row
            key={`igst-${r.rate}`}
            label={`IGST @ ${rateLabel(r.igstRate ?? r.rate)}`}
            value={formatTaxAmount(Number(r.igstAmount))}
            testId={`igst-row-${r.rate}`}
          />
        ) : (
          // Intra-state: a CGST and an SGST row per rate, each at HALF the rate.
          // Rendered as a fragment rather than two sibling maps so the pair stays
          // adjacent for a given rate — a reader reconciling a document reads
          // CGST 2.5% / SGST 2.5% together, not all the CGSTs then all the SGSTs.
          <div key={`intra-${r.rate}`} className="contents">
            <Row
              label={`CGST @ ${rateLabel(r.cgstRate ?? r.rate / 2)}`}
              value={formatTaxAmount(Number(r.cgstAmount))}
              testId={`cgst-row-${r.rate}`}
            />
            <Row
              label={`SGST @ ${rateLabel(r.sgstRate ?? r.rate / 2)}`}
              value={formatTaxAmount(Number(r.sgstAmount))}
              testId={`sgst-row-${r.rate}`}
            />
          </div>
        ),
      )}
    </>
  );
}
