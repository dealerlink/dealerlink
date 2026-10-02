'use server';

import { invoiceLines, invoices, orderLines, orders } from '@dealerlink/db';
import { createInvoiceFromOrderSchema } from '@dealerlink/schemas';
import { computeTax, Decimal, serializeOutput, sumDecimals } from '@dealerlink/tax';
import { asc, eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import { allocateInvoiceNumber } from './helpers';
import { computeRoundOff } from './round-off';

/**
 * Issue a GST tax invoice from a CONFIRMED order.
 *
 * ## AN ISSUED INVOICE IS IMMUTABLE. THERE IS NO EDIT PATH AND NO DELETE PATH.
 *
 * This file is the only way an invoice comes into existence, and nothing anywhere
 * updates one. That is not an omission to be filled in later:
 *
 *  - A wrong AMOUNT is corrected by a **credit note** (`create-note.ts`). Under GST
 *    the issued invoice stays on the record and the note reduces it.
 *  - An invoice that **should never have existed** — a mis-keyed number, a
 *    duplicate issue — is **cancelled**, with a reason and an actor, which the
 *    schema enforces.
 *
 * **Cancellation is NOT the correction mechanism.** It is the control closer to
 * hand, so it is the one somebody will reach for; cancelling because a total was
 * wrong removes the document from the trail while leaving the supply unaccounted
 * for, and the GST position then diverges from the document trail.
 *
 * ## HOW THE TOTALS ARE PRODUCED, GIVEN F.114
 *
 * `orders` stores `discount_amount` but **no `discount_type` / `discount_value`**
 * (F.114), so the discount cannot be re-derived as a percentage. It does not need
 * to be: an **amount**-type discount reproduces a stored amount EXACTLY —
 * `computeDiscountAmount` returns the value verbatim for `type: 'amount'` (read in
 * `packages/tax/src/compute.ts`), and the caller rounds it to 2dp, which a stored
 * `numeric(12,2)` already is. So the order's stored discount is passed back in as
 * the authority rather than guessed at.
 *
 * ## THE ORDER IS RECONCILED FIRST, AND THAT IS WHAT MAKES THE ROUND-OFF
 * ## DIAGNOSIS POSSIBLE
 *
 * Before any rounding, the engine's figures computed from the order's LINES are
 * checked against the order's own STORED columns. If they disagree, the order is
 * already internally inconsistent and **that** is reported — naming the order, the
 * figure and both values — rather than letting the inconsistency surface later as a
 * strange round-off on a tax invoice. This is F.152's hazard caught at the one
 * boundary where it would otherwise be written onto a legal record.
 */

const RECONCILED_FIGURES = [
  ['subtotal', 'subtotal'],
  ['discountAmount', 'discount_amount'],
  ['taxableAmount', 'taxable_amount'],
  ['cgstAmount', 'cgst_amount'],
  ['sgstAmount', 'sgst_amount'],
  ['igstAmount', 'igst_amount'],
  ['totalAmount', 'total_amount'],
] as const;

function assertOrderReconciles(
  orderNumber: string,
  stored: Record<string, string>,
  engine: Record<string, string>,
): void {
  for (const [key, column] of RECONCILED_FIGURES) {
    const s = new Decimal(stored[key]!).toFixed(2);
    const e = new Decimal(engine[key]!).toFixed(2);
    if (s !== e) {
      throw new AppError(
        'CONFLICT',
        `Cannot issue a tax invoice from order ${orderNumber}: its stored ` +
          `${column} is ${s}, but the tax engine computes ${e} from the order's own ` +
          `line items. The order is internally inconsistent, so an invoice derived ` +
          `from it would state a figure its own lines do not support. ` +
          `Reconcile order ${orderNumber} first — nothing is wrong with this ` +
          `invoice request.`,
      );
    }
  }
}

export const createInvoiceFromOrder = tenantAction(
  // ACCOUNTS AND ADMIN (F6 D-8). CLAUDE.md §6 gives Accounts "generate invoices"
  // explicitly. The credit and debit notes are admin-only, because reducing a
  // receivable is different authority from raising one.
  ['accounts', 'admin'],
  createInvoiceFromOrderSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;

    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) throw new AppError('NOT_FOUND', 'Order not found');
    if (order.status === 'pending') {
      throw new AppError(
        'CONFLICT',
        `Order ${order.orderNumber} is not confirmed. A tax invoice is issued ` +
          'against a confirmed order — confirm the order first.',
      );
    }
    if (order.status === 'cancelled') {
      throw new AppError(
        'CONFLICT',
        `Order ${order.orderNumber} is cancelled. No tax invoice can be issued against it.`,
      );
    }

    const existing = await tx
      .select({ id: invoices.id, number: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.orderId, order.id))
      .limit(1);
    if (existing[0]) {
      // One invoice per order in Phase 1. A second would double-count the supply,
      // and the correction for a wrong one is a credit note, not another invoice.
      throw new AppError(
        'CONFLICT',
        `Order ${order.orderNumber} has already been invoiced as ` +
          `${existing[0].number}. Issue a credit note against that invoice rather ` +
          'than a second invoice against the same order.',
      );
    }

    const lineRows = await tx
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id))
      .orderBy(asc(orderLines.lineNumber));
    if (lineRows.length === 0) {
      throw new AppError('CONFLICT', `Order ${order.orderNumber} has no line items`);
    }

    // The order's stored discount, passed back in as the authority. See the header.
    const discountAmount = new Decimal(order.discountAmount);
    const tax = serializeOutput(
      computeTax({
        tenantState: order.tenantStateAtIssue,
        placeOfSupply: order.placeOfSupply,
        discount: discountAmount.isZero() ? null : { type: 'amount', value: order.discountAmount },
        lines: lineRows.map((l) => ({
          lineId: l.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          gstRate: Number(l.gstRate),
        })),
      }),
    );

    assertOrderReconciles(
      order.orderNumber,
      order as unknown as Record<string, string>,
      tax as unknown as Record<string, string>,
    );

    // Grouped tax from the per-line figures the engine returned — the side that can
    // catch a grouping error (F6 D-12 / criterion 3).
    const groupedTax = sumDecimals(
      tax.lines.map((l) => new Decimal(l.lineCgst).plus(l.lineSgst).plus(l.lineIgst)),
    );

    const number = await allocateInvoiceNumber(
      tx,
      tenantId,
      input.invoiceDate ? new Date(input.invoiceDate) : undefined,
    );

    const { storedTotal, roundOff } = computeRoundOff({
      engineTotal: tax.totalAmount,
      taxableAmount: tax.taxableAmount,
      groupedTax,
      documentLabel: `tax invoice ${number}`,
      sourceLabel: `order ${order.orderNumber}`,
    });

    const [row] = await tx
      .insert(invoices)
      .values({
        tenantId,
        invoiceNumber: number,
        orderId: order.id,
        billToDealerId: order.billToDealerId,
        shipToDealerId: order.shipToDealerId,
        // Copied forward, never re-derived (ADR-016).
        tenantStateAtIssue: order.tenantStateAtIssue,
        placeOfSupply: order.placeOfSupply,
        deliveryArrangement: order.deliveryArrangement,
        preparedBy: auth.user.id,
        ...(input.invoiceDate ? { invoiceDate: input.invoiceDate } : {}),
        // The discount is recorded as the AMOUNT it was, because that is what the
        // order preserved. F.114 is why the type is not carried forward.
        ...(discountAmount.isZero()
          ? {}
          : { discountType: 'amount' as const, discountValue: order.discountAmount }),
        subtotal: tax.subtotal,
        discountAmount: tax.discountAmount,
        taxableAmount: tax.taxableAmount,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        // THE WHOLE-RUPEE TOTAL (F6 D-3). Deliberately not the engine's figure:
        // storing the engine total would make round_off identically zero forever.
        totalAmount: storedTotal.toFixed(2),
        roundOff: roundOff.toFixed(2),
        termsAndConditions: input.termsAndConditions ?? null,
        notes: input.notes ?? null,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: invoices.id, number: invoices.invoiceNumber });

    await tx.insert(invoiceLines).values(
      lineRows.map((l, i) => ({
        tenantId,
        invoiceId: row!.id,
        lineNumber: i + 1,
        productId: l.productId,
        productSku: l.productSku,
        productName: l.productName,
        hsnCode: l.hsnCode,
        quantity: l.quantity,
        unitOfMeasure: l.unitOfMeasure,
        unitPrice: l.unitPrice,
        gstRate: l.gstRate,
        lineTotal: l.lineTotal,
        description: l.description,
      })),
    );

    return { id: row!.id, invoiceNumber: row!.number, roundOff: roundOff.toFixed(2) };
  },
);
