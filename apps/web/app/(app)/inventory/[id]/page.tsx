import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatINRExact } from '@/lib/format';
import { getInventoryItemDetail } from '@/lib/queries/procurements';
import { impersonationTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, StatusTone> = {
  in_stock: 'em',
  reserved: 'am',
  dispatched: 'in',
  delivered: 'mu',
  returned: 'am',
  damaged: 'ro',
  lost: 'ro',
};

export default async function InventoryItemDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const row = await getInventoryItemDetail(tenantId, params.id);
  if (!row) notFound();

  const { item, product, procurement } = row;
  const status = item.status;

  return (
    <div className="px-6 py-5">
      <div className="mb-5">
        <Link href="/inventory" className="text-mute hover:text-ink text-[12px]">
          ← Inventory
        </Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <div className="titlecaps mb-1">Serial</div>
            <h1 className="mono text-[24px] font-semibold tracking-[-0.01em]">
              {item.serialNumber ?? '—'}
            </h1>
            <p className="text-mute mt-1 text-[13px]">
              {product.name} · <span className="mono">{product.sku}</span>
            </p>
          </div>
          <StatusPill tone={STATUS_TONE[status] ?? 'mu'}>{status.replace('_', ' ')}</StatusPill>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="border-line rounded-[6px] border bg-white p-4">
          <div className="titlecaps mb-3">Item</div>
          <dl className="space-y-2 text-[13px]">
            <Row label="Product">
              <Link href={`/catalog/${product.id}`} className="hover:underline">
                {product.name}
              </Link>
            </Row>
            <Row label="SKU">
              <span className="mono">{product.sku}</span>
            </Row>
            <Row label="Manufacturer">{product.manufacturer ?? '—'}</Row>
            <Row label="HSN">
              <span className="mono">{product.hsnCode}</span>
            </Row>
            <Row label="Warehouse">
              <span className="mono">{item.warehouseCode ?? '—'}</span>
            </Row>
            <Row label="Bin">
              <span className="mono">{item.bin ?? '—'}</span>
            </Row>
            <Row label="Purchase price">
              {item.purchasePrice ? (
                <span className="mono">{formatINRExact(Number(item.purchasePrice))}</span>
              ) : (
                '—'
              )}
            </Row>
          </dl>
        </section>

        <section className="border-line rounded-[6px] border bg-white p-4">
          <div className="titlecaps mb-3">Lifecycle</div>
          <ol className="space-y-3 text-[13px]">
            {procurement ? (
              <Step
                label="Procured"
                date={item.procurementDate}
                detail={
                  <Link
                    href={`/inventory/procurements/${procurement.id}`}
                    className="mono hover:underline"
                  >
                    {procurement.procurementNumber}
                  </Link>
                }
              />
            ) : null}
            {item.reservedAt ? (
              <Step
                label="Reserved"
                date={item.reservedAt.toISOString().slice(0, 10)}
                detail={item.reservedForDealerId ? 'For dealer' : 'Held'}
              />
            ) : null}
            {item.dispatchedAt ? (
              <Step
                label="Dispatched"
                date={item.dispatchedAt.toISOString().slice(0, 10)}
                detail={item.dispatchId ? `Dispatch ${item.dispatchId.slice(0, 8)}…` : ''}
              />
            ) : null}
            {item.deliveredAt ? (
              <Step
                label="Delivered"
                date={item.deliveredAt.toISOString().slice(0, 10)}
                detail={item.deliveredTo ?? ''}
              />
            ) : null}
            {!item.reservedAt && !item.dispatchedAt && !item.deliveredAt ? (
              <li className="text-mute text-[12.5px]">No lifecycle events yet.</li>
            ) : null}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-mute">{label}</dt>
      <dd className="text-ink text-right">{children}</dd>
    </div>
  );
}

function Step({
  label,
  date,
  detail,
}: {
  label: string;
  date: string | null;
  detail: React.ReactNode;
}) {
  return (
    <li>
      <div className="flex items-baseline gap-2">
        <div className="bg-accent mt-[5px] h-[6px] w-[6px] flex-shrink-0 rounded-full" />
        <div className="flex-1">
          <div className="text-ink font-medium">{label}</div>
          <div className="text-mute mono text-[11.5px]">
            {date ?? '—'} {detail ? ` · ${typeof detail === 'string' ? detail : ''}` : ''}
            {typeof detail !== 'string' ? detail : null}
          </div>
        </div>
      </div>
    </li>
  );
}
