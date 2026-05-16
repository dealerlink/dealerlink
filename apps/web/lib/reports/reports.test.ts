/**
 * Day 15 — report query functions against the seeded demo tenant.
 *
 * These are arithmetic-invariant tests, not magic-number snapshots: the
 * totals row must equal the sum of the data rows, and the outstanding report
 * must agree with itself across its two groupings. That pins the report logic
 * without coupling the suite to exact seed volumes.
 *
 * Uses `adminDb` only to resolve the demo tenant id; the report functions
 * themselves run through `withTenant` (RLS-scoped `db`).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adminDb, closeDbConnection, orders, tenants } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { and, between, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GST_SUPPLY_STATUSES, gstSummaryReport } from './gst-summary';
import { inventoryValuationReport } from './inventory-valuation';
import { fiscalYearOf, fiscalYearRange } from './period';
import { outstandingReport } from './outstanding';
import { salesSummaryReport } from './sales-summary';
import type { ReportResult } from './types';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

let tenantId: string;

const sumColumn = (r: ReportResult, key: string): number =>
  r.rows.reduce((s, row) => s + Number(row[key] ?? 0), 0);

beforeAll(async () => {
  const [demo] = await adminDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, 'demo'))
    .limit(1);
  if (!demo) throw new Error('demo tenant not seeded — run pnpm db:seed');
  tenantId = demo.id;
});

afterAll(async () => {
  await closeDbConnection();
});

describe('salesSummaryReport', () => {
  const range = fiscalYearRange(fiscalYearOf());

  it('totals row equals the sum of the data rows (month grouping)', async () => {
    const r = await salesSummaryReport(tenantId, { ...range, groupBy: 'month' });
    expect(r.totals).not.toBeNull();
    for (const key of ['count', 'subtotal', 'discount', 'tax', 'total']) {
      expect(Number(r.totals![key])).toBeCloseTo(sumColumn(r, key), 2);
    }
  });

  it('average deal size equals total / count', async () => {
    const r = await salesSummaryReport(tenantId, { ...range, groupBy: 'dealer' });
    for (const row of r.rows) {
      const count = Number(row.count);
      const expected = count > 0 ? Number(row.total) / count : 0;
      expect(Number(row.avg)).toBeCloseTo(expected, 2);
    }
    const tc = Number(r.totals!.count);
    expect(Number(r.totals!.avg)).toBeCloseTo(tc > 0 ? Number(r.totals!.total) / tc : 0, 2);
  });

  it('seeded demo tenant has non-zero sales this fiscal year', async () => {
    const r = await salesSummaryReport(tenantId, { ...range, groupBy: 'month' });
    expect(r.rows.length).toBeGreaterThan(0);
    expect(Number(r.totals!.total)).toBeGreaterThan(0);
  });

  it('product grouping rolls up line totals', async () => {
    const r = await salesSummaryReport(tenantId, { ...range, groupBy: 'product' });
    expect(r.columns[0]!.label).toBe('Product');
    expect(Number(r.totals!.subtotal)).toBeCloseTo(sumColumn(r, 'subtotal'), 2);
  });
});

describe('outstandingReport', () => {
  it('totals row equals the sum of the data rows (dealer grouping)', async () => {
    const r = await outstandingReport(tenantId, { groupBy: 'dealer' });
    expect(Number(r.totals!.total)).toBeCloseTo(sumColumn(r, 'total'), 2);
    // Per-dealer total is the sum of its four buckets.
    for (const row of r.rows) {
      const bucketSum = ['b0', 'b1', 'b2', 'b3'].reduce((s, k) => s + Number(row[k] ?? 0), 0);
      expect(bucketSum).toBeCloseTo(Number(row.total), 2);
    }
  });

  it('the two groupings agree on the grand total', async () => {
    const byDealer = await outstandingReport(tenantId, { groupBy: 'dealer' });
    const byBucket = await outstandingReport(tenantId, { groupBy: 'bucket' });
    expect(Number(byBucket.totals!.total)).toBeCloseTo(Number(byDealer.totals!.total), 2);
  });

  it('bucket grouping has exactly the four aging buckets', async () => {
    const r = await outstandingReport(tenantId, { groupBy: 'bucket' });
    expect(r.rows.map((row) => row.group)).toEqual([
      '0–30 days',
      '31–60 days',
      '61–90 days',
      '91+ days',
    ]);
  });
});

describe('inventoryValuationReport', () => {
  it('totals row sums qty and valuation; each row valuation = qty × cost', async () => {
    const r = await inventoryValuationReport(tenantId, {});
    expect(Number(r.totals!.qty)).toBe(sumColumn(r, 'qty'));
    expect(Number(r.totals!.valuation)).toBeCloseTo(sumColumn(r, 'valuation'), 2);
    for (const row of r.rows) {
      expect(Number(row.valuation)).toBeCloseTo(Number(row.qty) * Number(row.unitCost), 2);
    }
  });

  it('seeded demo tenant holds non-zero stock value', async () => {
    const r = await inventoryValuationReport(tenantId, {});
    expect(r.rows.length).toBeGreaterThan(0);
    expect(Number(r.totals!.valuation)).toBeGreaterThan(0);
  });
});

describe('gstSummaryReport', () => {
  const range = fiscalYearRange(fiscalYearOf());

  it('totals row equals the sum of the data rows', async () => {
    const r = await gstSummaryReport(tenantId, range);
    for (const key of ['orders', 'taxable', 'cgst', 'sgst', 'igst']) {
      expect(Number(r.totals![key])).toBeCloseTo(sumColumn(r, key), 2);
    }
  });

  it('parity: report totals match the stored order tax columns exactly', async () => {
    // CLAUDE.md §6 — the report READS stored columns; it must agree with a
    // direct SUM over the same orders. No @dealerlink/tax recomputation.
    const r = await gstSummaryReport(tenantId, range);
    const [direct] = await adminDb
      .select({
        cgst: sql<string>`coalesce(sum(${orders.cgstAmount}), 0)`,
        sgst: sql<string>`coalesce(sum(${orders.sgstAmount}), 0)`,
        igst: sql<string>`coalesce(sum(${orders.igstAmount}), 0)`,
        taxable: sql<string>`coalesce(sum(${orders.taxableAmount}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          inArray(orders.status, [...GST_SUPPLY_STATUSES]),
          between(orders.orderDate, range.from, range.to),
        ),
      );
    expect(Number(r.totals!.cgst)).toBeCloseTo(Number(direct!.cgst), 2);
    expect(Number(r.totals!.sgst)).toBeCloseTo(Number(direct!.sgst), 2);
    expect(Number(r.totals!.igst)).toBeCloseTo(Number(direct!.igst), 2);
    expect(Number(r.totals!.taxable)).toBeCloseTo(Number(direct!.taxable), 2);
  });

  it('classifies each row as intra- or inter-state', async () => {
    const r = await gstSummaryReport(tenantId, range);
    for (const row of r.rows) {
      expect(['Intra-state', 'Inter-state']).toContain(row.supplyType);
    }
  });
});
