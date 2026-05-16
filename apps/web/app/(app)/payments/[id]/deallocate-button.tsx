'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { deallocatePayment } from '@/lib/actions/payments';

/** Remove a single allocation row — a small inline action on the table. */
export function DeallocateButton({ allocationId }: { allocationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDeallocate() {
    setPending(true);
    setError(null);
    const r = await deallocatePayment({ allocationId });
    if (!r.ok) {
      setError(r.error.message);
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
      <button
        type="button"
        onClick={doDeallocate}
        disabled={pending}
        className="text-mute text-[11.5px] hover:text-rose-600 hover:underline disabled:opacity-50"
      >
        {pending ? 'Removing…' : 'Remove'}
      </button>
    </span>
  );
}
