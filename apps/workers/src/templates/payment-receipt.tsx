/**
 * Payment-receipt PDF template (Day 12).
 *
 * A receipt is a tax-neutral document — no GST breakdown, no place of supply
 * (ADR-012 is informational here). It reuses the Day 10 Header (tenant
 * branding), PartyBlock (the paying dealer) and Footer (tenant bank details)
 * verbatim; the body replaces line items with the amount received, the
 * payment method, and the allocation breakdown.
 *
 * The payer is the Bill-To dealer — receipts always go to whoever pays
 * (CLAUDE.md §6).
 */
import {
  dealers,
  orders,
  paymentAllocations,
  payments,
  performaInvoices,
  tenantSettings,
  tenants,
  type DrizzleTx,
} from '@dealerlink/db';
import { asc, eq } from 'drizzle-orm';
import { renderToStaticMarkup } from 'react-dom/server';

import { amountInWords } from '../lib/amount-in-words';
import { formatDocDate, formatGeneratedAt, formatINR, formatMoney } from '../lib/format';

import { Footer } from './_components/Footer';
import { Header } from './_components/Header';
import { PartyBlock } from './_components/PartyBlock';
import { PAYMENT_RECEIPT_CSS } from './styles';
import type { PaymentReceiptPdfData, PdfBankDetails, PdfReceiptAllocation } from './types';

export interface BuiltPaymentReceiptHtml {
  html: string;
  filename: string;
  footerTemplate: string;
}

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  other: 'Other',
};

function addressLines(parts: Array<string | null | undefined>): string[] {
  return parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0);
}

/** The PaymentReceiptDocument React tree — a complete <html> document. */
function PaymentReceiptDocument({ data }: { data: PaymentReceiptPdfData }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{data.receiptNumber}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href={
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700' +
            '&family=IBM+Plex+Mono:wght@400;500;600&display=swap'
          }
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: PAYMENT_RECEIPT_CSS }} />
      </head>
      <body>
        <div className="doc">
          <Header
            billFrom={data.billFrom}
            documentTitle="PAYMENT RECEIPT"
            numberLabel="Receipt No."
            quoteNumber={data.receiptNumber}
            revision={1}
            quoteDate={data.receiptDate}
            validUntil={data.receiptDate}
            hideValidUntil
          />

          <div className="parties">
            <PartyBlock label="Received From" party={data.receivedFrom} />
            <div className="party">
              <div className="party-label titlecaps">Receipt Status</div>
              <div className="party-name mono">{data.status.replace(/_/g, ' ')}</div>
              <div className="party-line">
                Received on <span className="mono">{formatDocDate(data.receiptDate)}</span>
              </div>
            </div>
          </div>

          <div className="receipt-amount">
            <div className="titlecaps">Amount Received</div>
            <div className="amount-value mono">{formatINR(data.amount)}</div>
            <div className="amount-words">{data.amountInWords}</div>
          </div>

          <div className="receipt-meta">
            <div className="meta-item">
              <div className="titlecaps">Method</div>
              <div className="v">{data.method}</div>
            </div>
            {data.reference ? (
              <div className="meta-item">
                <div className="titlecaps">Reference</div>
                <div className="v mono">{data.reference}</div>
              </div>
            ) : null}
            {data.depositedToBank ? (
              <div className="meta-item">
                <div className="titlecaps">Deposited To</div>
                <div className="v">{data.depositedToBank}</div>
              </div>
            ) : null}
            {data.depositedDate ? (
              <div className="meta-item">
                <div className="titlecaps">Deposited On</div>
                <div className="v mono">{formatDocDate(data.depositedDate)}</div>
              </div>
            ) : null}
          </div>

          {data.allocations.length > 0 ? (
            <table className="items">
              <thead>
                <tr>
                  <th>Allocated Against</th>
                  <th>Document No.</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.allocations.map((a, i) => (
                  <tr key={i}>
                    <td>{a.documentLabel}</td>
                    <td className="mono">{a.documentNumber}</td>
                    <td className="num mono">{formatMoney(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total Allocated</td>
                  <td className="num mono">
                    {formatMoney(data.allocations.reduce((s, a) => s + a.amount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="section">
              <div className="titlecaps">Allocation</div>
              <div className="section-body">
                This payment has not been allocated to any order or proforma invoice yet.
              </div>
            </div>
          )}

          {data.unallocatedAmount > 0 ? (
            <div className="advance-note">
              Advance balance — {formatINR(data.unallocatedAmount)} of this payment is unallocated
              and held as credit against future orders.
            </div>
          ) : null}

          <Footer termsAndConditions={null} bank={data.bank} />
        </div>
      </body>
    </html>
  );
}

/** Render a `PaymentReceiptPdfData` to a complete, self-contained HTML string. */
export function renderPaymentReceiptHtml(data: PaymentReceiptPdfData): string {
  const body = renderToStaticMarkup(<PaymentReceiptDocument data={data} />);
  return `<!doctype html>${body}`;
}

function buildFooterTemplate(data: PaymentReceiptPdfData): string {
  const left = `Receipt ${data.receiptNumber} · Generated ${formatGeneratedAt(data.generatedAt)}`;
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
 * Load a payment and assemble its `PaymentReceiptPdfData`. Runs inside the
 * caller's tenant transaction (RLS-scoped). Throws if the payment is not
 * found in the current tenant.
 */
export async function loadPaymentReceiptPdfData(
  tx: DrizzleTx,
  tenantId: string,
  paymentId: string,
): Promise<PaymentReceiptPdfData> {
  const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) throw new Error(`Payment ${paymentId} not found`);

  const [dealer] = await tx.select().from(dealers).where(eq(dealers.id, payment.dealerId)).limit(1);
  if (!dealer) throw new Error(`Dealer ${payment.dealerId} not found for payment`);

  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const [settings] = await tx
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const allocRows = await tx
    .select({
      amount: paymentAllocations.amount,
      orderId: paymentAllocations.orderId,
      performaInvoiceId: paymentAllocations.performaInvoiceId,
      orderNumber: orders.orderNumber,
      piNumber: performaInvoices.piNumber,
    })
    .from(paymentAllocations)
    .leftJoin(orders, eq(orders.id, paymentAllocations.orderId))
    .leftJoin(performaInvoices, eq(performaInvoices.id, paymentAllocations.performaInvoiceId))
    .where(eq(paymentAllocations.paymentId, paymentId))
    .orderBy(asc(paymentAllocations.allocatedAt));

  const allocations: PdfReceiptAllocation[] = allocRows.map((a) => ({
    documentLabel: a.orderId ? 'Order' : 'Proforma Invoice',
    documentNumber: a.orderNumber ?? a.piNumber ?? '—',
    amount: Number(a.amount),
  }));

  const bank: PdfBankDetails | null =
    settings?.bankName && settings.bankAccountNumber && settings.bankIfsc
      ? {
          name: settings.bankName,
          accountNumber: settings.bankAccountNumber,
          ifsc: settings.bankIfsc,
          branch: settings.bankBranch ?? null,
        }
      : null;

  const amount = Number(payment.amount);
  const allocated = Number(payment.allocatedAmount);

  return {
    billFrom: {
      name: tenant.displayName,
      legalName: tenant.legalName,
      addressLines: addressLines([
        settings?.addressLine1,
        settings?.addressLine2,
        [settings?.addressCity, settings?.addressState, settings?.addressPincode]
          .filter((p) => p && p.trim())
          .join(', '),
      ]),
      gstin: settings?.gstin ?? null,
      pan: settings?.pan ?? null,
      logoUrl: settings?.logoUrl ?? null,
    },
    receiptNumber: payment.paymentNumber,
    receiptDate: payment.receivedDate,
    status: payment.status,
    currency: payment.currency,
    receivedFrom: {
      name: dealer.displayName,
      legalName: dealer.legalName,
      addressLines: addressLines([
        dealer.addressLine1,
        dealer.addressLine2,
        [dealer.city, dealer.state, dealer.pincode].filter((p) => p && p.trim()).join(', '),
      ]),
      gstin: dealer.gstin ?? null,
      contact: dealer.contactPerson ?? null,
    },
    amount,
    amountInWords: amountInWords(amount),
    method: METHOD_LABELS[payment.method] ?? payment.method,
    reference: payment.reference ?? null,
    depositedToBank: payment.depositedToBank ?? null,
    depositedDate: payment.depositedDate ?? null,
    allocations,
    unallocatedAmount: Math.max(0, amount - allocated),
    bank,
    generatedAt: new Date(),
  };
}

/**
 * Load a payment by id and render its receipt to a print-ready HTML string
 * plus the metadata the render-pdf job needs (filename, footer template).
 */
export async function buildPaymentReceiptHtml(
  tx: DrizzleTx,
  tenantId: string,
  documentId: string,
): Promise<BuiltPaymentReceiptHtml> {
  const data = await loadPaymentReceiptPdfData(tx, tenantId, documentId);
  return {
    html: renderPaymentReceiptHtml(data),
    filename: `${data.receiptNumber}.pdf`,
    footerTemplate: buildFooterTemplate(data),
  };
}
