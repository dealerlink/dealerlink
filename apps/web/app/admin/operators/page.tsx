import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

export const metadata = { title: 'Operators · Admin · Dealerlink' };
export const dynamic = 'force-dynamic';

export default async function OperatorsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  return (
    <div className="mx-auto max-w-[760px] px-8 py-12">
      <div className="titlecaps">Operators</div>
      <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">Operator accounts</h1>
      <p className="text-mute mt-3 text-[13px]">
        Operator account management ships with Phase 2 of the admin app — for now operators are
        provisioned via SQL. See <span className="mono">DECISIONS.md</span> ADR-002 for the
        rationale, and <span className="mono">RUNBOOKS.md</span> for the temporary process.
      </p>
    </div>
  );
}
