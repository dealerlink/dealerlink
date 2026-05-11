'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { submitSerials } from '@/lib/actions/procurements';

interface Props {
  procurementId: string;
  productId: string;
  productName: string;
  productSku: string;
  expected: number;
  received: number;
}

export function SerialEntryForm({
  procurementId,
  productId,
  productName,
  productSku,
  expected,
  received,
}: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const serials = useMemo(() => {
    return text
      .split(/[\n,\r]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [text]);

  const dupesInPaste = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const s of serials) {
      if (seen.has(s)) dupes.add(s);
      else seen.add(s);
    }
    return Array.from(dupes);
  }, [serials]);

  const remaining = expected - received;
  const tooMany = serials.length > remaining;
  const complete = received >= expected;

  function submit() {
    setError(null);
    if (dupesInPaste.length > 0) {
      setError(`Duplicates in batch: ${dupesInPaste.join(', ')}`);
      return;
    }
    if (serials.length === 0) {
      setError('Paste at least one serial');
      return;
    }
    startTransition(async () => {
      const r = await submitSerials({ procurementId, productId, serials });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setText('');
      router.refresh();
    });
  }

  return (
    <section className="border-line rounded-[6px] border bg-white p-4">
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-ink font-medium">{productName}</div>
          <div className="text-mute mono text-[11.5px]">{productSku}</div>
        </div>
        <div className="text-right">
          <div className="mono text-[16px]">
            {received} <span className="text-mute">/ {expected}</span>
          </div>
          <div className="text-mute text-[11px] uppercase tracking-[0.05em]">received</div>
        </div>
      </header>

      {complete ? (
        <div className="text-[12.5px] text-emerald-700">All serials received.</div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="One serial per line…"
            rows={6}
            className="border-line mono w-full rounded-[5px] border bg-white px-3 py-2 text-[12.5px]"
            disabled={pending}
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-mute text-[12px]">
              <span className="mono">{serials.length}</span> serial
              {serials.length === 1 ? '' : 's'} pasted · <span className="mono">{remaining}</span>{' '}
              remaining
              {tooMany && (
                <span className="ml-2 text-rose-700">({serials.length - remaining} over)</span>
              )}
            </div>
            <Button
              variant="primary"
              onClick={submit}
              disabled={pending || serials.length === 0 || tooMany || dupesInPaste.length > 0}
            >
              {pending ? 'Saving…' : `Submit ${serials.length}`}
            </Button>
          </div>
          {error && <div className="mt-2 text-[12px] text-rose-700">{error}</div>}
        </>
      )}
    </section>
  );
}
