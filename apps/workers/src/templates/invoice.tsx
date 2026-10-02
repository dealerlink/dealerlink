import {
  dealers,
  invoiceLines,
  invoices,
  tenantSettings,
  tenants,
  type DrizzleTx,
} from '@dealerlink/db';
import { formatStateLabel } from '@dealerlink/schemas';
import { computeTax, serializeOutput } from '@dealerlink/tax';
import { asc, eq } from 'drizzle-orm';

import { amountInWords } from '../lib/amount-in-words';

import { addressLines, dealerToParty } from './performa-invoice';
import { readStoredTotals } from './stored-totals';
import { buildTaxGroups } from './tax-groups';
import type { QuotationPdfData } from './types';

/**
 * Load a GST tax invoice and assemble its PDF data.
 *
 * ## IT FOLLOWS THE PI LOADER, INCLUDING ITS F.152 CONTRACT
 *
 * Header totals are READ from the stored columns; the per-line figures and both
 * grouping axes are DERIVED from the lines; `readStoredTotals` asserts the two
 * reconcile before anything renders. The invoice is the document that makes that
 * contract load-bearing rather than tidy:
 *
 *  - Its `total_amount` is the WHOLE-RUPEE figure (F6 D-3), which no pure function
 *    of the lines reproduces. A recomputing loader would print a different total
 *    from the one issued.
 *  - Its `round_off` has no representation in the lines at all, so a recomputing
 *    loader could not see it.
 *
 * ## ROUND-OFF IS PASSED AS null WHEN ZERO, AND THAT IS A PRESENTATION CHOICE
 *
 * F6 D-4 settles that round-off is always APPLIED. Whether a zero term is PRINTED
 * is a separate question the prompt did not settle, and the choice here is not to:
 * a "Round Off ₹0.00" row on every exact document is noise, and the client's own
 * voucher shows the line only when it carries a figure.
 *
 * `null` rather than the string `'0.00'` so the template tests `!= none`, the same
 * shape `discountLabel` already uses, instead of comparing a formatted string.
 * **Both branches are tested** — a conditional row is exactly the kind of thing that
 * passes without running.
 */
export async function loadInvoicePdfData(
  tx: DrizzleTx,
  tenantId: string,
  invoiceId: string,
): Promise<QuotationPdfData> {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) throw new Error(`Invoice ${invoiceId} not found`);

  const [billToDealer] = await tx
    .select()
    .from(dealers)
    .where(eq(dealers.id, inv.billToDealerId))
    .limit(1);
  if (!billToDealer) throw new Error(`Bill-To dealer ${inv.billToDealerId} not found`);

  const [shipToDealer] = await tx
    .select()
    .from(dealers)
    .where(eq(dealers.id, inv.shipToDealerId))
    .limit(1);
  if (!shipToDealer) throw new Error(`Ship-To dealer ${inv.shipToDealerId} not found`);

  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const [settings] = await tx
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const lineRows = await tx
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))
    .orderBy(asc(invoiceLines.lineNumber));
  if (lineRows.length === 0) throw new Error(`Invoice ${inv.invoiceNumber} has no line items`);

  const { rateGroups: taxRateGroups, hsnGroups: taxHsnGroups } = buildTaxGroups({
    tenantState: inv.tenantStateAtIssue,
    placeOfSupply: inv.placeOfSupply,
    discount:
      inv.discountType && inv.discountValue
        ? { type: inv.discountType, value: inv.discountValue }
        : null,
    lines: lineRows.map((l) => ({
      lineId: l.id,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      gstRate: Number(l.gstRate),
      hsnCode: l.hsnCode,
    })),
  });

  // PER-LINE FIGURES ARE DERIVED, and they must come from the ENGINE rather than
  // from `line_total`. That is not a style point: `invoice_lines.line_total` is the
  // PRE-discount line total, copied forward from the order, so using it as the
  // taxable value makes the lines sum to the SUBTOTAL rather than the taxable
  // amount. On INV-2026-0001 that is 44,520.00 against a stored 39,520.00, and the
  // reconciliation assertion refused to render it — which is how this was found.
  //
  // The HEADER totals are still READ from the stored columns (F.152 / F6 D-1). The
  // engine runs here only for the per-line split, which has no columns (F.99), and
  // the discount is the invoice's own stored amount passed back in.
  const tax = serializeOutput(
    computeTax({
      tenantState: inv.tenantStateAtIssue,
      placeOfSupply: inv.placeOfSupply,
      discount:
        inv.discountType && inv.discountValue
          ? { type: inv.discountType, value: inv.discountValue }
          : null,
      lines: lineRows.map((l) => ({
        lineId: l.id,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        gstRate: Number(l.gstRate),
      })),
    }),
  );
  const taxByLine = new Map(tax.lines.map((l) => [l.lineId, l]));

  const lines = lineRows.map((l, i) => {
    const t = taxByLine.get(l.id);
    if (!t) throw new Error(`tax engine dropped line ${l.id}`);
    return {
      lineNumber: i + 1,
      sku: l.productSku,
      name: l.productName,
      productSku: l.productSku,
      productName: l.productName,
      hsnCode: l.hsnCode,
      description: l.description,
      quantity: Number(l.quantity),
      unitOfMeasure: l.unitOfMeasure,
      unitPrice: Number(l.unitPrice),
      lineDiscount: Number(t.lineDiscount),
      taxableValue: Number(t.lineTaxable),
      gstRate: Number(l.gstRate),
      gstAmount: Number(t.lineTaxTotal),
      lineTotal: Number(t.lineTotal),
    };
  });

  const storedTotals = readStoredTotals({
    documentNumber: inv.invoiceNumber,
    stored: inv,
    lines,
    rateGroups: taxRateGroups,
  });

  const roundOff = Number(inv.roundOff);

  return {
    documentTitle: 'TAX INVOICE',
    numberLabel: 'Invoice No.',
    quoteNumber: inv.invoiceNumber,
    quoteDate: inv.invoiceDate,
    validUntil: null,
    revision: 1,
    placeOfSupply: inv.placeOfSupply,
    tenantStateAtIssue: inv.tenantStateAtIssue,
    isInterState: inv.tenantStateAtIssue !== inv.placeOfSupply,
    status: inv.status,
    currency: inv.currency,
    // Transcribed from the PI loader rather than hand-built: `chrome.typ`'s party
    // block reads `name` as well as `legalName`, and an object missing a key fails
    // at TYPST COMPILE TIME with "dictionary does not contain key" — after the
    // reconciliation assertions have passed, so the failure is late and opaque.
    billFrom: {
      name: tenant.displayName,
      legalName: tenant.legalName,
      addressLines: addressLines([
        settings?.addressLine1,
        settings?.addressLine2,
        [settings?.addressCity, formatStateLabel(settings?.addressState), settings?.addressPincode]
          .filter((p) => p && p.trim())
          .join(', '),
      ]),
      gstin: settings?.gstin ?? null,
      pan: settings?.pan ?? null,
      logoUrl: settings?.logoUrl ?? null,
    },
    billTo: dealerToParty(billToDealer),
    // The invoice always carries a distinct Ship-To block, even when it is the same
    // dealer: a tax invoice states where the goods went, and "same as Bill-To" is a
    // reader's inference rather than something the document said.
    shipTo: dealerToParty(shipToDealer),
    lines,
    subtotal: storedTotals.subtotal,
    discountLabel: null,
    discountAmount: storedTotals.discountAmount,
    taxableAmount: storedTotals.taxableAmount,
    cgstAmount: storedTotals.cgstAmount,
    sgstAmount: storedTotals.sgstAmount,
    igstAmount: storedTotals.igstAmount,
    gstRateLabel: null,
    taxRateGroups,
    taxHsnGroups,
    // null when zero, so the template's `!= none` governs the row. See the header.
    roundOff: roundOff === 0 ? null : roundOff,
    totalAmount: storedTotals.totalAmount,
    amountInWords: amountInWords(storedTotals.totalAmountDecimal.toFixed(2)),
    termsAndConditions: inv.termsAndConditions ?? settings?.defaultTerms ?? null,
    bank: null,
    generatedAt: new Date(),
  } as unknown as QuotationPdfData;
}
