import {
  creditNotes,
  dealers,
  debitNotes,
  invoiceLines,
  invoices,
  withTenant,
} from '@dealerlink/db';
import { and, asc, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/**
 * Reads for the tax invoice, credit note and debit note.
 *
 * ## MONEY IS READ FROM THE STORED COLUMNS. NOTHING HERE RECOMPUTES.
 *
 * Every figure below is the column as stored (F.152 / F6 D-1), including
 * `roundOff` — which is why `totalAmount` is the WHOLE-RUPEE figure and not the sum
 * of its parts. `Number()` on the way out because the driver returns `numeric` as a
 * string and the UI formats numbers; the value is not re-derived.
 */

const billTo = alias(dealers, 'bill_to');

export interface InvoiceListRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  billToName: string;
  totalAmount: number;
  roundOff: number;
}

export async function listInvoices(tenantId: string): Promise<InvoiceListRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceDate: invoices.invoiceDate,
        status: invoices.status,
        billToName: billTo.displayName,
        totalAmount: invoices.totalAmount,
        roundOff: invoices.roundOff,
      })
      .from(invoices)
      .innerJoin(billTo, eq(billTo.id, invoices.billToDealerId))
      .where(eq(invoices.tenantId, tenantId))
      .orderBy(desc(invoices.invoiceDate), desc(invoices.invoiceNumber));

    return rows.map(
      (r): InvoiceListRow => ({
        ...r,
        billToName: r.billToName ?? '—',
        totalAmount: Number(r.totalAmount),
        roundOff: Number(r.roundOff),
      }),
    );
  });
}

export async function getInvoiceDetail(tenantId: string, invoiceId: string) {
  return withTenant(tenantId, async (tx) => {
    const [header] = await tx
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        invoiceDate: invoices.invoiceDate,
        status: invoices.status,
        orderId: invoices.orderId,
        placeOfSupply: invoices.placeOfSupply,
        tenantStateAtIssue: invoices.tenantStateAtIssue,
        deliveryArrangement: invoices.deliveryArrangement,
        billToName: billTo.displayName,
        subtotal: invoices.subtotal,
        discountAmount: invoices.discountAmount,
        taxableAmount: invoices.taxableAmount,
        cgstAmount: invoices.cgstAmount,
        sgstAmount: invoices.sgstAmount,
        igstAmount: invoices.igstAmount,
        roundOff: invoices.roundOff,
        totalAmount: invoices.totalAmount,
        cancelledReason: invoices.cancelledReason,
      })
      .from(invoices)
      .innerJoin(billTo, eq(billTo.id, invoices.billToDealerId))
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
      .limit(1);
    if (!header) return null;

    const lines = await tx
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId))
      .orderBy(asc(invoiceLines.lineNumber));

    // The notes raised against this invoice. Both carry the SNAPSHOTTED invoice
    // number as well as the FK; this joins on the FK, which is what the FK is for.
    const credits = await tx
      .select({
        id: creditNotes.id,
        number: creditNotes.creditNoteNumber,
        date: creditNotes.creditNoteDate,
        reason: creditNotes.reason,
        totalAmount: creditNotes.totalAmount,
      })
      .from(creditNotes)
      .where(eq(creditNotes.invoiceId, invoiceId))
      .orderBy(asc(creditNotes.creditNoteNumber));

    const debits = await tx
      .select({
        id: debitNotes.id,
        number: debitNotes.debitNoteNumber,
        date: debitNotes.debitNoteDate,
        reason: debitNotes.reason,
        totalAmount: debitNotes.totalAmount,
      })
      .from(debitNotes)
      .where(eq(debitNotes.invoiceId, invoiceId))
      .orderBy(asc(debitNotes.debitNoteNumber));

    const n = (v: string) => Number(v);
    return {
      header: {
        ...header,
        billToName: header.billToName ?? '—',
        subtotal: n(header.subtotal),
        discountAmount: n(header.discountAmount),
        taxableAmount: n(header.taxableAmount),
        cgstAmount: n(header.cgstAmount),
        sgstAmount: n(header.sgstAmount),
        igstAmount: n(header.igstAmount),
        roundOff: n(header.roundOff),
        totalAmount: n(header.totalAmount),
      },
      lines: lines.map((l) => ({
        ...l,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        gstRate: Number(l.gstRate),
        lineTotal: Number(l.lineTotal),
      })),
      credits: credits.map((c) => ({ ...c, totalAmount: Number(c.totalAmount) })),
      debits: debits.map((d) => ({ ...d, totalAmount: Number(d.totalAmount) })),
    };
  });
}

/**
 * The invoice issued against an order, if any.
 *
 * One invoice per order in Phase 1, so this returns at most one row. The ORDER
 * page uses it to hide the issue control and show the number instead; the write
 * path enforces the rule independently, because a hidden button is not a
 * constraint (CLAUDE.md §6: hiding a button is not security).
 */
export async function getInvoiceForOrder(
  tenantId: string,
  orderId: string,
): Promise<{ id: string; invoiceNumber: string } | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.orderId, orderId)))
      .limit(1);
    return row ?? null;
  });
}
