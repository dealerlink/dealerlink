/**
 * Dispatch-note PDF template (Day 13).
 *
 * A dispatch note is the physical-fulfilment document — it records which
 * serialised units left the warehouse, on which vehicle, against which
 * order. It is tax-neutral: NOT a tax invoice (that is a separate Phase 2
 * module), so there is no GST breakdown and no place-of-supply line.
 *
 * It reuses the Day 10 Header (tenant branding) and Footer (bank letterhead)
 * verbatim. The consignee is the Ship-To dealer — physical goods follow the
 * delivery location (CLAUDE.md §6); Bill-To is shown only as a small
 * "Invoice to" reference sub-block.
 */
import {
  dealers,
  dispatchLines,
  dispatchSerials,
  dispatches,
  inventoryItems,
  orders,
  tenantSettings,
  tenants,
  type DrizzleTx,
} from '@dealerlink/db';
import { asc, eq } from 'drizzle-orm';
import { renderToStaticMarkup } from 'react-dom/server';

import { formatDocDate, formatGeneratedAt } from '../lib/format';

import { Footer } from './_components/Footer';
import { Header } from './_components/Header';
import { PartyBlock } from './_components/PartyBlock';
import { SerialsTable } from './_components/SerialsTable';
import { DISPATCH_NOTE_CSS } from './styles';
import type { DispatchNotePdfData, PdfBankDetails, PdfDispatchLine } from './types';

export interface BuiltDispatchNoteHtml {
  html: string;
  filename: string;
  footerTemplate: string;
}

function addressLines(parts: Array<string | null | undefined>): string[] {
  return parts.map((p) => (p ?? '').trim()).filter((p) => p.length > 0);
}

function LogisticsItem({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="log-item">
      <div className="titlecaps k">{label}</div>
      <div className="v mono">{value}</div>
    </div>
  );
}

/** The DispatchNoteDocument React tree — a complete <html> document. */
function DispatchNoteDocument({ data }: { data: DispatchNotePdfData }) {
  const l = data.logistics;
  const hasLogistics =
    l.vehicleNumber ||
    l.transporterName ||
    l.transporterDocketNumber ||
    l.driverName ||
    l.driverPhone ||
    l.ewayBillNumber ||
    l.expectedDeliveryDate;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{data.dispatchNumber}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href={
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700' +
            '&family=IBM+Plex+Mono:wght@400;500;600&display=swap'
          }
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: DISPATCH_NOTE_CSS }} />
      </head>
      <body>
        <div className="doc">
          <Header
            billFrom={data.billFrom}
            documentTitle="DISPATCH NOTE"
            numberLabel="Dispatch No."
            quoteNumber={data.dispatchNumber}
            revision={1}
            quoteDate={data.dispatchDate}
            validUntil={data.dispatchDate}
            hideValidUntil
          />

          <div className="parties">
            <PartyBlock label="Ship To (Consignee)" party={data.shipTo} />
            <PartyBlock label="Invoice To (Bill-To)" party={data.billTo} />
          </div>

          <div className="order-ref">
            Against Order <span className="mono">{data.orderNumber}</span> dated{' '}
            <span className="mono">{formatDocDate(data.orderDate)}</span>
          </div>

          {hasLogistics ? (
            <div className="logistics">
              <LogisticsItem label="Vehicle" value={l.vehicleNumber} />
              <LogisticsItem label="Transporter" value={l.transporterName} />
              <LogisticsItem label="Docket No." value={l.transporterDocketNumber} />
              <LogisticsItem label="Driver" value={l.driverName} />
              <LogisticsItem label="Driver Phone" value={l.driverPhone} />
              <LogisticsItem label="E-Way Bill" value={l.ewayBillNumber} />
              <LogisticsItem
                label="E-Way Bill Date"
                value={l.ewayBillDate ? formatDocDate(l.ewayBillDate) : null}
              />
              <LogisticsItem
                label="Expected Delivery"
                value={l.expectedDeliveryDate ? formatDocDate(l.expectedDeliveryDate) : null}
              />
            </div>
          ) : null}

          <SerialsTable lines={data.lines} />

          {data.notes ? (
            <div className="section">
              <div className="titlecaps">Notes</div>
              <div className="section-body">{data.notes}</div>
            </div>
          ) : null}

          <div className="ack">
            <div className="titlecaps">Acknowledgment of Receipt</div>
            <div className="ack-row">
              <div className="ack-field">
                <div className="ack-line" />
                <div className="titlecaps k">Received By (Name &amp; Signature)</div>
              </div>
              <div className="ack-field">
                <div className="ack-line" />
                <div className="titlecaps k">Date</div>
              </div>
            </div>
          </div>

          <Footer termsAndConditions={null} bank={data.bank} />
        </div>
      </body>
    </html>
  );
}

/** Render a `DispatchNotePdfData` to a complete, self-contained HTML string. */
export function renderDispatchNoteHtml(data: DispatchNotePdfData): string {
  const body = renderToStaticMarkup(<DispatchNoteDocument data={data} />);
  return `<!doctype html>${body}`;
}

function buildFooterTemplate(data: DispatchNotePdfData): string {
  const left = `Dispatch ${data.dispatchNumber} · Generated ${formatGeneratedAt(data.generatedAt)}`;
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
 * Load a dispatch and assemble its `DispatchNotePdfData`. Runs inside the
 * caller's tenant transaction (RLS-scoped). Throws if the dispatch is not
 * found in the current tenant.
 */
export async function loadDispatchNotePdfData(
  tx: DrizzleTx,
  tenantId: string,
  dispatchId: string,
): Promise<DispatchNotePdfData> {
  const [dispatch] = await tx
    .select()
    .from(dispatches)
    .where(eq(dispatches.id, dispatchId))
    .limit(1);
  if (!dispatch) throw new Error(`Dispatch ${dispatchId} not found`);

  const [order] = await tx
    .select({ orderNumber: orders.orderNumber, orderDate: orders.orderDate })
    .from(orders)
    .where(eq(orders.id, dispatch.orderId))
    .limit(1);

  const [billTo] = await tx
    .select()
    .from(dealers)
    .where(eq(dealers.id, dispatch.billToDealerId))
    .limit(1);
  const [shipTo] = await tx
    .select()
    .from(dealers)
    .where(eq(dealers.id, dispatch.shipToDealerId))
    .limit(1);
  if (!billTo || !shipTo) throw new Error(`Dealer parties not found for dispatch ${dispatchId}`);

  const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
  const [settings] = await tx
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);

  const lineRows = await tx
    .select()
    .from(dispatchLines)
    .where(eq(dispatchLines.dispatchId, dispatchId))
    .orderBy(asc(dispatchLines.lineNumber));

  const serialRows = await tx
    .select({
      dispatchLineId: dispatchSerials.dispatchLineId,
      serialNumber: inventoryItems.serialNumber,
    })
    .from(dispatchSerials)
    .leftJoin(inventoryItems, eq(inventoryItems.id, dispatchSerials.inventoryItemId))
    .where(eq(dispatchSerials.dispatchId, dispatchId));

  const serialsByLine = new Map<string, string[]>();
  for (const s of serialRows) {
    const arr = serialsByLine.get(s.dispatchLineId) ?? [];
    arr.push(s.serialNumber ?? '—');
    serialsByLine.set(s.dispatchLineId, arr);
  }

  const lines: PdfDispatchLine[] = lineRows.map((l) => ({
    lineNumber: l.lineNumber,
    sku: l.productSku,
    name: l.productName,
    quantity: Math.round(Number(l.quantity)),
    serials: (serialsByLine.get(l.id) ?? []).sort(),
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

  const dealerParty = (d: typeof billTo) => ({
    name: d.displayName,
    legalName: d.legalName,
    addressLines: addressLines([
      d.addressLine1,
      d.addressLine2,
      [d.city, d.state, d.pincode].filter((p) => p && p.trim()).join(', '),
    ]),
    gstin: d.gstin ?? null,
    contact: d.contactPerson ?? null,
  });

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
    dispatchNumber: dispatch.dispatchNumber,
    dispatchDate: dispatch.dispatchDate,
    status: dispatch.status,
    orderNumber: order?.orderNumber ?? '—',
    orderDate: order?.orderDate ?? dispatch.dispatchDate,
    shipTo: dealerParty(shipTo),
    billTo: dealerParty(billTo),
    logistics: {
      vehicleNumber: dispatch.vehicleNumber,
      transporterName: dispatch.transporterName,
      transporterDocketNumber: dispatch.transporterDocketNumber,
      driverName: dispatch.driverName,
      driverPhone: dispatch.driverPhone,
      ewayBillNumber: dispatch.ewayBillNumber,
      ewayBillDate: dispatch.ewayBillDate,
      expectedDeliveryDate: dispatch.expectedDeliveryDate,
    },
    lines,
    notes: dispatch.notes ?? null,
    bank,
    generatedAt: new Date(),
  };
}

/**
 * Load a dispatch by id and render its note to a print-ready HTML string
 * plus the metadata the render-pdf job needs (filename, footer template).
 */
export async function buildDispatchNoteHtml(
  tx: DrizzleTx,
  tenantId: string,
  documentId: string,
): Promise<BuiltDispatchNoteHtml> {
  const data = await loadDispatchNotePdfData(tx, tenantId, documentId);
  return {
    html: renderDispatchNoteHtml(data),
    filename: `${data.dispatchNumber}.pdf`,
    footerTemplate: buildFooterTemplate(data),
  };
}
