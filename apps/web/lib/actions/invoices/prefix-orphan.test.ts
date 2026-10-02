/**
 * A.9 — the orphan "Tax invoice" prefix becomes correct BY CONSTRUCTION. Executed.
 *
 * ## WHAT THE ORPHAN WAS
 *
 * `apps/web/app/admin/tenants/[id]/tenant-detail-sections.tsx` has rendered a live,
 * role-gated, persisting "Tax invoice" prefix input since Day 1 — for a document
 * that could not be created. `invoice` is also REQUIRED in `docPrefixesSchema`, so
 * it could not be removed either. An operator could change a value that reached
 * nothing.
 *
 * ## WHY THIS IS A TEST AND NOT A NOTE
 *
 * "It becomes correct once the invoice exists" is exactly the kind of claim that is
 * obviously true and occasionally false. The allocator reads
 * `prefixes['invoice'] ?? 'INV'`, and a fallback that silently wins would make an
 * edited prefix look applied in the admin UI while every issued invoice ignored it.
 * The only thing that settles it is editing the prefix and reading the number off a
 * freshly allocated document.
 *
 * Runs inside a rolled-back transaction, so neither the prefix nor the counter
 * persists.
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

import { adminDb, tenantSettings, withTenant } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { allocateInvoiceNumber } from './helpers';

class Rollback extends Error {
  constructor(readonly payload: unknown) {
    super('__rollback__');
  }
}

async function inRolledBackTx<T>(
  tenantId: string,
  body: (tx: Parameters<Parameters<typeof withTenant>[1]>[0]) => Promise<T>,
): Promise<T> {
  try {
    await withTenant(tenantId, async (tx) => {
      throw new Rollback(await body(tx));
    });
  } catch (e) {
    if (e instanceof Rollback) return e.payload as T;
    throw e;
  }
  throw new Error('transaction did not roll back');
}

async function demoTenantId(): Promise<string> {
  const rows = (await adminDb.execute(
    sql`SELECT id::text AS id FROM tenants WHERE slug = 'demo' LIMIT 1`,
  )) as unknown as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new Error('demo tenant missing — run pnpm db:seed');
  return id;
}

describe('A.9 — the operator-edited invoice prefix reaches a real document number', () => {
  it('an edited prefix appears in the allocated invoice number', async () => {
    const tenantId = await demoTenantId();

    const result = await inRolledBackTx(tenantId, async (tx) => {
      // What the admin UI does: write the whole doc_prefixes JSONB back.
      const [before] = await tx
        .select({ docPrefixes: tenantSettings.docPrefixes })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId))
        .limit(1);
      const prefixes = { ...((before?.docPrefixes ?? {}) as Record<string, string>) };
      const original = prefixes['invoice'];
      prefixes['invoice'] = 'ZZTEST';
      await tx
        .update(tenantSettings)
        .set({ docPrefixes: prefixes })
        .where(eq(tenantSettings.tenantId, tenantId));

      const number = await allocateInvoiceNumber(tx, tenantId);
      return { number, original };
    });

    // THE ASSERTION THE CLAIM NEEDED. If the `?? 'INV'` fallback won, or if the
    // allocator read a different key, this would read INV-… and the admin input
    // would be decorative.
    expect(result.number.startsWith('ZZTEST-')).toBe(true);
    expect(result.number).toMatch(/^ZZTEST-\d{4}-\d{4}$/);

    // And the shipped default really is 'INV' — so the orphan input was editing a
    // value that already had a sensible default, not an empty one.
    expect(result.original).toBe('INV');
  });

  it('nothing persisted — the prefix is back to its seeded value', async () => {
    const rows = (await adminDb.execute(sql`
      SELECT s.doc_prefixes->>'invoice' AS prefix
      FROM tenant_settings s JOIN tenants t ON t.id = s.tenant_id
      WHERE t.slug = 'demo'`)) as unknown as { prefix: string }[];
    expect(rows[0]?.prefix).toBe('INV');
  });
});
