/**
 * Performa Invoice PDF template (Day 11).
 *
 * A PI reuses the Day 10 quotation template wholesale — same `QuotationPdfData`
 * shape, same `renderQuotationHtml`, same Header / PartyBlock / LineItemsTable
 * / TaxSummary / Footer components. The only differences are data-level: the
 * header title is "PERFORMA INVOICE", the number label is "PI No.", and the
 * Ship-To party is genuinely distinct from Bill-To in three-party scenarios
 * (CLAUDE.md §5). Place of supply is the Ship-To state (ADR-012).
 */
import {
  dealers,
  performaInvoiceLines,
  performaInvoices,
  tenantSettings,
  tenants,
  type DrizzleTx,
} from '@dealerlink/db';
import { formatStateLabel } from '@dealerlink/schemas';
import { computeTax, serializeOutput, type GstRate, type TaxDiscount } from '@dealerlink/tax';
import { asc, eq } from 'drizzle-orm';

import { amountInWords } from '../lib/amount-in-words';
import { formatGeneratedAt } from '../lib/format';

import { renderQuotationHtml } from './quotation';
import type { PdfBankDetails, PdfParty, QuotationPdfData } from './types';

export interface BuiltPerformaInvoiceHtml {
  html: string;
  filename: string;
  footerTemplate: string;
}

const VALID_GST_RATES: GstRate[] = [0, 5, 12, 18, 28];

function toGstRate(raw: string | number): GstRate {
  const n = Number(raw);
  const rate = VALID_GST_RATES.find((r) => r === n);
  if (rate === undefined) {
    throw new Error(`performa-invoice template: unexpected GST rate "${String(raw)}"`);
  }
  return rate;
}

function addressLines(parts: Array<string | null | undefined>): string[] {
  return parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0);
}

function dealerToParty(d: typeof dealers.$inferSelect): PdfParty {
  return {
    name: d.displayName,
    legalName: d.legalName,
    addressLines: addressLines([
      d.addressLine1,
      d.addressLine2,
      [d.city, formatStateLabel(d.state), d.pincode].filter((p) => p && p.trim()).join(', '),
    ]),
    gstin: d.gstin ?? null,
    contact: d.contactPerson ?? null,
  };
}

function buildFooterTemplate(data: QuotationPdfData): string {
  const left = `Performa Invoice ${data.quoteNumber} · Generated ${formatGeneratedAt(data.generatedAt)}`;
  const escaped = left.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    `<div style="font-family:'IBM Plex Mono',monospace;font-size:7px;color:#6B7280;` +
    `width:100%;padding:0 18mm;display:flex;justify-content:space-between;">` +
    `<span>${escaped}</span>` +
    `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `</div>`
  );
}

/**
 * Load a PI and assemble its `QuotationPdfData`. Runs inside the caller's
 * tenant transaction (RLS-scoped). Throws if the PI is not found.
 */
export async function loadPerformaInvoicePdfData(
  tx: DrizzleTx,
  tenantId: string,
  piId: string,
): Promise<QuotationPdfData> {
  const [pi] = await tx
    .select()
    .from(performaInvoices)
    .where(eq(performaInvoices.id, piId))
    .limit(1);
  if (!pi) throw new Error(`Performa invoice ${piId} not found`);

  const [billToDealer] = await tx
    .select()
    .from(dealers)
    .where(eq(dealers.id, pi.billToDealerId))
    .limit(1);
  if (!billToDealer) throw new Error(`Bill-To dealer ${pi.billToDealerId} not found`);

  const [shipToDealer] = await tx
    .select()
    .from(dealers)
    .where(eq(dealers.id, pi.shipToDealerId))
    .limit(1);
  if (!shipToDealer) throw new Error(`Ship-To dealer ${pi.shipToDealerId} not found`);

  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const [settings] = await tx
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const lineRows = await tx
    .select()
    .from(performaInvoiceLines)
    .where(eq(performaInvoiceLines.performaInvoiceId, piId))
    .orderBy(asc(performaInvoiceLines.lineNumber));
  if (lineRows.length === 0) {
    throw new Error(`Performa invoice ${piId} has no line items`);
  }

  const discount: TaxDiscount =
    pi.discountType && pi.discountValue ? { type: pi.discountType, value: pi.discountValue } : null;
  const tax = serializeOutput(
    computeTax({
      tenantState: pi.tenantStateAtIssue,
      placeOfSupply: pi.placeOfSupply,
      discount,
      lines: lineRows.map((l) => ({
        lineId: l.id,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        gstRate: toGstRate(l.gstRate),
      })),
    }),
  );
  const taxByLine = new Map(tax.lines.map((l) => [l.lineId, l]));

  const lines = lineRows.map((l) => {
    const t = taxByLine.get(l.id);
    if (!t) throw new Error(`tax engine dropped line ${l.id}`);
    return {
      lineNumber: l.lineNumber,
      sku: l.productSku,
      name: l.productName,
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

  const distinctRates = Array.from(new Set(lines.map((l) => l.gstRate)));
  const gstRateLabel = distinctRates.length === 1 ? String(distinctRates[0]) : null;

  const discountLabel =
    pi.discountType === 'percent' && pi.discountValue
      ? `${Number(pi.discountValue)}%`
      : pi.discountType === 'amount'
        ? 'flat amount'
        : null;

  const bank: PdfBankDetails | null =
    settings?.bankName && settings.bankAccountNumber && settings.bankIfsc
      ? {
          name: settings.bankName,
          accountNumber: settings.bankAccountNumber,
          ifsc: settings.bankIfsc,
          branch: settings.bankBranch ?? null,
        }
      : null;

  // Ship-To is rendered as a distinct party only when it genuinely differs;
  // otherwise the template shows the "Ship-To same as Bill-To" note.
  const shipToParty: PdfParty | null =
    pi.shipToDealerId === pi.billToDealerId ? null : dealerToParty(shipToDealer);

  return {
    documentTitle: 'PERFORMA INVOICE',
    numberLabel: 'PI No.',
    quoteNumber: pi.piNumber,
    revision: 1,
    quoteDate: pi.piDate,
    validUntil: pi.validUntil,
    status: pi.status,
    currency: pi.currency,
    tenantStateAtIssue: formatStateLabel(pi.tenantStateAtIssue),
    placeOfSupply: formatStateLabel(pi.placeOfSupply),
    isInterState: tax.isInterState,
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
    shipTo: shipToParty,
    lines,
    subtotal: Number(tax.subtotal),
    discountLabel,
    discountAmount: Number(tax.discountAmount),
    taxableAmount: Number(tax.taxableAmount),
    cgstAmount: Number(tax.cgstAmount),
    sgstAmount: Number(tax.sgstAmount),
    igstAmount: Number(tax.igstAmount),
    gstRateLabel,
    totalAmount: Number(tax.totalAmount),
    amountInWords: amountInWords(tax.totalAmount),
    termsAndConditions: pi.termsAndConditions ?? settings?.defaultTerms ?? null,
    bank,
    generatedAt: new Date(),
  };
}

/** Load a PI by id and render it to a print-ready HTML string. */
export async function buildPerformaInvoiceHtml(
  tx: DrizzleTx,
  tenantId: string,
  documentId: string,
): Promise<BuiltPerformaInvoiceHtml> {
  const data = await loadPerformaInvoicePdfData(tx, tenantId, documentId);
  return {
    html: renderQuotationHtml(data),
    filename: `${data.quoteNumber}.pdf`,
    footerTemplate: buildFooterTemplate(data),
  };
}
