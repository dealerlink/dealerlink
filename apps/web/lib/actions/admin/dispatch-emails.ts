'use server';

import { z } from 'zod';

import { operatorAction } from '@/lib/actions/wrap';
import { dispatchPendingEmails } from '@/lib/email/dispatch';

/**
 * Operator-triggered fallback for the pg-boss worker. Pulse the email
 * queue for one tenant (or the whole platform). Used by the tenant
 * detail page right after provisioning so the welcome mail goes out
 * inline; once pg-boss is wired this becomes vestigial but harmless.
 */
export const dispatchTenantEmails = operatorAction(
  z.object({ tenantId: z.string().uuid().optional() }),
  async ({ input }) => {
    const filter: { tenantId?: string } = {};
    if (input.tenantId) filter.tenantId = input.tenantId;
    const out = await dispatchPendingEmails(filter);
    return out;
  },
);
