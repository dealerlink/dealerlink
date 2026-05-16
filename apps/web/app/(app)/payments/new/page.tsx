import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { listDealerOptions } from '@/lib/queries/payments';
import { impersonationTenantId } from '@/lib/tenant/context';

import { RecordPaymentForm } from './record-payment-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { dealer?: string };
}

export default async function NewPaymentPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  // Recording payments is admin + accounts only.
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'accounts') redirect('/payments');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const dealers = await listDealerOptions(tenantId);

  return (
    <div className="mx-auto max-w-[720px] px-8 py-10">
      <Link
        href="/payments"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Payments
      </Link>
      <div className="mb-6 mt-4">
        <div className="titlecaps mb-1">Payments</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Record payment</h1>
        <p className="text-mute mt-1 text-[13px]">
          Log a receipt from a dealer. It starts in <strong>pending verification</strong> — an
          accountant verifies it before it can be allocated to orders.
        </p>
      </div>
      <RecordPaymentForm dealers={dealers} initialDealerId={searchParams.dealer ?? ''} />
    </div>
  );
}
