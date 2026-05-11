import { sql } from 'drizzle-orm';

import type { DrizzleTx } from '../with-tenant';

/**
 * Atomically increment a tenant-scoped document counter and return the new
 * value. Uses INSERT ... ON CONFLICT to handle first-time creation in a
 * single round-trip. fiscalYear=0 is reserved for non-fiscal counters
 * (e.g., dealer_code) that do not reset on April 1.
 *
 * Must be called inside a tenant context (withTenant) so RLS lets us touch
 * document_counters.
 */
export async function nextCounter(
  tx: DrizzleTx,
  tenantId: string,
  docType: string,
  fiscalYear: number,
): Promise<number> {
  const result = await tx.execute<{ last_value: string | number }>(sql`
    INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
    VALUES (${tenantId}, ${docType}, ${fiscalYear}, 1)
    ON CONFLICT (tenant_id, doc_type, fiscal_year)
    DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
    RETURNING last_value
  `);
  const row = (result as unknown as { last_value: string | number }[])[0];
  if (!row) throw new Error('document_counters update returned no row');
  return typeof row.last_value === 'number' ? row.last_value : Number(row.last_value);
}

/**
 * Format a dealer code. Tenant-scoped, non-fiscal — always 6 digits.
 * Pattern: DL-000001
 */
export function formatDealerCode(n: number): string {
  return `DL-${String(n).padStart(6, '0')}`;
}

/**
 * Convenience: allocate the next dealer code for the given tenant.
 */
export async function nextDealerCode(tx: DrizzleTx, tenantId: string): Promise<string> {
  const n = await nextCounter(tx, tenantId, 'dealer', 0);
  return formatDealerCode(n);
}
