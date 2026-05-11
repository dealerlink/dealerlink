import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

import { NewTenantForm } from './new-tenant-form';

export const metadata = { title: 'New tenant · Admin · Dealerlink' };
export const dynamic = 'force-dynamic';

export default async function NewTenantPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  return <NewTenantForm />;
}
