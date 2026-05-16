import Link from 'next/link';

import { Button } from '@/components/ui/button';

export const metadata = { title: 'Page not found' };

/**
 * Branded 404. Also the page rendered by `notFound()` — e.g. a role hitting
 * a report it is not entitled to (`assertReportAccess`).
 */
export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ background: 'var(--paper)' }}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#0B0F1A]">
        <span className="relative block h-[26px] w-[26px]">
          <span className="absolute inset-[3px] rounded-[3px] border border-white" />
        </span>
      </div>
      <div className="mono text-mute text-[13px] tracking-[0.1em]">404</div>
      <h1 className="text-ink mt-1 text-[24px] font-semibold tracking-[-0.02em]">
        This page could not be found
      </h1>
      <p className="text-mute mt-2 max-w-sm text-[13px] leading-relaxed">
        The page may have moved, or you may not have access to it. Check the address, or head back
        to your dashboard.
      </p>
      <div className="mt-5">
        <Button asChild variant="primary">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
