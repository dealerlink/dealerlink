import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { getAuditTrail } from '@/lib/queries/audit';
import { getProductById } from '@/lib/queries/products';
import { impersonationTenantId } from '@/lib/tenant/context';

import { DealerActivity } from '../../dealers/[id]/dealer-activity';
import { ProductDetailSections } from './product-detail-sections';

interface PageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

function statusTone(s: string): StatusTone {
  if (s === 'active') return 'em';
  if (s === 'discontinued') return 'ro';
  return 'mu';
}

export default async function ProductDetailPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const result = await getProductById(tenantId, params.id);
  if (!result) notFound();
  const { product, inventorySummary } = result;

  const activity = await getAuditTrail(tenantId, 'products', params.id, 50);

  const canEdit = ctx.user.role === 'admin';

  return (
    <div className="mx-auto max-w-[920px] px-8 py-12">
      <Link
        href="/catalog"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Catalog
      </Link>

      <div className="mt-4">
        <div className="mono text-mute text-[11.5px]">{product.sku}</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{product.name}</h1>
        <div className="text-mute mt-1 text-[12.5px]">
          {product.manufacturer ?? '—'} {product.model ? `· ${product.model}` : ''}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill tone={statusTone(product.status)}>{product.status}</StatusPill>
          <span className="bg-paper-2 mono text-mute rounded-[3px] px-1.5 py-[2px] text-[11px]">
            HSN {product.hsnCode} · GST {product.gstRate}%
          </span>
        </div>
      </div>

      <ProductDetailSections
        product={{
          id: product.id,
          sku: product.sku,
          name: product.name,
          description: product.description,
          manufacturer: product.manufacturer,
          model: product.model,
          hsnCode: product.hsnCode,
          gstRate: product.gstRate,
          category: product.category,
          subcategory: product.subcategory,
          specs: (product.specs ?? {}) as Record<string, unknown>,
          mrp: product.mrp,
          defaultPurchasePrice: product.defaultPurchasePrice,
          defaultSellingPrice: product.defaultSellingPrice,
          requiresSerial: product.requiresSerial,
          unitOfMeasure: product.unitOfMeasure,
          status: product.status,
        }}
        canEdit={canEdit}
      />

      <section className="border-line mt-6 rounded-[6px] border bg-white p-4">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">Inventory summary</h2>
        {inventorySummary.length === 0 ? (
          <p className="text-mute mt-2 text-[12.5px]">
            No inventory yet — procurement ships Day 6.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {inventorySummary.map((s) => (
              <div key={s.status} className="bg-paper-2 rounded-[5px] px-3 py-2">
                <div className="text-mute text-[11px] uppercase tracking-[0.06em]">{s.status}</div>
                <div className="mono text-ink text-[16px] font-semibold">{s.value}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <DealerActivity entries={activity} />
    </div>
  );
}
