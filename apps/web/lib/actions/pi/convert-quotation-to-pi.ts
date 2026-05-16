'use server';

import { performaInvoiceLines, performaInvoices, quotations } from '@dealerlink/db';
import { convertQuotationToPiSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import {
  allocateDocumentNumber,
  buildPiLineInserts,
  computeDocumentTotals,
  fiscalYear,
  loadDealerForDocument,
  loadQuotationLines,
  loadTenantPiContext,
  writePiStatusHistory,
  type DocumentDiscount,
} from './helpers';

/**
 * Convert an accepted quotation into a draft Performa Invoice.
 *
 * Bill-To is the quotation's dealer. Ship-To defaults to the same dealer but
 * can be redirected; when the Ship-To dealer sits in a different state the
 * tax is recomputed — place of supply follows Ship-To per ADR-012 (IGST
 * Act §10), which may flip the document between IGST and CGST/SGST.
 */
export const convertQuotationToPi = tenantAction(
  ['admin', 'sales'],
  convertQuotationToPiSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;
    const role = auth.user.role;

    const [q] = await tx
      .select({
        id: quotations.id,
        quoteNumber: quotations.quoteNumber,
        status: quotations.status,
        dealerId: quotations.dealerId,
        dealId: quotations.dealId,
        preparedBy: quotations.preparedBy,
        discountType: quotations.discountType,
        discountValue: quotations.discountValue,
        termsAndConditions: quotations.termsAndConditions,
      })
      .from(quotations)
      .where(eq(quotations.id, input.quotationId))
      .limit(1);
    if (!q) throw new AppError('NOT_FOUND', 'Quotation not found');
    if (q.status !== 'accepted') {
      throw new AppError(
        'VALIDATION',
        `Only accepted quotations can be converted to a PI (this one is "${q.status}")`,
      );
    }
    if (role === 'sales' && q.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only convert quotations you prepared');
    }

    const billToId = q.dealerId;
    const shipToId = input.shipToDealerId ?? q.dealerId;
    const billTo = await loadDealerForDocument(tx, billToId, 'Bill-To');
    const shipTo =
      shipToId === billToId ? billTo : await loadDealerForDocument(tx, shipToId, 'Ship-To');

    const tenantCtx = await loadTenantPiContext(tx, tenantId);
    // ADR-012: place of supply is the SHIP-TO state.
    const placeOfSupply = (input.placeOfSupplyOverride ?? shipTo.state).toUpperCase();

    const lines = await loadQuotationLines(tx, q.id);
    if (lines.length === 0) {
      throw new AppError('VALIDATION', 'The source quotation has no line items');
    }

    // Discount: an explicit override (incl. null = "remove") or the quote's.
    const discount: DocumentDiscount | null =
      input.discount !== undefined
        ? input.discount
        : q.discountType
          ? { type: q.discountType, value: Number(q.discountValue) }
          : null;

    const totals = computeDocumentTotals(lines, discount, tenantCtx.tenantState, placeOfSupply);

    const fy = fiscalYear();
    const piNumber = await allocateDocumentNumber(
      tx,
      tenantId,
      'performa_invoice',
      tenantCtx.piPrefix,
      fy,
    );
    const now = new Date();

    const [created] = await tx
      .insert(performaInvoices)
      .values({
        tenantId,
        piNumber,
        quotationId: q.id,
        dealId: q.dealId,
        billToDealerId: billToId,
        shipToDealerId: shipToId,
        tenantStateAtIssue: tenantCtx.tenantState,
        placeOfSupply,
        preparedBy: auth.user.id,
        piDate: input.piDate ?? now.toISOString().slice(0, 10),
        validUntil: input.validUntil,
        currency: 'INR',
        discountType: discount?.type ?? null,
        discountValue: discount?.value != null ? discount.value.toFixed(2) : null,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxableAmount: totals.taxableAmount,
        cgstAmount: totals.cgstAmount,
        sgstAmount: totals.sgstAmount,
        igstAmount: totals.igstAmount,
        totalAmount: totals.totalAmount,
        termsAndConditions:
          input.termsAndConditions?.toString().trim() ||
          q.termsAndConditions ||
          tenantCtx.defaultTerms,
        notes: input.notes?.toString().trim() || null,
        status: 'draft',
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: performaInvoices.id, piNumber: performaInvoices.piNumber });
    if (!created) throw new AppError('INTERNAL', 'Failed to create the performa invoice');

    await tx
      .insert(performaInvoiceLines)
      .values(buildPiLineInserts(lines, { tenantId, performaInvoiceId: created.id }));

    await writePiStatusHistory(tx, {
      tenantId,
      performaInvoiceId: created.id,
      fromStatus: null,
      toStatus: 'draft',
      actorId: auth.user.id,
      reason: `converted_from_${q.quoteNumber}`,
    });

    return {
      id: created.id,
      piNumber: created.piNumber,
      isInterState: totals.isInterState,
      placeOfSupply,
      shipToDealerId: shipToId,
      shipToName: shipTo.name,
    };
  },
);
