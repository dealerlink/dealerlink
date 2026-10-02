import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/app/_components';
import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { listInvoices } from '@/lib/queries/invoices';
import { impersonationTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tax Invoices' };

/**
 * Tax invoices.
 *
 * There is NO "new invoice" button here on purpose. An invoice is issued from a
 * CONFIRMED ORDER, so the action lives on the order — offering it here would invite
 * someone to create an invoice with no order behind it, which Phase 1 does not
 * allow and GST would not support.
 *
 * There is also no edit and no delete. An issued invoice is immutable: a wrong
 * amount is corrected by a credit note, and an invoice that should never have
 * existed is cancelled with a reason.
 */
export default async function InvoiceListPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const rows = await listInvoices(tenantId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[20px] font-semibold tracking-[-0.01em]">Tax Invoices</h1>
          <p className="text-mute mt-0.5 text-[12.5px]">
            Issued from confirmed orders. An issued invoice cannot be edited — use a credit note to
            correct an amount.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No tax invoices yet"
          description="A tax invoice is issued from a confirmed order. Open a confirmed order to issue one."
        />
      ) : (
        <div className="border-line overflow-hidden rounded-[6px] border bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-paper text-mute border-line border-b">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Number</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Bill To</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Round Off</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-line border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/invoices/${r.id}`} className="mono text-accent hover:underline">
                      {r.invoiceNumber}
                    </Link>
                  </td>
                  <td className="text-mute px-3 py-2">{formatDate(new Date(r.invoiceDate))}</td>
                  <td className="text-ink px-3 py-2">{r.billToName}</td>
                  <td className="px-3 py-2">
                    <StatusPill tone={r.status === 'cancelled' ? 'ro' : 'em'}>
                      {r.status}
                    </StatusPill>
                  </td>
                  {/* SIGNED, so a downward rounding shows as a negative. */}
                  <td className="mono text-mute px-3 py-2 text-right">
                    {r.roundOff === 0 ? '—' : formatINRExact(r.roundOff)}
                  </td>
                  <td className="mono text-ink px-3 py-2 text-right font-medium">
                    {formatINRExact(r.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
