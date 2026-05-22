import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AdminSidebar } from '@/components/shell/AdminSidebar';
import { getAuthContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  // Force-password-change trapdoor (CLAUDE.md §6, ADR-010, DEV.56) — checked
  // before the role gate so a flagged operator rotates first. /change-password
  // is in the (auth) group, outside this layout, so there is no redirect loop.
  if (ctx.user.mustChangePassword) redirect('/change-password');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        user={{ fullName: ctx.user.fullName, email: ctx.user.email, role: ctx.user.role }}
      />
      <main className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--paper)' }}>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
