/**
 * The Typst view model — the boundary between loaded document data and a
 * template (F.38 Day 27).
 *
 * Money and dates are formatted HERE, with the SAME `Intl`-backed helpers the
 * HTML templates used, and a template prints the resulting string. Two reasons,
 * and the second is the one that matters:
 *
 *  - Indian digit grouping and the `06-Sept-2026` date form both come from
 *    `Intl`, whose exact output (en-GB's four-letter "Sept", for one) is not
 *    worth reimplementing in Typst markup. Doing so would manufacture a class of
 *    difference that has nothing to do with layout.
 *  - It makes "numbers are read, never computed" STRUCTURAL rather than a rule
 *    to remember. By the time a value reaches a template it is a string, so a
 *    template cannot do arithmetic on it even by accident. Per CLAUDE.md money
 *    is read from stored columns and never recomputed.
 *
 * Raw numerics survive alongside as `*Raw` for the few places a template needs a
 * comparison rather than a rendering (the receipt tests `unallocatedAmountRaw > 0`).
 */
import { formatDocDate, formatGeneratedAt, formatMoney } from '../lib/format';

import {
  buildHsnTable,
  buildTaxRows,
  type HsnGroupInput,
  type TaxRateGroupInput,
} from './tax-rows';

export type RenderableKind = 'quotation' | 'performa_invoice' | 'payment_receipt' | 'dispatch';

/** Values rendered as money. */
const MONEY_KEYS = new Set([
  'subtotal',
  'discountAmount',
  'taxableAmount',
  'cgstAmount',
  'sgstAmount',
  'igstAmount',
  'totalAmount',
  'amount',
  'unallocatedAmount',
  'unitPrice',
  'lineDiscount',
  'taxableValue',
  'gstAmount',
  'lineTotal',
]);

/** Values rendered as a document date. */
const DATE_KEYS = new Set([
  'quoteDate',
  'validUntil',
  'receiptDate',
  'depositedDate',
  'dispatchDate',
  'orderDate',
  'expectedDeliveryDate',
  'ewayBillDate',
  'piDate',
]);

/** The running page footer names the document in title case: "Quotation QT-…". */
const FOOTER_LABEL: Record<RenderableKind, string> = {
  quotation: 'Quotation',
  performa_invoice: 'Performa Invoice',
  payment_receipt: 'Receipt',
  dispatch: 'Dispatch',
};

/** Entry template per document type. */
export const TEMPLATE_FOR: Record<RenderableKind, string> = {
  quotation: 'quotation.typ',
  // The PI imports the quotation BODY rather than copying it — the same
  // delegation the HTML pair had — but keeps its own entry point so the two can
  // diverge later (F.3, F.4) without either inheriting the other's changes.
  performa_invoice: 'performa-invoice.typ',
  payment_receipt: 'payment-receipt.typ',
  dispatch: 'dispatch-note.typ',
};

function convert(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return null;
  // `generatedAt` is the only Date, and the footer wants the timestamped form
  // (`11-Sept-2026 23:00 IST`), not the date-only one.
  if (value instanceof Date) {
    return key === 'generatedAt' ? formatGeneratedAt(value) : formatDocDate(value);
  }
  if (Array.isArray(value)) return value.map((v) => convert(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = convert(v, k);
      if (typeof v === 'number' && MONEY_KEYS.has(k)) out[`${k}Raw`] = v;
    }
    return out;
  }
  if (typeof value === 'number' && key && MONEY_KEYS.has(key)) return formatMoney(value);
  if (typeof value === 'string' && key && DATE_KEYS.has(key) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDocDate(value.slice(0, 10));
  }
  return value;
}

/**
 * Build the view model a Typst template consumes.
 *
 * The derived totals are computed here for the same reason the formatting
 * happens here: the HTML components used to reduce over the rows at render time
 * (`LineItemsTable`, `SerialsTable`, the allocations `tfoot`), and a Typst
 * template must not do arithmetic. Every figure below is a sum of values the
 * loader read from stored columns — nothing is recalculated from inputs.
 */
export function buildViewModel(type: RenderableKind, data: unknown): Record<string, unknown> {
  const vm = convert(data) as Record<string, unknown>;

  const allocations = (data as { allocations?: { amount: number }[] }).allocations;
  if (allocations) {
    vm['allocatedTotal'] = formatMoney(allocations.reduce((t, a) => t + a.amount, 0));
  }

  const lines = (
    data as {
      lines?: { quantity: number; taxableValue: number; gstAmount: number; lineTotal: number }[];
    }
  ).lines;
  if (lines) {
    vm['totalQuantity'] = lines.reduce((t, l) => t + l.quantity, 0);
    vm['totalTaxable'] = formatMoney(lines.reduce((t, l) => t + l.taxableValue, 0));
    vm['totalGstAmount'] = formatMoney(lines.reduce((t, l) => t + l.gstAmount, 0));
    vm['totalLineAmount'] = formatMoney(lines.reduce((t, l) => t + l.lineTotal, 0));
  }

  vm['footerLabel'] = FOOTER_LABEL[type];

  // CGST and SGST are each half the full rate; the HTML's TaxSummary halved the
  // label at render time.
  const rateLabel = (data as { gstRateLabel?: string | null }).gstRateLabel ?? null;
  vm['halfRateLabel'] = rateLabel != null ? `${Number(rateLabel) / 2}%` : '';
  vm['fullRateLabel'] = rateLabel != null ? `${rateLabel}%` : '';

  // F.4 — the rate-wise rows the totals block will render (A.2 consumes them).
  // Derived in BOTH view builders from ONE shared function: this file and
  // `scripts/render-typst.ts` are forks (F.108), and a derivation added to only
  // one would leave the byte-measurement harness reporting the old output while
  // production moved.
  const taxGroups = (data as { taxRateGroups?: TaxRateGroupInput[] }).taxRateGroups;
  if (taxGroups) {
    vm['taxRows'] = buildTaxRows(
      taxGroups,
      Boolean((data as { isInterState?: boolean }).isInterState),
    );
  }

  const hsnGroups = (data as { taxHsnGroups?: HsnGroupInput[] }).taxHsnGroups;
  if (hsnGroups && hsnGroups.length) {
    vm['hsnTable'] = buildHsnTable(
      hsnGroups,
      Boolean((data as { isInterState?: boolean }).isInterState),
    );
  }

  return vm;
}

/** A tenant's `data:` logo URI as bytes Typst's `image()` can read, if any. */
export function logoSvgFrom(data: unknown): Buffer | undefined {
  const logoUrl = (data as { billFrom?: { logoUrl?: string | null } }).billFrom?.logoUrl ?? null;
  if (!logoUrl) return undefined;
  const m = /^data:image\/(svg\+xml|png|jpeg);base64,(.*)$/.exec(logoUrl);
  if (!m) return undefined;
  return Buffer.from(m[2]!, 'base64');
}

/**
 * The stored filename for a document, transcribed from the four HTML builders
 * so the cutover does not silently rename anyone's downloads. Only the
 * quotation varies: a revision above 1 carries a `-revN` suffix.
 */
export function filenameFor(type: RenderableKind, data: unknown): string {
  const d = data as {
    quoteNumber?: string;
    receiptNumber?: string;
    dispatchNumber?: string;
    revision?: number;
  };
  switch (type) {
    case 'quotation':
      return (d.revision ?? 1) > 1
        ? `${d.quoteNumber}-rev${d.revision}.pdf`
        : `${d.quoteNumber}.pdf`;
    case 'performa_invoice':
      return `${d.quoteNumber}.pdf`;
    case 'payment_receipt':
      return `${d.receiptNumber}.pdf`;
    case 'dispatch':
      return `${d.dispatchNumber}.pdf`;
  }
}
