/**
 * Dashboard report widgets (Day 15 A3.1). Three live read-outs that each link
 * into the full report, plus a strip of links to every report the role can
 * open. Role-scoped: a widget is rendered only when the role may see the
 * report it summarises.
 */
import { withTenant } from '@dealerlink/db';
import { ArrowRight } from 'lucide-react';
import { sql } from 'drizzle-orm';
import Link from 'next/link';

import { formatINR, formatINRExact } from '@/lib/format';
import { REPORT_TITLES, gstSummaryReport, reportsForRole, salesSummaryReport } from '@/lib/reports';

function currentMonthRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
    label: first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
  };
}

async function slowMovingCount(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const res = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n
      FROM inventory_items
      WHERE status = 'in_stock'
        AND procurement_date IS NOT NULL
        AND procurement_date < (current_date - INTERVAL '60 days')
    `);
    const rows = res as unknown as { n: number }[];
    return rows[0]?.n ?? 0;
  });
}

export async function ReportWidgets({ tenantId, role }: { tenantId: string; role: string }) {
  const available = reportsForRole(role);
  if (available.length === 0) return null;

  const month = currentMonthRange();

  const [salesByDealer, gst, slowMoving] = await Promise.all([
    available.includes('sales-summary')
      ? salesSummaryReport(tenantId, { ...month, groupBy: 'dealer' })
      : null,
    available.includes('gst-summary') ? gstSummaryReport(tenantId, month) : null,
    available.includes('inventory-valuation') ? slowMovingCount(tenantId) : null,
  ]);

  const topDealer = salesByDealer?.rows[0] ?? null;
  const taxPayable = gst
    ? Number(gst.totals?.cgst ?? 0) + Number(gst.totals?.sgst ?? 0) + Number(gst.totals?.igst ?? 0)
    : null;

  return (
    <section className="mt-6">
      <div className="titlecaps mb-3 flex items-center justify-between">
        <span>Reports</span>
        <Link href="/reports" className="text-accent text-[11px] hover:underline">
          All reports →
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {topDealer && (
          <WidgetCard
            href="/reports/sales-summary?groupBy=dealer"
            label={`Top dealer · ${month.label}`}
          >
            <div className="text-ink truncate text-[18px] font-semibold">{topDealer.group}</div>
            <div className="text-mute mono mt-1 text-[12.5px]">
              {formatINRExact(Number(topDealer.total))} across{' '}
              {Number(topDealer.count).toLocaleString('en-IN')} document(s)
            </div>
          </WidgetCard>
        )}

        {taxPayable !== null && (
          <WidgetCard href="/reports/gst-summary" label={`Tax payable estimate · ${month.label}`}>
            <div className="mono text-[24px] font-semibold tracking-tight text-indigo-700">
              {formatINR(taxPayable)}
            </div>
            <div className="text-mute mt-1 text-[12.5px]">
              CGST + SGST + IGST on supplied orders this month.
            </div>
          </WidgetCard>
        )}

        {slowMoving !== null && (
          <WidgetCard href="/reports/inventory-valuation" label="Slow-moving inventory">
            <div className="mono text-[24px] font-semibold tracking-tight text-amber-600">
              {slowMoving.toLocaleString('en-IN')}
            </div>
            <div className="text-mute mt-1 text-[12.5px]">
              In-stock units procured more than 60 days ago.
            </div>
          </WidgetCard>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {available.map((key) => (
          <Link
            key={key}
            href={`/reports/${key}`}
            className="border-line text-ink hover:border-ink rounded-[5px] border bg-white px-3 py-1.5 text-[12px] transition-colors"
          >
            {REPORT_TITLES[key]}
          </Link>
        ))}
      </div>
    </section>
  );
}

function WidgetCard({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="border-line hover:border-ink group rounded-[6px] border bg-white p-5 transition-colors"
    >
      <div className="titlecaps mb-2 flex items-center justify-between">
        <span>{label}</span>
        <ArrowRight size={13} className="text-mute group-hover:text-ink transition-colors" />
      </div>
      {children}
    </Link>
  );
}
