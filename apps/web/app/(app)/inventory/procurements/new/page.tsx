import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { listProducts } from '@/lib/queries/products';
import { impersonationTenantId } from '@/lib/tenant/context';

import { NewProcurementForm } from './new-procurement-form';

export const dynamic = 'force-dynamic';

export default async function NewProcurementPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'dispatch') {
    redirect('/inventory/procurements');
  }

  const productsResult = await listProducts(tenantId, { limit: 500, offset: 0 });
  const productOptions = productsResult.rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    defaultPurchasePrice: p.defaultSellingPrice ?? null, // fallback hint
    manufacturer: p.manufacturer,
    hsnCode: p.hsnCode,
  }));

  return (
    <div className="px-6 py-5">
      <div className="mb-5">
        <div className="titlecaps mb-1">Inventory · Procurement</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">New procurement</h1>
      </div>
      <NewProcurementForm products={productOptions} />
    </div>
  );
}
