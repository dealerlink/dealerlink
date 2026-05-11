'use server';

import { tenants } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';

import { operatorAction } from '@/lib/actions/wrap';
import { checkSlugSchema } from '@/lib/admin/schemas';

/**
 * Returns whether the slug is available. Used by the create-tenant form's
 * debounced live check; the actual uniqueness is also enforced inside
 * `createTenant()` so this is a UX nicety, not a security boundary.
 */
export const checkSlugAvailable = operatorAction(checkSlugSchema, async ({ tx, input }) => {
  const row = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(sql`lower(${tenants.slug})`, input.slug))
    .limit(1);
  return { available: row.length === 0 };
});
