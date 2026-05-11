import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { getProcurementDetail } from '@/lib/queries/procurements';
import { impersonationTenantId } from '@/lib/tenant/context';

import { SerialEntryForm } from './serial-entry-form';

export const dynamic = 'force-dynamic';

export default async function SerialEntryPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'dispatch') {
    redirect(`/inventory/procurements/${params.id}`);
  }

  const detail = await getProcurementDetail(tenantId, params.id);
  if (!detail) notFound();

  if (detail.header.status !== 'confirmed') {
    return (
      <div className="px-6 py-5">
        <p className="text-mute text-[13px]">
          Procurement must be confirmed before entering serials.{' '}
          <Link
            href={`/inventory/procurements/${params.id}`}
            className="text-accent hover:underline"
          >
            Go back
          </Link>
          .
        </p>
      </div>
    );
  }

  const serialLines = detail.lines.filter((l) => l.requiresSerial);

  return (
    <div className="px-6 py-5">
      <div className="mb-5">
        <Link
          href={`/inventory/procurements/${params.id}`}
          className="text-mute hover:text-ink text-[12px]"
        >
          ← {detail.header.procurementNumber}
        </Link>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.01em]">Serial entry</h1>
        <p className="text-mute mt-1 text-[13px]">
          Paste one serial per line. Duplicates within a batch or against existing inventory are
          rejected.
        </p>
      </div>

      <div className="space-y-4">
        {serialLines.length === 0 ? (
          <div className="text-mute text-[13px]">No serial-tracked lines on this procurement.</div>
        ) : (
          serialLines.map((line) => (
            <SerialEntryForm
              key={line.id}
              procurementId={params.id}
              productId={line.productId}
              productName={line.productName}
              productSku={line.productSku}
              expected={line.quantity}
              received={line.serialsReceived}
            />
          ))
        )}
      </div>
    </div>
  );
}
