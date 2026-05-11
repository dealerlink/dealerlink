'use server';

import { procurements } from '@dealerlink/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

export const confirmProcurement = tenantAction(
  ['admin', 'dispatch'],
  z.object({ id: z.string().uuid() }),
  async ({ tx, input, auth }) => {
    const [proc] = await tx
      .select({ status: procurements.status })
      .from(procurements)
      .where(eq(procurements.id, input.id))
      .limit(1);
    if (!proc) throw new AppError('NOT_FOUND', 'Procurement not found');
    if (proc.status !== 'draft') {
      throw new AppError('VALIDATION', `Cannot confirm a procurement in status "${proc.status}"`);
    }
    await tx
      .update(procurements)
      .set({
        status: 'confirmed',
        confirmedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(eq(procurements.id, input.id));
    return { id: input.id };
  },
);
