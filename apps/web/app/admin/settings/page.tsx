import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

export const metadata = { title: 'Platform settings · Admin · Dealerlink' };
export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  return (
    <div className="mx-auto max-w-[760px] px-8 py-12">
      <div className="titlecaps">Platform</div>
      <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">Platform settings</h1>
      <p className="text-mute mt-3 text-[13px]">
        Platform-level configuration (feature flags, default branding, monitoring thresholds) ships
        later in the build. The current product defaults are checked into
        <span className="mono"> CLAUDE.md</span> §16.
      </p>
    </div>
  );
}
