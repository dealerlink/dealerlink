import { Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatINRExact } from '@/lib/format';
import { listProcurements } from '@/lib/queries/procurements';
import { impersonationTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'mu',
  confirmed: 'am',
  received: 'em',
};

export default async function ProcurementsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const { rows, total } = await listProcurements(tenantId);
  const canCreate = ctx.user.role === 'admin' || ctx.user.role === 'dispatch';

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">Inventory · Procurement</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Procurements</h1>
          <p className="text-mute mt-1 text-[13px]">
            <span className="mono">{total.toLocaleString('en-IN')}</span> total
          </p>
        </div>
        {canCreate && (
          <Button asChild variant="primary">
            <Link href="/inventory/procurements/new">
              <Plus size={13} /> New procurement
            </Link>
          </Button>
        )}
      </div>

      <div className="border-line overflow-hidden rounded-[6px] border bg-white">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-mute text-[13px]">
              No procurements yet. Create one to start tracking stock.
            </div>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 text-right font-medium">Items</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-line hover:bg-paper-2 h-[56px] cursor-pointer border-b last:border-b-0"
                >
                  <td className="mono px-4 text-[12.5px]">
                    <Link href={`/inventory/procurements/${r.id}`} className="hover:underline">
                      {r.procurementNumber}
                    </Link>
                  </td>
                  <td className="mono text-mute px-4 text-[12px]">{r.procurementDate}</td>
                  <td className="px-4">{r.supplierName}</td>
                  <td className="mono px-4 text-right">{r.itemsCount}</td>
                  <td className="mono px-4 text-right">
                    {formatINRExact(Number(r.totalAmount ?? 0))}
                  </td>
                  <td className="px-4">
                    <StatusPill tone={STATUS_TONE[r.status] ?? 'mu'}>{r.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
