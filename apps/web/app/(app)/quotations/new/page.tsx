import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { impersonationTenantId } from '@/lib/tenant/context';

import type { BuilderFormState } from '../_components/builder-types';
import { loadBuilderData } from '../_components/load-builder-data';
import { QuotationBuilderForm } from '../_components/quotation-builder-form';

export const dynamic = 'force-dynamic';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface PageProps {
  searchParams?: { dealId?: string; dealerId?: string };
}

export default async function NewQuotationPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'sales') redirect('/quotations');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const data = await loadBuilderData(tenantId);

  const initialDealId = searchParams?.dealId ?? '';
  const inferredDealerId =
    searchParams?.dealerId ?? data.deals.find((d) => d.id === initialDealId)?.dealerId ?? '';

  const initial: BuilderFormState = {
    dealerId: inferredDealerId,
    dealId: initialDealId,
    preparedBy: ctx.user.id,
    quoteDate: todayIso(),
    validUntil: plusDaysIso(data.context.defaultQuoteValidity),
    placeOfSupplyOverride: '',
    termsAndConditions: data.context.defaultTerms ?? '',
    notes: '',
    lines: [],
    discount: { type: 'none', value: '' },
  };

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10">
      <Link
        href="/quotations"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Quotations
      </Link>
      <div className="mb-6 mt-4">
        <div className="titlecaps mb-1">Quotation Builder</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">New quotation</h1>
        <p className="text-mute mt-1 text-[13px]">
          Tax is computed live from the dealer&apos;s state. Save as draft to edit later, or save
          and send to flip the linked deal forward.
        </p>
      </div>
      <QuotationBuilderForm
        mode="create"
        initialState={initial}
        context={data.context}
        dealers={data.dealers}
        products={data.products}
        deals={data.deals}
        salesUsers={data.salesUsers}
        canPickPreparedBy={ctx.user.role === 'admin'}
      />
    </div>
  );
}
