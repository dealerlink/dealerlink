import {
  dealers,
  invoiceLines,
  invoices,
  tenantSettings,
  tenants,
  type DrizzleTx,
} from '@dealerlink/db';
import { asc, eq } from 'drizzle-orm';

import { amountInWords } from '../lib/amount-in-words';

import { dealerToParty } from './performa-invoice';
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

  const lines = lineRows.map((l: (typeof lineRows)[number], i: number) => {
    const qty = Number(l.quantity);
    const price = Number(l.unitPrice);
    const taxableValue = Number(l.lineTotal);
    return {
      lineNumber: i + 1,
      productSku: l.productSku,
      productName: l.productName,
      hsnCode: l.hsnCode,
      description: l.description,
      quantity: qty,
      unitOfMeasure: l.unitOfMeasure,
      unitPrice: price,
      lineDiscount: 0,
      taxableValue,
      gstRate: Number(l.gstRate),
      gstAmount: 0,
      lineTotal: taxableValue,
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
    isInterState: inv.tenantStateAtIssue !== inv.placeOfSupply,
    billFrom: {
      legalName: tenant.legalName,
      addressLines: [settings?.addressLine1, settings?.addressLine2, settings?.addressCity].filter(
        (x): x is string => Boolean(x),
      ),
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
