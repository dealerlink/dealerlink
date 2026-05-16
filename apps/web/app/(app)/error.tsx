'use client';

import { useEffect } from 'react';

import { ErrorState } from '@/app/_components';
import { reportError } from '@/lib/observability/log';

/**
 * Page-level error boundary for the authenticated app (Next.js convention).
 * Catches any unhandled error thrown while rendering an `(app)` route —
 * a failed query, an RLS denial, a network blip — and shows a friendly,
 * recoverable panel. The real error goes to the logger (Sentry from Day 17),
 * never to the screen.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: 'app', digest: error.digest });
  }, [error]);

  return (
    <div className="px-6 py-10">
      <ErrorState
        title="This page hit a snag"
        description="Something went wrong while loading this page. Your data is safe — try again, or head back and retry."
        retry={reset}
      />
    </div>
  );
}
