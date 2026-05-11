import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

import { ProductImportForm } from './product-import-form';

const TEMPLATE = [
  'sku,name,manufacturer,model,hsnCode,gstRate,category,subcategory,mrp,defaultPurchasePrice,defaultSellingPrice,requiresSerial,unitOfMeasure',
  'PRE-540-TC,Premier 540W TOPCon Bifacial,Premier Energies,PRE-540TC,85414300,18,Solar Panel,TOPCon,18500,11000,14200,true,Nos',
].join('\n');

export const dynamic = 'force-dynamic';

export default async function ProductImportPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'admin') redirect('/catalog');

  return (
    <div className="mx-auto max-w-[920px] px-8 py-12">
      <Link
        href="/catalog"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Catalog
      </Link>
      <div className="mt-4">
        <div className="titlecaps mb-1">Bulk import</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Import products from CSV</h1>
        <p className="text-mute mt-1 text-[13px]">
          Paste CSV content or upload a file. Atomic — any SKU collision rolls back the entire
          batch.
        </p>
        <details className="mt-4">
          <summary className="text-mute cursor-pointer text-[12.5px]">CSV template</summary>
          <pre className="bg-paper-2 mono mt-2 overflow-x-auto rounded-[5px] p-3 text-[11.5px]">
            {TEMPLATE}
          </pre>
        </details>
      </div>
      <ProductImportForm template={TEMPLATE} />
    </div>
  );
}
