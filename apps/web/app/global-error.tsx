'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Root error boundary (Day 17, chunk 17a).
 *
 * Next.js renders `global-error` when an error escapes the root layout —
 * including React render errors that the per-segment `(app)/error.tsx` cannot
 * catch. It replaces the entire document, so it must render its own
 * `<html>`/`<body>`. The error is forwarded to Sentry; the UI stays minimal
 * because the design system / fonts may themselves have failed to load.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          color: '#1a1a1a',
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#666' }}>
            Dealerlink hit an unexpected error. The team has been notified — please reload the page.
          </p>
        </div>
      </body>
    </html>
  );
}
