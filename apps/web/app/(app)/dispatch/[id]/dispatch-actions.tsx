'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { markDispatchDelivered, returnDispatch } from '@/lib/actions/dispatch';
import type { DispatchStatus } from '@dealerlink/schemas';

interface Props {
  id: string;
  dispatchNumber: string;
  status: DispatchStatus;
  isAdmin: boolean;
  canManage: boolean;
}

type Pending = null | 'deliver' | 'return';

export function DispatchActions({ id, dispatchNumber, status, isAdmin, canManage }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [acknowledgedBy, setAcknowledgedBy] = useState('');
  const [returnReason, setReturnReason] = useState('');

  async function doDeliver() {
    if (acknowledgedBy.trim().length < 2) {
      setError('Record who received the goods.');
      return;
    }
    setPending('deliver');
    setError(null);
    const r = await markDispatchDelivered({ id, acknowledgedBy: acknowledgedBy.trim() });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setDeliverOpen(false);
    router.refresh();
    setPending(null);
  }

  async function doReturn() {
    if (returnReason.trim().length < 2) {
      setError('A return reason is required.');
      return;
    }
    setPending('return');
    setError(null);
    const r = await returnDispatch({ id, reason: returnReason.trim() });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setReturnOpen(false);
    router.refresh();
    setPending(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === 'in_transit' && canManage && (
          <Button variant="primary" onClick={() => setDeliverOpen((o) => !o)} disabled={!!pending}>
            Mark delivered
          </Button>
        )}
        {status === 'in_transit' && isAdmin && (
          <Button
            variant="destructive"
            onClick={() => setReturnOpen((o) => !o)}
            disabled={!!pending}
          >
            Return
          </Button>
        )}
        {status === 'delivered' && (
          <span className="text-mute text-[12px]">Proof of delivery — coming soon</span>
        )}
      </div>

      {deliverOpen && (
        <div className="border-line w-[340px] space-y-2 rounded-[6px] border bg-white p-3">
          <div className="text-ink text-[13px] font-semibold">Mark {dispatchNumber} delivered</div>
          <label className="text-ink block text-[12px] font-medium">Received by</label>
          <input
            value={acknowledgedBy}
            onChange={(e) => setAcknowledgedBy(e.target.value)}
            placeholder="Name of the person who signed"
            className="border-line bg-paper focus:ring-accent h-8 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setDeliverOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={doDeliver} disabled={!!pending}>
              {pending === 'deliver' ? 'Saving…' : 'Confirm delivery'}
            </Button>
          </div>
        </div>
      )}

      {returnOpen && (
        <div className="border-line w-[360px] space-y-2 rounded-[6px] border bg-white p-3">
          <div className="text-ink text-[13px] font-semibold">Return {dispatchNumber}</div>
          <label className="text-ink block text-[12px] font-medium">Return reason</label>
          <textarea
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            rows={3}
            placeholder="e.g., damaged in transit, wrong consignee"
            className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
          />
          <p className="text-mute text-[11.5px]">
            Returning sends every serial back to warehouse stock and recomputes the order status.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setReturnOpen(false)}>
              Keep dispatch
            </Button>
            <Button type="button" variant="destructive" onClick={doReturn} disabled={!!pending}>
              {pending === 'return' ? 'Returning…' : 'Confirm return'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}
