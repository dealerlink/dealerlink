import { ArrowRight, BarChart3, Boxes, ReceiptIndianRupee, Wallet } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { REPORT_DESCRIPTIONS, REPORT_TITLES, reportsForRole, type ReportKey } from '@/lib/reports';

export const dynamic = 'force-dynamic';

const META: Record<ReportKey, { href: string; icon: typeof BarChart3 }> = {
  'sales-summary': { href: '/reports/sales-summary', icon: BarChart3 },
  outstanding: { href: '/reports/outstanding', icon: Wallet },
  'inventory-valuation': { href: '/reports/inventory-valuation', icon: Boxes },
  'gst-summary': { href: '/reports/gst-summary', icon: ReceiptIndianRupee },
};

export default async function ReportsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const available = reportsForRole(ctx.user.role);

  return (
    <div className="px-6 py-5">
      <div className="titlecaps mb-1">Reports</div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Reports</h1>
      <p className="text-mute mt-1 text-[13px]">
        Sales, receivables, inventory value and GST — read straight from stored documents.
      </p>

      {available.length === 0 ? (
        <div className="border-line mt-6 rounded-[6px] border bg-white px-6 py-16 text-center">
          <div className="text-ink text-[14px] font-medium">No reports for your role</div>
          <div className="text-mute mt-1 text-[12.5px]">
            Reports are available to admin, accounts, sales and dispatch users.
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4">
          {available.map((key) => {
            const { href, icon: Icon } = META[key];
            return (
              <Link
                key={key}
                href={href}
                className="border-line hover:border-ink group rounded-[6px] border bg-white p-5 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="border-line bg-tile flex h-9 w-9 items-center justify-center rounded-[6px] border">
                    <Icon size={17} className="text-ink" />
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-mute group-hover:text-ink transition-colors"
                  />
                </div>
                <div className="text-ink mt-3 text-[15px] font-semibold">{REPORT_TITLES[key]}</div>
                <p className="text-mute mt-1 text-[12.5px] leading-relaxed">
                  {REPORT_DESCRIPTIONS[key]}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
