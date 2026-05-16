'use client';

import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Friendly error panel. Never leaks internals — no stack trace, no SQL. The
 * caller logs the real error (Sentry from Day 17); the user sees a recovery
 * path: retry, and a way to report the issue.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this content. This is usually temporary — please try again.',
  retry,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="border-line rounded-[6px] border bg-white px-6 py-16 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-[#FCA5A5] bg-[#FEF2F2]">
        <AlertTriangle size={19} className="text-[#991B1B]" aria-hidden="true" />
      </div>
      <div className="text-ink text-[14px] font-medium">{title}</div>
      <p className="text-mute mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed">{description}</p>
      <div className="mt-4 flex items-center justify-center gap-2">
        {retry && (
          <Button variant="primary" onClick={retry}>
            Try again
          </Button>
        )}
        <Button asChild variant="default">
          <a href="mailto:support@dealerlink.in?subject=Dealerlink%20issue%20report">
            Report issue
          </a>
        </Button>
      </div>
    </div>
  );
}
