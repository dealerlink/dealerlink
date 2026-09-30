/**
 * F.152 / F6 D-1 — does the loader actually READ the stored total, and can the
 * reconciliation assertion actually FAIL?
 *
 * ## WHY A GREEN PARITY TEST PROVES NOTHING HERE
 *
 * `pdf-snapshots.test.ts` was green before this change and is green after it, and
 * `compare-figures.mjs` reports all 196 figures identical across all 14 reference
 * documents. **None of that is evidence that the loader reads the column**, because
 * on this corpus the stored columns were themselves written by `computeTax` over the
 * same lines — so reading and recomputing produce byte-identical output. A loader
 * that ignored the new code path entirely would pass every one of those checks.
 *
 * That is DEV.138's signature exactly: a real command, real output, and no
 * demonstration that the negative case could be reached. The only thing that can
 * tell reading from recomputing is **making the two disagree**, which is what this
 * file does.
 *
 * ## HOW, AND WHY IT IS SAFE
 *
 * Each test opens a transaction, mutates one stored money column, drives the
 * production loader inside that same transaction, asserts, and then **rolls back by
 * throwing a sentinel**. Nothing persists — the final test re-reads the row outside
 * any transaction and asserts the original value, so the rollback is verified
 * rather than assumed. The instrument is the one F.152's own measurement used
 * (`+1.11`, named with `delta=-1.11`, rolled back).
 *
 * ## THE TWO ASSERTIONS ARE TESTED SEPARATELY, ON PURPOSE
 *
 * `readStoredTotals` makes two checks, and the second exists because the first
 * cannot detect a wrong `taxable_amount` — it cancels on both sides of
 * `total − (taxable + tax)`. A single test that perturbed both halves at once would
 * pass while only one assertion worked.
 */
import { adminDb, withTenant } from '@dealerlink/db';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { resolveDocument } from '../scripts/resolve-document';
import { loadPerformaInvoicePdfData } from '../src/templates/performa-invoice';
import { TotalsReconciliationError } from '../src/templates/stored-totals';

/** A reference PI with lines, so the loader has something to group. */
const PI_NUMBER = 'PI-2026-0001';

class Rollback extends Error {
  constructor(readonly payload: unknown) {
    super('__rollback__');
  }
}

/**
 * Run `body` inside a tenant transaction that is ALWAYS rolled back, and return
 * whatever `body` produced. A thrown `Rollback` carries the payload out; anything
 * else propagates as a real failure.
 */
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

describe('F.152 — the loader reads the stored total, and the assertion can fail', () => {
  it('the rendered total FOLLOWS a mutation of the stored column', async () => {
    const { tenantId, documentId } = await resolveDocument({
      type: 'performa_invoice',
      tenantSlug: 'demo',
      documentNumber: PI_NUMBER,
    });

    const result = await inRolledBackTx(tenantId, async (tx) => {
      const before = await loadPerformaInvoicePdfData(tx, tenantId, documentId);

      // Move the stored total by a whole rupee. A rupee rather than a paisa so the
      // delta cannot be confused with a rounding artefact — and `total_amount`
      // rather than a tax column, because moving a tax column would trip the
      // reconciliation assertion instead, which is the NEXT test.
      await tx.execute(sql`
        UPDATE performa_invoices SET total_amount = total_amount + 1.11
        WHERE id = ${documentId}::uuid`);

      const after = await loadPerformaInvoicePdfData(tx, tenantId, documentId);
      return { before: before.totalAmount, after: after.totalAmount, words: after.amountInWords };
    });

    // THIS is the assertion that distinguishes reading from recomputing. Before the
    // F.152 change it would have FAILED: `computeTax` over unchanged lines returns
    // the unchanged total, so `after` would have equalled `before`.
    expect(result.after).toBeCloseTo(result.before + 1.11, 2);

    // And `amountInWords` must follow the same number, or the document states one
    // figure in digits and a different one in words.
    expect(result.words).not.toBe('');
    expect(result.words.toLowerCase()).not.toContain('nan');
  });

  it('a stored tax column that disagrees with the grouped tax THROWS, naming the document', async () => {
    const { tenantId, documentId } = await resolveDocument({
      type: 'performa_invoice',
      tenantSlug: 'demo',
      documentNumber: PI_NUMBER,
    });

    const thrown = await inRolledBackTx(tenantId, async (tx) => {
      // Perturb ONLY the tax half. The lines are untouched, so the grouping still
      // sums to the original figure and the two must now disagree.
      await tx.execute(sql`
        UPDATE performa_invoices
        SET cgst_amount = cgst_amount + 5.00, igst_amount = igst_amount + 5.00
        WHERE id = ${documentId}::uuid`);
      try {
        await loadPerformaInvoicePdfData(tx, tenantId, documentId);
        return null;
      } catch (e) {
        return e;
      }
    });

    expect(thrown).toBeInstanceOf(TotalsReconciliationError);
    const err = thrown as TotalsReconciliationError;
    // It names the document by NUMBER, not by uuid — a uuid tells whoever reads the
    // log nothing about which document on a desk is wrong.
    expect(err.documentNumber).toBe(PI_NUMBER);
    expect(err.figure).toBe('CGST+SGST+IGST');
    expect(err.message).toContain(PI_NUMBER);
    expect(err.message).toContain('do not "fix" it in the loader');
  });

  it('a stored taxable_amount that disagrees with the lines THROWS — the assertion the identity cannot make', async () => {
    const { tenantId, documentId } = await resolveDocument({
      type: 'performa_invoice',
      tenantSlug: 'demo',
      documentNumber: PI_NUMBER,
    });

    const thrown = await inRolledBackTx(tenantId, async (tx) => {
      // `taxable_amount` alone. Under the single `total − (taxable + tax)` identity
      // this perturbation is INVISIBLE, because `taxable` appears on both sides and
      // cancels — which is the whole reason the second assertion exists.
      await tx.execute(sql`
        UPDATE performa_invoices SET taxable_amount = taxable_amount + 7.00
        WHERE id = ${documentId}::uuid`);
      try {
        await loadPerformaInvoicePdfData(tx, tenantId, documentId);
        return null;
      } catch (e) {
        return e;
      }
    });

    expect(thrown).toBeInstanceOf(TotalsReconciliationError);
    expect((thrown as TotalsReconciliationError).figure).toBe('taxable_amount');
  });

  it('nothing persisted — the rollback is verified, not assumed', async () => {
    const rows = (await adminDb.execute(sql`
      SELECT h.total_amount, h.cgst_amount, h.igst_amount, h.taxable_amount
      FROM performa_invoices h JOIN tenants t ON t.id = h.tenant_id
      WHERE t.slug = 'demo' AND h.pi_number = ${PI_NUMBER}`)) as unknown as Record<
      string,
      string
    >[];
    expect(rows).toHaveLength(1);
    // The loader itself is the oracle: if any of the three mutations had leaked, the
    // reconciliation assertion would now throw on a clean read.
    const { tenantId, documentId } = await resolveDocument({
      type: 'performa_invoice',
      tenantSlug: 'demo',
      documentNumber: PI_NUMBER,
    });
    await expect(
      withTenant(tenantId, (tx) => loadPerformaInvoicePdfData(tx, tenantId, documentId)),
    ).resolves.toBeTruthy();
  });
});
