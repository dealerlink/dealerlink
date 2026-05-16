import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import {
  getAvailableSerialsForOrder,
  getDispatchableLines,
  getDispatchableOrders,
} from '@/lib/queries/dispatch';
import { getOrderById } from '@/lib/queries/orders';
import { impersonationTenantId } from '@/lib/tenant/context';

import { CreateDispatchForm } from './create-dispatch-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { order?: string };
}

export default async function NewDispatchPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  // Creating a dispatch is admin + dispatch only.
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'dispatch') redirect('/dispatch');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const orderId = searchParams.order;

  // Step 1 — no order chosen: list dispatchable orders.
  if (!orderId) {
    const orders = await getDispatchableOrders(tenantId);
    return (
      <div className="mx-auto max-w-[820px] px-8 py-10">
        <Link
          href="/dispatch"
          className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
        >
          <ArrowLeft size={12} /> Dispatch
        </Link>
        <div className="mb-6 mt-4">
          <div className="titlecaps mb-1">Dispatch</div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">New dispatch</h1>
          <p className="text-mute mt-1 text-[13px]">
            Pick a confirmed order with inventory still to ship.
          </p>
        </div>
        <div className="border-line overflow-hidden rounded-[6px] border bg-white">
          {orders.length === 0 ? (
            <div className="text-mute px-6 py-16 text-center text-[13px]">
              No orders are ready to dispatch. Confirm an order to reserve inventory first.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                  <th className="px-4 py-3 font-medium">Order #</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Ship to</th>
                  <th className="px-4 py-3 text-right font-medium">Units to dispatch</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-line border-b last:border-b-0">
                    <td className="mono px-4 py-3 text-[12.5px]">{o.orderNumber}</td>
                    <td className="text-mute mono px-4 py-3 text-[12px]">
                      {formatDate(new Date(o.orderDate + 'T00:00:00Z'))}
                    </td>
                    <td className="text-ink px-4 py-3">{o.shipToName}</td>
                    <td className="mono text-ink px-4 py-3 text-right tabular-nums">
                      {o.remaining}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dispatch/new?order=${o.id}`}
                        className="bg-ink rounded-[6px] px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
                      >
                        Dispatch
                      </Link>
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

  // Step 2 — order chosen: load lines + serials, render the form.
  const order = await getOrderById(tenantId, orderId);
  if (!order) redirect('/dispatch/new');
  if (order.status !== 'confirmed' && order.status !== 'partially_dispatched') {
    return (
      <div className="mx-auto max-w-[820px] px-8 py-10">
        <Link
          href="/dispatch/new"
          className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
        >
          <ArrowLeft size={12} /> New dispatch
        </Link>
        <div className="mt-6 rounded-[6px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          Order {order.orderNumber} is <strong>{order.status.replace(/_/g, ' ')}</strong> — only
          confirmed or partially-dispatched orders can be dispatched.
        </div>
      </div>
    );
  }

  const [lines, serials] = await Promise.all([
    getDispatchableLines(tenantId, orderId),
    getAvailableSerialsForOrder(tenantId, orderId),
  ]);

  return (
    <div className="mx-auto max-w-[920px] px-8 py-10">
      <Link
        href="/dispatch/new"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Choose another order
      </Link>
      <div className="mb-6 mt-4">
        <div className="titlecaps mb-1">Dispatch</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Dispatch for <span className="mono">{order.orderNumber}</span>
        </h1>
        <p className="text-mute mt-1 text-[13px]">
          Ship to <strong>{order.shipTo.name}</strong>. Pick the serials leaving the warehouse for
          each line.
        </p>
      </div>
      <CreateDispatchForm
        orderId={orderId}
        orderNumber={order.orderNumber}
        lines={lines}
        serials={serials}
      />
    </div>
  );
}
