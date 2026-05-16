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

import { adminDb, closeDbConnection, tenants } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
