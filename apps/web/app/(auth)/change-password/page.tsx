import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

import { ChangePasswordForm } from './change-password-form';

export const metadata = { title: 'Change password · Dealerlink' };

// Reads the session cookie, so the route is dynamic by nature.
export const dynamic = 'force-dynamic';

/**
 * Force-password-change screen (CLAUDE.md §6, ADR-010, closes DEV.56).
 *
 * Lives in the (auth) route group — NO Shell, and crucially NOT wrapped by
 * the (app)/admin layout guards, so the forced redirect that sends users
 * here can never loop back on itself.
 *
 * Dual purpose:
 *   - Forced rotation: new operator-provisioned / reset users land here on
 *     first login (`must_change_password = true`); the layout guards keep
 *     them here until the flag clears.
 *   - Voluntary change: any signed-in user can visit /change-password to
 *     rotate their own password.
 *
 * A valid session is the only prerequisite — no session means the user
 * belongs on /login.
 */
export default async function ChangePasswordPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  return (
    <div className="flex min-h-screen flex-col bg-[#F7F7F4]">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[420px]">
          <div className="flex items-center gap-2.5">
            <div className="relative h-[26px] w-[26px] rounded-[6px] bg-[#0B0F1A]">
              <span className="absolute inset-[3px] rounded-[3px] border border-white/80" />
            </div>
            <span className="text-[14px] font-semibold tracking-[-0.01em]">Dealerlink</span>
          </div>

          <ChangePasswordForm forced={ctx.user.mustChangePassword} userEmail={ctx.user.email} />

          <div className="mono text-mute-2 mt-8 text-[11.5px]">
            © 2026 Dealerlink · Signed in as {ctx.user.email}
          </div>
        </div>
      </div>
    </div>
  );
}
