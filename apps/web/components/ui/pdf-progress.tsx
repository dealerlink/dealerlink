'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Inline progress shown while a PDF render is in flight.
 *
 * Rendering happens in the workers process (DEV.63); the first render after a
 * deploy or an idle period pays a cold Chromium launch on the small worker and
 * can take up to ~60-90s, within the 120s wait (DEV.66/67). This keeps the user
 * informed instead of staring at a button that looks frozen.
 *
 * Cold-start UX (C.4, mitigates UX finding C-1): once a render has been in
 * flight for >5s — i.e. we are almost certainly warming a cold worker — the
 * copy switches to a reassuring warm-up message. On an explicit retry
 * (`isRetry`) the warm-up message is suppressed, since the worker is warm and
 * the retry should complete in a few seconds.
 */
const WARMUP_AFTER_MS = 5000;

export function PdfProgress({ show, isRetry = false }: { show: boolean; isRetry?: boolean }) {
  const [warming, setWarming] = useState(false);

  useEffect(() => {
    if (!show || isRetry) {
      setWarming(false);
      return;
    }
    setWarming(false);
    const t = setTimeout(() => setWarming(true), WARMUP_AFTER_MS);
    return () => clearTimeout(t);
  }, [show, isRetry]);

  if (!show) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      className="text-mute inline-flex items-center gap-1.5 text-[12px]"
    >
      <Loader2 className="animate-spin" size={13} />
      {warming
        ? 'First PDF takes a moment to prepare while we warm up our document service. Subsequent renders will be instant.'
        : 'Generating PDF — this can take a moment the first time.'}
    </p>
  );
}
