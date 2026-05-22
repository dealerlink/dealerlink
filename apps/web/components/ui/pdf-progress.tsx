import { Loader2 } from 'lucide-react';

/**
 * Inline progress shown while a PDF render is in flight.
 *
 * Rendering happens in the workers process (DEV.63); the first render after a
 * deploy or an idle period can take up to a minute on the small worker
 * (DEV.66). This keeps the user informed instead of staring at a button that
 * looks frozen.
 */
export function PdfProgress({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className="text-mute inline-flex items-center gap-1.5 text-[12px]"
    >
      <Loader2 className="animate-spin" size={13} /> Generating PDF — this can take a moment the
      first time.
    </p>
  );
}
