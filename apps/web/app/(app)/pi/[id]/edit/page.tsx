import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { listDealers } from '@/lib/queries/dealers';
import { getPerformaInvoiceById } from '@/lib/queries/performa-invoices';
import { impersonationTenantId } from '@/lib/tenant/context';

import { PiEditForm } from './pi-edit-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function PiEditPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'sales') redirect('/pi');

  const pi = await getPerformaInvoiceById(tenantId, params.id);
  if (!pi) notFound();

  if (pi.status !== 'draft') {
    return (
      <div className="mx-auto max-w-[700px] px-8 py-10">
        <Link href={`/pi/${pi.id}`} className="text-mute text-[12.5px] hover:underline">
          ← Back to PI
        </Link>
        <div className="mt-4 rounded-[6px] border border-amber-200 bg-amber-50 p-5 text-[13px]">
          Only <span className="font-medium">draft</span> PIs can be edited.{' '}
          <span className="mono">{pi.piNumber}</span> is{' '}
          <span className="font-medium">{pi.status}</span>.
        </div>
      </div>
    );
  }

  const dealerList = await listDealers(tenantId, { status: 'active', limit: 200 });
  const dealers = dealerList.rows.map((d) => ({
    id: d.id,
    name: d.displayName,
    state: (d.state ?? '').toUpperCase(),
  }));

  return (
    <div className="mx-auto max-w-[760px] px-8 py-10">
      <Link
        href={`/pi/${pi.id}`}
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> {pi.piNumber}
      </Link>
      <div className="mb-6 mt-4">
        <div className="titlecaps mb-1">Edit Performa Invoice</div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">
          Edit <span className="mono">{pi.piNumber}</span>
        </h1>
        <p className="text-mute mt-1 text-[13px]">
          Line items are inherited from the source quotation (DEV.40). Adjust Ship-To, validity and
          document text here.
        </p>
      </div>

      <PiEditForm
        id={pi.id}
        tenantState={pi.tenantStateAtIssue}
        billToId={pi.billTo.id}
        shipToId={pi.shipTo.id}
        validUntil={pi.validUntil}
        terms={pi.termsAndConditions ?? ''}
        notes={pi.notes ?? ''}
        dealers={dealers}
        lines={pi.lines.map((l) => ({
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          unitOfMeasure: l.unitOfMeasure,
          unitPrice: l.unitPrice,
          gstRate: l.gstRate,
        }))}
      />
    </div>
  );
}
