'use server';

import {
  creditNoteLines,
  creditNotes,
  debitNoteLines,
  debitNotes,
  invoices,
  products,
  type DrizzleTx,
} from '@dealerlink/db';
import { createCreditNoteSchema, createDebitNoteSchema } from '@dealerlink/schemas';
import { computeTax, serializeOutput, TaxComputationError } from '@dealerlink/tax';
import { eq, inArray } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import { allocateCreditNoteNumber, allocateDebitNoteNumber } from './helpers';

/**
 * Issue a credit note or a debit note against an ISSUED tax invoice.
 *
 * ## THE DIRECTION IS THE DOCUMENT TYPE. THE LINES ARE POSITIVE. (D-8 / F6 D-11)
 *
 * `packages/tax` is not touched and needs no change, which is the whole reason D-8
 * was settled this way. Both notes run the SAME engine over POSITIVE lines; a
 * credit note reduces what the dealer owes and a debit note increases it, and that
 * fact lives in which table the row lands in.
 *
 * The alternative — a signed engine — was rejected because it would make every
 * consumer of every total responsible for knowing which way the document points.
 * One place knowing is better than all of them knowing.
 *
 * ## WHAT THIS DELIBERATELY DOES NOT DO: SETTLEMENT
 *
 * Issuing a note writes to this table and nothing else. It does **not** touch
 * `payments`, `payment_allocations`, an order's `payment_status`, or any
 * outstanding figure — F6 D-10, and the scope call holds on the write side:
 * nothing in the payment tables is NOT NULL against a note, FK'd to one, or
 * checked by one.
 *
 * **But settlement is entirely ORDER-anchored, so a note is invisible to it**, and
 * five read paths therefore under-report once a note exists. They carry a comment
 * naming **F.161**. That is a known, filed, HIGH gap — not an oversight of this
 * action — and it means a fully-credited order cannot reach `paid` and the
 * outstanding figures overstate the receivable until F.161 lands.
 */

interface NoteRow {
  id: string;
  invoiceNumber: string;
  tenantStateAtIssue: string;
  placeOfSupply: string;
  deliveryArrangement: string | null;
  billToDealerId: string;
  shipToDealerId: string;
  status: string;
}

/** Load the originating invoice and refuse the ones a note cannot be raised against. */
async function loadOriginatingInvoice(tx: DrizzleTx, invoiceId: string): Promise<NoteRow> {
  const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) throw new AppError('NOT_FOUND', 'Invoice not found');
  if (inv.status === 'cancelled') {
    // A cancelled invoice is one that should never have existed. Crediting it would
    // assert that a supply happened and was then reduced, which is a different
    // claim from "this document was raised in error".
    throw new AppError(
      'CONFLICT',
      `Invoice ${inv.invoiceNumber} is cancelled. A note cannot be raised against a ` +
        'cancelled invoice — cancellation means the document should never have existed, ' +
        'so there is nothing to credit or debit.',
    );
  }
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    tenantStateAtIssue: inv.tenantStateAtIssue,
    placeOfSupply: inv.placeOfSupply,
    deliveryArrangement: inv.deliveryArrangement,
    billToDealerId: inv.billToDealerId,
    shipToDealerId: inv.shipToDealerId,
    status: inv.status,
  };
}

async function buildNote(
  tx: DrizzleTx,
  input: {
    invoiceId: string;
    reason: string;
    notes?: string | undefined;
    lines: {
      productId: string;
      quantity: number;
      unitPrice: number;
      description?: string | undefined;
    }[];
  },
) {
  const inv = await loadOriginatingInvoice(tx, input.invoiceId);

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const productRows = await tx.select().from(products).where(inArray(products.id, productIds));
  const byId = new Map(productRows.map((p) => [p.id, p]));
  for (const id of productIds) {
    if (!byId.has(id)) throw new AppError('NOT_FOUND', `Product ${id} not found`);
  }

  // The party and state columns are COPIED FORWARD from the invoice, never
  // re-derived. An address or a dealer corrected later must not change the tax
  // classification of a note that reduces an already-issued document.
  let tax;
  try {
    tax = serializeOutput(
      computeTax({
        tenantState: inv.tenantStateAtIssue,
        placeOfSupply: inv.placeOfSupply,
        discount: null,
        lines: input.lines.map((l, i) => ({
          lineId: String(i),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          gstRate: Number(byId.get(l.productId)!.gstRate),
        })),
      }),
    );
  } catch (e) {
    if (e instanceof TaxComputationError) {
      // NEGATIVE_QUANTITY fires at quantity 0 too, and its name misdescribes that
      // case (F.159). A reversal is expressed by OMITTING the line.
      throw new AppError(
        'VALIDATION',
        e.code === 'NEGATIVE_QUANTITY'
          ? 'Every line must have a quantity greater than zero. To reverse a line ' +
              'entirely, leave it out of the note rather than sending a quantity of 0.'
          : e.message,
      );
    }
    throw e;
  }

  return { inv, tax, byId };
}

export const createCreditNote = tenantAction(
  // ADMIN ONLY (F6 D-8). Reducing a receivable is different authority from raising
  // one: Accounts issues invoices, Admin issues the notes that reduce them.
  ['admin'],
  createCreditNoteSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;
    const { inv, tax, byId } = await buildNote(tx, input);
    const number = await allocateCreditNoteNumber(tx, tenantId);

    const [row] = await tx
      .insert(creditNotes)
      .values({
        tenantId,
        creditNoteNumber: number,
        invoiceId: inv.id,
        // SNAPSHOT, not derived through the FK. A reported value that is a function
        // of another record's current state is wrong whether or not GSTR-1 requires
        // the snapshot — the same class F.152 removed for money.
        invoiceNumber: inv.invoiceNumber,
        billToDealerId: inv.billToDealerId,
        shipToDealerId: inv.shipToDealerId,
        tenantStateAtIssue: inv.tenantStateAtIssue,
        placeOfSupply: inv.placeOfSupply,
        deliveryArrangement: inv.deliveryArrangement,
        preparedBy: auth.user.id,
        reason: input.reason,
        notes: input.notes ?? null,
        subtotal: tax.subtotal,
        discountAmount: tax.discountAmount,
        taxableAmount: tax.taxableAmount,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        totalAmount: tax.totalAmount,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: creditNotes.id, number: creditNotes.creditNoteNumber });

    await tx.insert(creditNoteLines).values(
      tax.lines.map((l, i) => {
        const src = input.lines[i]!;
        const p = byId.get(src.productId)!;
        return {
          tenantId,
          creditNoteId: row!.id,
          lineNumber: i + 1,
          productId: p.id,
          productSku: p.sku,
          productName: p.name,
          hsnCode: p.hsnCode,
          quantity: String(src.quantity),
          unitPrice: String(src.unitPrice),
          gstRate: String(p.gstRate),
          lineTotal: l.lineTotal,
          description: src.description ?? null,
        };
      }),
    );

    return { id: row!.id, creditNoteNumber: row!.number };
  },
);

export const createDebitNote = tenantAction(
  ['admin'],
  createDebitNoteSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;
    const { inv, tax, byId } = await buildNote(tx, input);
    const number = await allocateDebitNoteNumber(tx, tenantId);

    const [row] = await tx
      .insert(debitNotes)
      .values({
        tenantId,
        debitNoteNumber: number,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        billToDealerId: inv.billToDealerId,
        shipToDealerId: inv.shipToDealerId,
        tenantStateAtIssue: inv.tenantStateAtIssue,
        placeOfSupply: inv.placeOfSupply,
        deliveryArrangement: inv.deliveryArrangement,
        preparedBy: auth.user.id,
        reason: input.reason,
        notes: input.notes ?? null,
        subtotal: tax.subtotal,
        discountAmount: tax.discountAmount,
        taxableAmount: tax.taxableAmount,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        totalAmount: tax.totalAmount,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: debitNotes.id, number: debitNotes.debitNoteNumber });

    await tx.insert(debitNoteLines).values(
      tax.lines.map((l, i) => {
        const src = input.lines[i]!;
        const p = byId.get(src.productId)!;
        return {
          tenantId,
          debitNoteId: row!.id,
          lineNumber: i + 1,
          productId: p.id,
          productSku: p.sku,
          productName: p.name,
          hsnCode: p.hsnCode,
          quantity: String(src.quantity),
          unitPrice: String(src.unitPrice),
          gstRate: String(p.gstRate),
          lineTotal: l.lineTotal,
          description: src.description ?? null,
        };
      }),
    );

    return { id: row!.id, debitNoteNumber: row!.number };
  },
);
