'use server';

import { procurements } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

/**
 * Verify every line item with a serial-tracked product has its full serial
 * count submitted, then transition the procurement to 'received'.
 */
export const finalizeProcurement = tenantAction(
  ['admin', 'dispatch'],
  z.object({ id: z.string().uuid() }),
  async ({ tx, input, auth }) => {
    const [proc] = await tx
      .select({ status: procurements.status })
      .from(procurements)
      .where(eq(procurements.id, input.id))
      .limit(1);
    if (!proc) throw new AppError('NOT_FOUND', 'Procurement not found');
    if (proc.status !== 'confirmed') {
      throw new AppError(
        'VALIDATION',
        `Procurement must be confirmed before finalize (current: ${proc.status})`,
      );
    }

    const incomplete = await tx.execute<{ product_id: string; qty: number; received: number }>(sql`
      SELECT pi.product_id, pi.quantity AS qty, pi.serials_received AS received
      FROM procurement_items pi
      JOIN products p ON p.id = pi.product_id
      WHERE pi.procurement_id = ${input.id}
        AND p.requires_serial = true
        AND pi.serials_received < pi.quantity
    `);
    const rows = incomplete as unknown as { product_id: string; qty: number; received: number }[];
    if (rows.length > 0) {
      throw new AppError(
        'VALIDATION',
        `${rows.length} serial-tracked line(s) still missing serials`,
      );
    }

    // For non-serial-tracked lines, mark serials_received = quantity for consistency.
    await tx.execute(sql`
      UPDATE procurement_items pi
      SET serials_received = pi.quantity, updated_at = now()
      FROM products p
      WHERE pi.procurement_id = ${input.id}
        AND p.id = pi.product_id
        AND p.requires_serial = false
        AND pi.serials_received < pi.quantity
    `);

    await tx
      .update(procurements)
      .set({
        status: 'received',
        receivedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(eq(procurements.id, input.id));

    return { id: input.id };
  },
);
