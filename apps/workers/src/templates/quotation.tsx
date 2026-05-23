/**
 * Quotation PDF template — the React-on-the-server document.
 *
 * `buildQuotationHtml` is the entry point used by the render-pdf job: it
 * loads the quotation by id, recomputes the authoritative tax breakdown
 * with @dealerlink/tax (the same engine that wrote the stored totals — the
 * Day 9 parity test guarantees they agree), assembles a typed
 * `QuotationPdfData`, and renders it to a self-contained HTML string.
 *
 * Why React-on-the-server (not handlebars strings): the template inputs are
 * fully typed (no `any` — Day 10 guardrail) and the sub-components
 * (Header / PartyBlock / LineItemsTable / TaxSummary / Footer) are reused
 * verbatim by Day 11's invoice template.
 */
import {
  dealers,
  quotationLines,
  quotations,
  tenantSettings,
  tenants,
  type DrizzleTx,
} from '@dealerlink/db';
import { formatStateLabel } from '@dealerlink/schemas';
import { computeTax, serializeOutput, type GstRate, type TaxDiscount } from '@dealerlink/tax';
import { asc, eq } from 'drizzle-orm';
import { renderToStaticMarkup } from 'react-dom/server';

import { amountInWords } from '../lib/amount-in-words';
import { formatGeneratedAt } from '../lib/format';

import { Footer } from './_components/Footer';
import { Header } from './_components/Header';
import { LineItemsTable } from './_components/LineItemsTable';
import { PartyBlock } from './_components/PartyBlock';
import { TaxSummary } from './_components/TaxSummary';
import { QUOTATION_CSS } from './styles';
import type { PdfBankDetails, QuotationPdfData } from './types';

export interface BuiltQuotationHtml {
  html: string;
  filename: string;
  /** Chromium footer template — repeated on every printed page. */
  footerTemplate: string;
}

const VALID_GST_RATES: GstRate[] = [0, 5, 12, 18, 28];

/** Coerce a DB numeric GST rate to the engine's `GstRate` union. */
function toGstRate(raw: string | number): GstRate {
  const n = Number(raw);
  const rate = VALID_GST_RATES.find((r) => r === n);
  if (rate === undefined) {
    throw new Error(`quotation template: unexpected GST rate "${String(raw)}"`);
  }
  return rate;
}

/** Drop null/empty parts and join into clean address lines. */
function addressLines(parts: Array<string | null | undefined>): string[] {
  const cleaned = parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0);
  return cleaned;
}

/** The QuotationDocument React tree — a complete <html> document. */
function QuotationDocument({ data }: { data: QuotationPdfData }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{data.quoteNumber}</title>
        {/* Web fonts — Puppeteer's networkidle0 wait loads them; the CSS
            font stack falls back cleanly when offline. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href={
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700' +
            '&family=IBM+Plex+Mono:wght@400;500;600&display=swap'
          }
          rel="stylesheet"
        />
        {/* Print CSS is inlined — Puppeteer needs no external stylesheet. */}
        <style dangerouslySetInnerHTML={{ __html: QUOTATION_CSS }} />
      </head>
      <body>
        <div className="doc">
          <Header
            billFrom={data.billFrom}
            documentTitle={data.documentTitle}
            numberLabel={data.numberLabel}
            quoteNumber={data.quoteNumber}
            revision={data.revision}
            quoteDate={data.quoteDate}
            validUntil={data.validUntil}
          />

          <div className="parties">
            <PartyBlock label="Bill To" party={data.billTo} />
            <PartyBlock label="Ship To" party={data.shipTo} note="Ship-To same as Bill-To" />
            <div className="party">
              <div className="party-label titlecaps">Place of Supply</div>
              <div className="party-name mono">{data.placeOfSupply}</div>
              <div className="party-line">
                Tenant state: <span className="mono">{data.tenantStateAtIssue}</span>
              </div>
              <div className="party-gstin">
                <span className={`badge ${data.isInterState ? 'inter' : 'intra'}`}>
                  {data.isInterState ? 'INTER-STATE · IGST' : 'INTRA-STATE · CGST + SGST'}
                </span>
              </div>
            </div>
          </div>

          <LineItemsTable lines={data.lines} />

          <TaxSummary
            subtotal={data.subtotal}
            discountLabel={data.discountLabel}
            discountAmount={data.discountAmount}
            taxableAmount={data.taxableAmount}
            cgstAmount={data.cgstAmount}
            sgstAmount={data.sgstAmount}
            igstAmount={data.igstAmount}
            gstRateLabel={data.gstRateLabel}
            totalAmount={data.totalAmount}
            amountInWords={data.amountInWords}
            isInterState={data.isInterState}
          />

          <Footer termsAndConditions={data.termsAndConditions} bank={data.bank} />
        </div>
      </body>
    </html>
  );
}

/** Render a `QuotationPdfData` to a complete, self-contained HTML string. */
export function renderQuotationHtml(data: QuotationPdfData): string {
  const body = renderToStaticMarkup(<QuotationDocument data={data} />);
  return `<!doctype html>${body}`;
}

/** Build the repeating page footer (Chromium footerTemplate). */
function buildFooterTemplate(data: QuotationPdfData): string {
  const left = `Quotation ${data.quoteNumber} · Generated ${formatGeneratedAt(data.generatedAt)}`;
  return (
    `<div style="font-family:'IBM Plex Mono',monospace;font-size:7px;color:#6B7280;` +
    `width:100%;padding:0 18mm;display:flex;justify-content:space-between;">` +
    `<span>${escapeHtml(left)}</span>` +
    `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `</div>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Load a quotation and assemble its `QuotationPdfData`. Runs inside the
 * caller's tenant transaction (RLS-scoped). Throws if the quotation is not
 * found in the current tenant.
 */
export async function loadQuotationPdfData(
  tx: DrizzleTx,
  tenantId: string,
  quotationId: string,
): Promise<QuotationPdfData> {
  const [quote] = await tx.select().from(quotations).where(eq(quotations.id, quotationId)).limit(1);
  if (!quote) throw new Error(`Quotation ${quotationId} not found`);

  const [dealer] = await tx.select().from(dealers).where(eq(dealers.id, quote.dealerId)).limit(1);
  if (!dealer) throw new Error(`Dealer ${quote.dealerId} not found for quotation`);

  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const [settings] = await tx
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const lineRows = await tx
    .select()
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, quotationId))
    .orderBy(asc(quotationLines.lineNumber));
  if (lineRows.length === 0) {
    throw new Error(`Quotation ${quotationId} has no line items`);
  }

  // Recompute the authoritative tax breakdown — same engine that wrote the
  // stored header totals (Day 9 parity test proves they agree).
  const discount: TaxDiscount =
    quote.discountType && quote.discountValue
      ? { type: quote.discountType, value: quote.discountValue }
      : null;
  const tax = serializeOutput(
    computeTax({
      tenantState: quote.tenantStateAtIssue,
      placeOfSupply: quote.placeOfSupply,
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

  // A single rate across all lines → show it on the GST summary label.
  const distinctRates = Array.from(new Set(lines.map((l) => l.gstRate)));
  const gstRateLabel = distinctRates.length === 1 ? String(distinctRates[0]) : null;

  const discountLabel =
    quote.discountType === 'percent' && quote.discountValue
      ? `${Number(quote.discountValue)}%`
      : quote.discountType === 'amount'
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

  const data: QuotationPdfData = {
    documentTitle: 'QUOTATION',
    numberLabel: 'Quote No.',
    quoteNumber: quote.quoteNumber,
    revision: quote.revision,
    quoteDate: quote.quoteDate,
    validUntil: quote.validUntil,
    status: quote.status,
    currency: quote.currency,
    // Display the full state name (stored as an ISO 3166-2:IN code — DEV.33).
    // isInterState comes from the tax engine, computed on the raw codes above.
    tenantStateAtIssue: formatStateLabel(quote.tenantStateAtIssue),
    placeOfSupply: formatStateLabel(quote.placeOfSupply),
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
    billTo: {
      name: dealer.displayName,
      legalName: dealer.legalName,
      addressLines: addressLines([
        dealer.addressLine1,
        dealer.addressLine2,
        [dealer.city, formatStateLabel(dealer.state), dealer.pincode]
          .filter((p) => p && p.trim())
          .join(', '),
      ]),
      gstin: dealer.gstin ?? null,
      contact: dealer.contactPerson ?? null,
    },
    // Quotations are single-party: Ship-To == Bill-To. Day 11 invoices pass
    // a distinct party here (CLAUDE.md §6).
    shipTo: null,
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
    termsAndConditions: quote.termsAndConditions ?? settings?.defaultTerms ?? null,
    bank,
    generatedAt: new Date(),
  };
  return data;
}

/**
 * Load a quotation by id and render it to a print-ready HTML string plus
 * the metadata the render-pdf job needs (filename, footer template).
 */
export async function buildQuotationHtml(
  tx: DrizzleTx,
  tenantId: string,
  documentId: string,
): Promise<BuiltQuotationHtml> {
  const data = await loadQuotationPdfData(tx, tenantId, documentId);
  const filename =
    data.revision > 1 ? `${data.quoteNumber}-rev${data.revision}.pdf` : `${data.quoteNumber}.pdf`;
  return {
    html: renderQuotationHtml(data),
    filename,
    footerTemplate: buildFooterTemplate(data),
  };
}
