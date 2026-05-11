'use server';

import { inboundTokenHistory, tenantSettings, type DrizzleTx } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';

import { operatorAction } from '@/lib/actions/wrap';
import { generateInboundToken } from '@/lib/admin/credentials';
import { regenerateInboundTokenSchema } from '@/lib/admin/schemas';
import { AppError } from '@/lib/errors';

const GRACE_DAYS = 7;

async function bindTenantContext(tx: DrizzleTx, tenantId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
}

/**
 * Rotate a tenant's inbound email token. The OLD token is parked in
 * `inbound_token_history` with a 7-day grace window so existing BCC
 * instructions keep working briefly while the tenant updates them.
 */
export const regenerateInboundToken = operatorAction(
  regenerateInboundTokenSchema,
  async ({ tx, input }) => {
    await bindTenantContext(tx, input.tenantId);

    const [current] = await tx
      .select({ token: tenantSettings.inboundEmailToken })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, input.tenantId))
      .limit(1);
    if (!current) throw new AppError('NOT_FOUND', 'Tenant settings not found');

    const newToken = generateInboundToken();
    if (current.token) {
      const expires = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
      await tx.insert(inboundTokenHistory).values({
        tenantId: input.tenantId,
        token: current.token,
        expiresAt: expires,
      });
    }

    await tx
      .update(tenantSettings)
      .set({ inboundEmailToken: newToken, updatedAt: sql`now()` })
      .where(eq(tenantSettings.tenantId, input.tenantId));

    return {
      tenantId: input.tenantId,
      newToken,
      previousTokenRetiredFor: current.token ? GRACE_DAYS : 0,
    };
  },
);
