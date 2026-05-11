import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatINRExact } from '@/lib/format';
import { getProcurementDetail } from '@/lib/queries/procurements';
import { impersonationTenantId } from '@/lib/tenant/context';

import { ConfirmProcurementButton } from './confirm-procurement-button';
import { FinalizeProcurementButton } from './finalize-procurement-button';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, StatusTone> = {
  draft: 'mu',
  confirmed: 'am',
  received: 'em',
};

export default async function ProcurementDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const detail = await getProcurementDetail(tenantId, params.id);
  if (!detail) notFound();
  const { header, lines } = detail;
  const canMutate = ctx.user.role === 'admin' || ctx.user.role === 'dispatch';

  return (
    <div className="px-6 py-5">
      <div className="mb-5">
        <Link href="/inventory/procurements" className="text-mute hover:text-ink text-[12px]">
          ← Procurements
        </Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <div className="titlecaps mb-1">Procurement</div>
            <h1 className="mono text-[24px] font-semibold tracking-[-0.01em]">
              {header.procurementNumber}
            </h1>
            <p className="text-mute mt-1 text-[13px]">
              {header.supplierName} · <span className="mono">{header.procurementDate}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={STATUS_TONE[header.status] ?? 'mu'}>{header.status}</StatusPill>
            {canMutate && header.status === 'draft' && <ConfirmProcurementButton id={header.id} />}
            {canMutate && header.status === 'confirmed' && (
              <>
                <Button asChild variant="default">
                  <Link href={`/inventory/procurements/${header.id}/serials`}>Enter serials →</Link>
                </Button>
                <FinalizeProcurementButton id={header.id} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="border-line overflow-hidden rounded-[6px] border bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">HSN</th>
              <th className="px-4 py-3 text-right font-medium">Qty</th>
              <th className="px-4 py-3 text-right font-medium">Unit price</th>
              <th className="px-4 py-3 text-right font-medium">Line total</th>
              <th className="px-4 py-3 text-right font-medium">Serials</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-line h-[52px] border-b last:border-b-0">
                <td className="px-4">
                  <div className="text-ink font-medium">{l.productName}</div>
                  <div className="text-mute mono text-[11.5px]">{l.productSku}</div>
                </td>
                <td className="text-mute mono px-4 text-[12px]">{l.productHsn}</td>
                <td className="mono px-4 text-right">{l.quantity}</td>
                <td className="mono px-4 text-right">{formatINRExact(Number(l.unitPrice))}</td>
                <td className="mono px-4 text-right">{formatINRExact(Number(l.lineTotal))}</td>
                <td className="mono px-4 text-right">
                  {l.requiresSerial
                    ? `${l.serialsReceived} / ${l.quantity}`
                    : `n/a (${l.quantity})`}
                </td>
              </tr>
            ))}
            <tr className="bg-tile border-line border-t">
              <td colSpan={4} className="text-mute px-4 py-3 text-right text-[12px]">
                Total
              </td>
              <td className="mono px-4 py-3 text-right font-semibold">
                {formatINRExact(Number(header.totalAmount ?? 0))}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {header.notes && (
        <div className="border-line mt-4 rounded-[6px] border bg-white p-4">
          <div className="titlecaps mb-1">Notes</div>
          <p className="text-ink whitespace-pre-line text-[13px]">{header.notes}</p>
        </div>
      )}
    </div>
  );
}
