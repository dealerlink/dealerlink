/**
 * A.4 — the three new document series need NO migration. Executed, not inherited.
 *
 * The audit and the day prompt both assert this from reading
 * `document_counters.docType` is free-text. That reading is correct, but
 * "no migration needed" is a claim about RUNTIME behaviour and the only thing that
 * settles it is allocating a number for a `docType` that has never existed and
 * watching a counter row appear. This does that, inside a transaction it rolls
 * back.
 *
 * It also pins the two behaviours a number allocator must have and which a reading
 * cannot confirm: the sequence INCREMENTS, and it is scoped per `(tenant, docType,
 * fiscalYear)` so three series do not share one counter — which GST requires and
 * which a shared counter would silently break by making INV-…-0007 and CN-…-0007
 * mutually exclusive.
 */
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

// apps/web has no DB-backed unit tests, so its vitest config loads no env. The e2e
// specs load it per-file for the same reason; this follows that pattern rather than
// changing the shared config for one test.
const repoRoot = path.resolve(process.cwd(), '../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

import { adminDb, withTenant } from '@dealerlink/db';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  allocateCreditNoteNumber,
  allocateDebitNoteNumber,
  allocateInvoiceNumber,
  fiscalYear,
  INVOICE_DOC_TYPES,
} from './helpers';

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

describe('A.4 — invoice / credit note / debit note numbering', () => {
  it('allocates all three series with no migration, and they do not share a counter', async () => {
    const tenantId = await demoTenantId();
    const fy = fiscalYear();

    const result = await inRolledBackTx(tenantId, async (tx) => {
      const inv1 = await allocateInvoiceNumber(tx, tenantId);
      const inv2 = await allocateInvoiceNumber(tx, tenantId);
      const cn1 = await allocateCreditNoteNumber(tx, tenantId);
      const dn1 = await allocateDebitNoteNumber(tx, tenantId);

      const counters = (await tx.execute(sql`
        SELECT doc_type, last_value::int AS last_value
        FROM document_counters
        WHERE tenant_id = ${tenantId}::uuid AND fiscal_year = ${fy}
          AND doc_type IN ('invoice', 'credit_note', 'debit_note')
        ORDER BY doc_type`)) as unknown as { doc_type: string; last_value: number }[];

      return { inv1, inv2, cn1, dn1, counters };
    });

    // Shape: PREFIX-FY-NNNN, zero-padded to four.
    expect(result.inv1).toMatch(/^[A-Z]+-\d{4}-\d{4}$/);
    expect(result.cn1).toMatch(/^[A-Z]+-\d{4}-\d{4}$/);
    expect(result.dn1).toMatch(/^[A-Z]+-\d{4}-\d{4}$/);

    // It INCREMENTS. A counter that returned the same number twice would still
    // match the shape above, which is why this assertion is separate.
    expect(result.inv1).not.toBe(result.inv2);
    const seq = (n: string) => Number(n.split('-')[2]);
    expect(seq(result.inv2)).toBe(seq(result.inv1) + 1);

    // THREE SEPARATE SERIES. Enumerated rather than counted, and each must have its
    // own row — a shared counter is the failure this asserts against.
    expect(result.counters.map((c) => c.doc_type)).toEqual([
      'credit_note',
      'debit_note',
      'invoice',
    ]);
    // The credit note and debit note are brand-new doc_types, so each is at 1 while
    // invoice was allocated twice.
    expect(result.counters.find((c) => c.doc_type === 'credit_note')?.last_value).toBe(1);
    expect(result.counters.find((c) => c.doc_type === 'debit_note')?.last_value).toBe(1);

    // The three numbers differ in their prefixes, not merely their sequences.
    const prefix = (n: string) => n.split('-')[0];
    expect(new Set([prefix(result.inv1), prefix(result.cn1), prefix(result.dn1)]).size).toBe(3);
  });

  it('rolls back — no counter row for the new series persists', async () => {
    const tenantId = await demoTenantId();
    const rows = (await adminDb.execute(sql`
      SELECT doc_type FROM document_counters
      WHERE tenant_id = ${tenantId}::uuid AND doc_type IN ('credit_note', 'debit_note')`)) as unknown as {
      doc_type: string;
    }[];
    // If the rollback leaked, these series would now exist outside any transaction.
    expect(rows).toHaveLength(0);
  });

  it('names its three doc types as a list, so a fourth cannot be added silently', () => {
    expect([...INVOICE_DOC_TYPES]).toEqual(['invoice', 'credit_note', 'debit_note']);
  });
});
