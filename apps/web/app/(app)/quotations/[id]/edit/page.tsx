import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { getQuotationById } from '@/lib/queries/quotations';
import { impersonationTenantId } from '@/lib/tenant/context';

import type { BuilderFormState } from '../../_components/builder-types';
import { loadBuilderData } from '../../_components/load-builder-data';
import { QuotationBuilderForm } from '../../_components/quotation-builder-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function EditQuotationPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'sales') redirect('/quotations');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const [quotation, data] = await Promise.all([
    getQuotationById(tenantId, params.id),
    loadBuilderData(tenantId),
  ]);
  if (!quotation) notFound();

  if (quotation.status !== 'draft') {
    redirect(`/quotations/${params.id}`);
  }
  if (ctx.user.role === 'sales' && quotation.preparedBy.id !== ctx.user.id) {
    redirect(`/quotations/${params.id}`);
  }

  const initial: BuilderFormState = {
    dealerId: quotation.dealer.id,
    dealId: quotation.dealId ?? '',
    preparedBy: quotation.preparedBy.id,
    quoteDate: quotation.quoteDate,
    validUntil: quotation.validUntil,
    placeOfSupplyOverride:
      quotation.placeOfSupply === (quotation.dealer.state ?? '').toUpperCase()
        ? ''
        : quotation.placeOfSupply,
    termsAndConditions: quotation.termsAndConditions ?? '',
    notes: quotation.notes ?? '',
    lines: quotation.lines.map((l) => ({
      productId: l.productId,
      productSku: l.productSku,
      productName: l.productName,
      hsnCode: l.hsnCode,
      gstRate: l.gstRate,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
      description: l.description ?? '',
      notes: l.notes ?? '',
    })),
    discount:
      quotation.discountType && quotation.discountValue
        ? { type: quotation.discountType, value: quotation.discountValue.toString() }
        : { type: 'none', value: '' },
  };

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10">
      <Link
        href={`/quotations/${params.id}`}
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Back to quotation
      </Link>
      <div className="mb-6 mt-4">
        <div className="titlecaps mb-1">Quotation Builder</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">
          Edit {quotation.quoteNumber}
          {quotation.revision > 1 ? ` · Rev ${quotation.revision}` : ''}
        </h1>
      </div>
      <QuotationBuilderForm
        mode="edit"
        quotationId={params.id}
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
