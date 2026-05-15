'use server';

import { quotationLines, quotationStatusHistory, quotations } from '@dealerlink/db';
import { deleteQuotationSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

/** Admin-only. Only draft quotations can be deleted (hard delete). */
export const deleteQuotation = tenantAction(
  ['admin'],
  deleteQuotationSchema,
  async ({ tx, input }) => {
    const [existing] = await tx
      .select({ id: quotations.id, status: quotations.status })
      .from(quotations)
      .where(eq(quotations.id, input.id))
      .limit(1);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');
    if (existing.status !== 'draft') {
      throw new AppError('VALIDATION', 'Only draft quotations can be deleted');
    }
    await tx.delete(quotationLines).where(eq(quotationLines.quotationId, input.id));
    await tx.delete(quotationStatusHistory).where(eq(quotationStatusHistory.quotationId, input.id));
    await tx.delete(quotations).where(eq(quotations.id, input.id));
    return { id: input.id };
  },
);
