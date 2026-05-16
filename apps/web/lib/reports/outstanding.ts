/**
 * REPORT 2 — Outstanding Receivables (Aging).
 *
 * Unpaid / partially-paid, non-cancelled orders, aged into 30-day buckets.
 * Per order: outstanding = stored `total_amount` − Σ verified/cleared
 * allocations. The due date is `order_date + credit_period`, where the
 * credit period is the dealer's, falling back to the tenant default.
 *
 * Money is read, never recomputed (CLAUDE.md §6).
 */
import {
  dealers,
  orders,
  paymentAllocations,
  payments,
  tenantSettings,
  withTenant,
} from '@dealerlink/db';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import type { ReportColumn, ReportResult, ReportRow } from './types';

export type OutstandingGroupBy = 'dealer' | 'bucket';

export interface OutstandingFilters {
  groupBy: OutstandingGroupBy;
}

interface BucketKey {
  index: 0 | 1 | 2 | 3;
}

const BUCKET_LABELS = ['0–30 days', '31–60 days', '61–90 days', '91+ days'] as const;

function bucketOf(daysOverdue: number): BucketKey['index'] {
  if (daysOverdue <= 30) return 0;
  if (daysOverdue <= 60) return 1;
  if (daysOverdue <= 90) return 2;
  return 3;
}

interface OrderAging {
  dealerId: string;
  dealerName: string;
  orderDate: string;
  outstanding: number;
  daysOverdue: number;
  bucket: BucketKey['index'];
}

async function loadAging(tenantId: string): Promise<OrderAging[]> {
  return withTenant(tenantId, async (tx) => {
    const [settings] = await tx
      .select({ defaultCreditPeriod: tenantSettings.defaultCreditPeriod })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);
    const tenantDefault = settings?.defaultCreditPeriod ?? 30;

    const rows = await tx
      .select({
        id: orders.id,
        orderDate: orders.orderDate,
        totalAmount: orders.totalAmount,
        dealerId: orders.billToDealerId,
        dealerName: dealers.displayName,
        creditPeriodDays: dealers.creditPeriodDays,
      })
      .from(orders)
      .leftJoin(dealers, eq(dealers.id, orders.billToDealerId))
      .where(
        and(
          ne(orders.status, 'cancelled'),
          inArray(orders.paymentStatus, ['unpaid', 'partially_paid']),
        ),
      );

    // Verified/cleared allocations per order — one grouped query.
    const orderIds = rows.map((r) => r.id);
    const allocMap = new Map<string, number>();
    if (orderIds.length > 0) {
      const allocs = await tx
        .select({
          orderId: paymentAllocations.orderId,
          total: sql<string>`SUM(${paymentAllocations.amount})`,
        })
        .from(paymentAllocations)
        .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
        .where(
          and(
            inArray(paymentAllocations.orderId, orderIds),
            inArray(payments.status, ['verified', 'cleared']),
          ),
        )
        .groupBy(paymentAllocations.orderId);
      for (const a of allocs) if (a.orderId) allocMap.set(a.orderId, Number(a.total));
    }

    const now = Date.now();
    const aging: OrderAging[] = [];
    for (const r of rows) {
      const outstanding = Math.max(0, Number(r.totalAmount) - (allocMap.get(r.id) ?? 0));
      if (outstanding <= 0) continue;
      const creditPeriod = r.creditPeriodDays ?? tenantDefault;
      const due = new Date(`${r.orderDate}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + creditPeriod);
      const daysOverdue = Math.floor((now - due.getTime()) / 86_400_000);
      aging.push({
        dealerId: r.dealerId,
        dealerName: r.dealerName ?? '—',
        orderDate: r.orderDate,
        outstanding,
        daysOverdue,
        bucket: bucketOf(daysOverdue),
      });
    }
    return aging;
  });
}

export async function outstandingReport(
  tenantId: string,
  filters: OutstandingFilters,
): Promise<ReportResult> {
  const aging = await loadAging(tenantId);
  const generatedAt = new Date().toISOString();

  let columns: ReportColumn[];
  let dataRows: ReportRow[];
  let totals: ReportRow;

  if (filters.groupBy === 'bucket') {
    columns = [
      { key: 'group', label: 'Aging bucket', type: 'text' },
      { key: 'count', label: 'Orders', type: 'integer' },
      { key: 'total', label: 'Total outstanding', type: 'money' },
    ];
    dataRows = BUCKET_LABELS.map((label, i) => {
      const inBucket = aging.filter((a) => a.bucket === i);
      return {
        group: label,
        count: inBucket.length,
        total: inBucket.reduce((s, a) => s + a.outstanding, 0),
      };
    });
    totals = {
      group: 'Total',
      count: aging.length,
      total: aging.reduce((s, a) => s + a.outstanding, 0),
    };
  } else {
    columns = [
      { key: 'group', label: 'Dealer', type: 'text' },
      { key: 'b0', label: '0–30 days', type: 'money' },
      { key: 'b1', label: '31–60 days', type: 'money' },
      { key: 'b2', label: '61–90 days', type: 'money' },
      { key: 'b3', label: '91+ days', type: 'money' },
      { key: 'total', label: 'Total outstanding', type: 'money' },
      { key: 'oldest', label: 'Oldest invoice', type: 'date' },
      { key: 'daysOverdue', label: 'Days overdue', type: 'integer' },
    ];
    const byDealer = new Map<string, OrderAging[]>();
    for (const a of aging) {
      const list = byDealer.get(a.dealerId) ?? [];
      list.push(a);
      byDealer.set(a.dealerId, list);
    }
    dataRows = [...byDealer.values()]
      .map((list) => {
        const bucketSum = [0, 0, 0, 0];
        for (const a of list) bucketSum[a.bucket]! += a.outstanding;
        const total = list.reduce((s, a) => s + a.outstanding, 0);
        const oldest = list.reduce(
          (m, a) => (a.orderDate < m ? a.orderDate : m),
          list[0]!.orderDate,
        );
        const maxOverdue = Math.max(...list.map((a) => a.daysOverdue));
        return {
          group: list[0]!.dealerName,
          b0: bucketSum[0]!,
          b1: bucketSum[1]!,
          b2: bucketSum[2]!,
          b3: bucketSum[3]!,
          total,
          oldest,
          daysOverdue: Math.max(0, maxOverdue),
        } satisfies ReportRow;
      })
      .sort((a, b) => Number(b.total) - Number(a.total));
    const sum = (k: keyof ReportRow) => dataRows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    totals = {
      group: 'Total',
      b0: sum('b0'),
      b1: sum('b1'),
      b2: sum('b2'),
      b3: sum('b3'),
      total: sum('total'),
      oldest: null,
      daysOverdue: null,
    };
  }

  return {
    columns,
    rows: dataRows,
    totals,
    metadata: {
      reportKey: 'outstanding',
      reportName: 'Outstanding Receivables',
      generatedAt,
      filterLabel: `As of ${generatedAt.slice(0, 10)} · grouped by ${filters.groupBy}`,
      rowCount: dataRows.length,
    },
  };
}
