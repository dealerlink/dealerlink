import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

import { DealerImportForm } from './dealer-import-form';

const TEMPLATE = [
  'legalName,displayName,gstin,pan,state,city,pincode,type,category,riskLevel,email,phone,creditLimit,creditPeriodDays,discountPercent,tags',
  'Acme Solar Pvt Ltd,Acme Solar,27ABCDE1234F1Z5,ABCDE1234F,Maharashtra,Pune,411001,retailer,B,low,sales@acme.in,9999999999,500000,30,2,"premium,strategic"',
].join('\n');

export const dynamic = 'force-dynamic';

export default async function DealerImportPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'admin') redirect('/dealers');

  return (
    <div className="mx-auto max-w-[920px] px-8 py-12">
      <Link
        href="/dealers"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> All dealers
      </Link>
      <div className="mt-4">
        <div className="titlecaps mb-1">Bulk import</div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Import dealers from CSV</h1>
        <p className="text-mute mt-1 text-[13px]">
          Paste CSV content below or upload a file. The import is atomic — if any row fails
          validation or hits a GSTIN conflict, the entire batch is rolled back.
        </p>
        <details className="mt-4">
          <summary className="text-mute cursor-pointer text-[12.5px]">CSV template</summary>
          <pre className="bg-paper-2 mono mt-2 overflow-x-auto rounded-[5px] p-3 text-[11.5px]">
            {TEMPLATE}
          </pre>
        </details>
      </div>
      <DealerImportForm template={TEMPLATE} />
    </div>
  );
}
