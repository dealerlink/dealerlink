import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { listDealers } from '@/lib/queries/dealers';
import { getQuotationById } from '@/lib/queries/quotations';
import { impersonationTenantId } from '@/lib/tenant/context';

import { ConvertToPiForm } from './convert-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

/** today + n days, as an ISO date string. */
function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function ConvertToPiPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'sales') redirect('/quotations');

  const q = await getQuotationById(tenantId, params.id);
  if (!q) notFound();

  if (q.status !== 'accepted') {
    return (
      <div className="mx-auto max-w-[700px] px-8 py-10">
        <Link href={`/quotations/${q.id}`} className="text-mute text-[12.5px] hover:underline">
          ← Back to quotation
        </Link>
        <div className="mt-4 rounded-[6px] border border-amber-200 bg-amber-50 p-5 text-[13px]">
          Only <span className="font-medium">accepted</span> quotations can be converted to a
          performa invoice. <span className="mono">{q.quoteNumber}</span> is currently{' '}
          <span className="font-medium">{q.status}</span>.
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
        href={`/quotations/${q.id}`}
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> {q.quoteNumber}
      </Link>
      <div className="mb-6 mt-4">
        <div className="titlecaps mb-1">Convert to Performa Invoice</div>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">
          New PI from <span className="mono">{q.quoteNumber}</span>
        </h1>
        <p className="text-mute mt-1 text-[13px]">
          {q.lines.length} line item{q.lines.length === 1 ? '' : 's'} · subtotal carried from the
          quotation. Tax is recomputed for the chosen Ship-To.
        </p>
      </div>

      <ConvertToPiForm
        quotationId={q.id}
        quoteNumber={q.quoteNumber}
        billTo={{
          id: q.dealer.id,
          name: q.dealer.name,
          state: (q.dealer.state ?? '').toUpperCase(),
        }}
        tenantState={q.tenantStateAtIssue}
        quotationPlaceOfSupply={q.placeOfSupply}
        defaultValidUntil={addDays(15)}
        defaultTerms={q.termsAndConditions ?? ''}
        dealers={dealers}
      />
    </div>
  );
}
