import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { listDealers } from '@/lib/queries/dealers';
import { listProducts } from '@/lib/queries/products';
import { impersonationTenantId } from '@/lib/tenant/context';

import { NewDealForm } from './new-deal-form';

export const dynamic = 'force-dynamic';

export default async function NewDealPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'sales') redirect('/pipeline');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const [dealerList, productList] = await Promise.all([
    listDealers(tenantId, { limit: 200 }),
    listProducts(tenantId, { limit: 200 }),
  ]);

  const dealers = dealerList.rows
    .filter((d) => d.status === 'active')
    .map((d) => ({ id: d.id, label: `${d.displayName} · ${d.dealerCode}` }));
  const products = productList.rows.map((p) => ({
    id: p.id,
    label: `${p.sku} · ${p.name}`,
  }));

  return (
    <div className="mx-auto max-w-[720px] px-8 py-10">
      <Link
        href="/pipeline"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Pipeline
      </Link>
      <div className="mt-4">
        <div className="titlecaps mb-1">Sales Pipeline</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">New deal</h1>
        <p className="text-mute mt-1 text-[13px]">
          Starts at <span className="mono">Qualification</span>. Use the kanban to move it forward.
        </p>
      </div>
      <NewDealForm dealers={dealers} products={products} />
    </div>
  );
}
