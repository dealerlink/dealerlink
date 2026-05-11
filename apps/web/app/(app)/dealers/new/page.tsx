import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

import { NewDealerForm } from './new-dealer-form';

export const dynamic = 'force-dynamic';

export default async function NewDealerPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'sales') {
    redirect('/dealers');
  }
  const isAdmin = ctx.user.role === 'admin';

  return (
    <div className="mx-auto max-w-[720px] px-8 py-12">
      <Link
        href="/dealers"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> All dealers
      </Link>
      <div className="mt-4">
        <div className="titlecaps mb-1">New dealer</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Create a dealer</h1>
        <p className="text-mute mt-1 text-[13px]">
          A unique code is assigned on save. Commercial terms (credit limit, period, discount) are
          admin-only.
        </p>
      </div>
      <NewDealerForm canSetCommercial={isAdmin} />
    </div>
  );
}
