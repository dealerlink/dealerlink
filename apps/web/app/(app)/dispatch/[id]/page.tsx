import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { getDispatchDetail } from '@/lib/queries/dispatch';
import { impersonationTenantId } from '@/lib/tenant/context';

import { dispatchStatusLabel, dispatchStatusTone } from '../dispatch-status';
import { DispatchActions } from './dispatch-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

function fmtDate(d: string | null): string {
  return d ? formatDate(new Date(d + 'T00:00:00Z')) : '—';
}

export default async function DispatchDetailPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role === 'sales') redirect('/dashboard');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const dispatch = await getDispatchDetail(tenantId, params.id);
  if (!dispatch) notFound();

  const role = ctx.user.role;
  const isAdmin = role === 'admin';
  const canManage = role === 'admin' || role === 'dispatch';
  const canDownload = role === 'admin' || role === 'dispatch' || role === 'accounts';
  const totalSerials = dispatch.lines.reduce((n, l) => n + l.serials.length, 0);

  return (
    <div className="mx-auto max-w-[1000px] px-8 py-10">
      <Link
        href="/dispatch"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Dispatch
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <div className="titlecaps mb-1">Dispatch note</div>
          <h1 className="flex items-center gap-3 text-[26px] font-semibold tracking-[-0.02em]">
            <span className="mono">{dispatch.dispatchNumber}</span>
            <StatusPill tone={dispatchStatusTone(dispatch.status)}>
              {dispatchStatusLabel(dispatch.status)}
            </StatusPill>
          </h1>
          <p className="text-mute mt-1 text-[13px]">
            {fmtDate(dispatch.dispatchDate)} · against{' '}
            <Link href={`/orders/${dispatch.orderId}`} className="text-ink hover:underline">
              {dispatch.orderNumber}
            </Link>{' '}
            dated {fmtDate(dispatch.orderDate)}
          </p>
        </div>
        <DispatchActions
          id={dispatch.id}
          dispatchNumber={dispatch.dispatchNumber}
          status={dispatch.status}
          isAdmin={isAdmin}
          canManage={canManage}
          canDownload={canDownload}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {/* Parties */}
          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps text-mute mb-3">Parties</div>
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">
                  Ship to (consignee)
                </div>
                <div className="text-ink font-medium">{dispatch.shipTo.name}</div>
                {dispatch.shipTo.legalName !== dispatch.shipTo.name && (
                  <div className="text-mute text-[12.5px]">{dispatch.shipTo.legalName}</div>
                )}
                <div className="text-mute mono text-[12px]">
                  {[dispatch.shipTo.city, dispatch.shipTo.state].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
              <div>
                <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">
                  Invoice to (bill-to)
                </div>
                <div className="text-ink font-medium">{dispatch.billTo.name}</div>
                {dispatch.billTo.legalName !== dispatch.billTo.name && (
                  <div className="text-mute text-[12.5px]">{dispatch.billTo.legalName}</div>
                )}
                <div className="text-mute mono text-[12px]">
                  {[dispatch.billTo.city, dispatch.billTo.state].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
            </div>
          </section>

          {/* Line items + serials */}
          <section className="border-line overflow-hidden rounded-[6px] border bg-white">
            <div className="titlecaps text-mute border-line border-b px-5 py-3">
              Line items · {totalSerials} serial(s)
            </div>
            {dispatch.lines.map((l) => (
              <div key={l.id} className="border-line border-b px-5 py-4 last:border-b-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-ink font-medium">{l.productName}</div>
                    <div className="text-mute mono text-[11px]">{l.productSku}</div>
                  </div>
                  <div className="mono text-ink text-[13px] tabular-nums">Qty {l.quantity}</div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {l.serials.map((s) => (
                    <span
                      key={s.id}
                      className="border-line bg-paper-2 mono rounded-[4px] border px-2 py-0.5 text-[11.5px]"
                    >
                      {s.serialNumber ?? '(no serial)'}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* Acknowledgment / return */}
          {dispatch.status === 'delivered' && (
            <section className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-5 py-3 text-[12.5px] text-emerald-800">
              Delivered{' '}
              {dispatch.deliveredAt
                ? `on ${dispatch.deliveredAt.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}`
                : ''}
              {dispatch.deliveredAcknowledgedBy && (
                <>
                  {' '}
                  · received by <strong>{dispatch.deliveredAcknowledgedBy}</strong>
                </>
              )}
            </section>
          )}
          {dispatch.status === 'returned' && (
            <section className="rounded-[6px] border border-rose-200 bg-rose-50 px-5 py-3 text-[12.5px] text-rose-700">
              <span className="font-medium">Returned:</span> {dispatch.returnedReason ?? '—'}
            </section>
          )}
        </div>

        {/* Logistics sidebar */}
        <aside className="border-line self-start rounded-[6px] border bg-white p-5">
          <div className="titlecaps text-mute mb-3">Logistics</div>
          <dl className="space-y-2.5 text-[12.5px]">
            <KV label="Vehicle" value={dispatch.vehicleNumber} mono />
            <KV label="Transporter" value={dispatch.transporterName} />
            <KV label="Docket no." value={dispatch.transporterDocketNumber} mono />
            <KV label="Driver" value={dispatch.driverName} />
            <KV label="Driver phone" value={dispatch.driverPhone} mono />
            <KV label="E-way bill" value={dispatch.ewayBillNumber} mono />
            <KV label="E-way bill date" value={fmtDate(dispatch.ewayBillDate)} mono />
            <KV label="Expected delivery" value={fmtDate(dispatch.expectedDeliveryDate)} mono />
            <KV label="Created by" value={dispatch.createdByName} />
          </dl>
          {dispatch.notes && (
            <div className="border-line mt-3 border-t pt-3 text-[12px]">
              <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">Notes</div>
              <p className="text-ink">{dispatch.notes}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-mute shrink-0">{label}</dt>
      <dd className={`text-ink text-right ${mono ? 'mono text-[12px]' : ''}`}>{value || '—'}</dd>
    </div>
  );
}
