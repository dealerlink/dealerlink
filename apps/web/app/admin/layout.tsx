import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AdminSidebar } from '@/components/shell/AdminSidebar';
import { getAuthContext } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
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
