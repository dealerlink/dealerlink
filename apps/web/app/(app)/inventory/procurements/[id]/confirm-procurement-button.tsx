'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { confirmProcurement } from '@/lib/actions/procurements';

export function ConfirmProcurementButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await confirmProcurement({ id });
            if (!r.ok) setError(r.error.message);
            else router.refresh();
          })
        }
      >
        {pending ? 'Confirming…' : 'Confirm procurement'}
      </Button>
      {error && <div className="text-[11px] text-rose-700">{error}</div>}
    </div>
  );
}
