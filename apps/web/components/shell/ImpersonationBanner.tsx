'use client';

import { Eye, LogOut as LogOutIcon } from 'lucide-react';
import { useTransition } from 'react';

import { exitImpersonation } from '@/lib/impersonation/actions';

interface ImpersonationBannerProps {
  tenantName: string;
  tenantSlug: string;
}

export function ImpersonationBanner({ tenantName, tenantSlug }: ImpersonationBannerProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      role="status"
      aria-live="polite"
      className="hairline-b text-ink flex items-center gap-3 bg-[#FFFBEB] px-5 py-2 text-[12.5px]"
    >
      <Eye size={14} className="flex-shrink-0 text-[var(--amber)]" />
      <div className="min-w-0 flex-1">
        <span className="font-medium">Operator impersonation</span>
        <span className="text-mute">
          {' '}
          — viewing <span className="text-ink">{tenantName}</span>{' '}
          <span className="mono">({tenantSlug})</span> as read-only. Mutations are blocked.
        </span>
      </div>
      <form
        action={() => {
          startTransition(async () => {
            await exitImpersonation();
          });
        }}
      >
        <button
          type="submit"
          disabled={isPending}
          className="border-[var(--amber)]/30 hover:bg-[var(--amber)]/[0.06] inline-flex h-7 items-center gap-1.5 rounded-[5px] border bg-white px-2.5 text-[12px] font-medium text-[var(--amber)] disabled:opacity-60"
        >
          <LogOutIcon size={12} />
          {isPending ? 'Exiting…' : 'Exit impersonation'}
        </button>
      </form>
    </div>
  );
}
