import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

import { NewProductForm } from './new-product-form';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'admin') redirect('/catalog');

  return (
    <div className="mx-auto max-w-[720px] px-8 py-12">
      <Link
        href="/catalog"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Catalog
      </Link>
      <div className="mt-4">
        <div className="titlecaps mb-1">New product</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Create a product</h1>
        <p className="text-mute mt-1 text-[13px]">
          SKU must be unique within the tenant. HSN: 4-8 digits. GST rate: 0, 5, 12, 18, or 28.
        </p>
      </div>
      <NewProductForm />
    </div>
  );
}
