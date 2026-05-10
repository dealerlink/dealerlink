import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { logout } from '@/lib/auth/actions';

export const metadata = { title: 'Admin · Dealerlink' };

export default async function AdminPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  return (
    <div className="bg-paper min-h-screen">
      <div className="mx-auto max-w-[640px] px-8 py-16">
        <div className="titlecaps">Operator console</div>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em]">
          Welcome, <span className="editorial font-normal">{ctx.user.fullName}</span>.
        </h1>
        <p className="text-mute mt-3 text-[14px]">
          Tenant provisioning and platform-level management land in a later milestone (ADR-002). For
          now, this page exists so operator logins have somewhere to land.
        </p>
        <form action={logout} className="mt-8">
          <button
            type="submit"
            className="bg-ink hover:bg-ink-2 inline-flex h-[40px] items-center rounded-[6px] px-4 text-[13px] font-medium text-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
