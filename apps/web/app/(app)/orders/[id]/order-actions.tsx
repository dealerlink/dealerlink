'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cancelOrder, updateOrderExpectedDispatch } from '@/lib/actions/orders';
import { confirmOrder } from '@/lib/actions/orders/confirm-order';

interface PreviewLine {
  productId: string;
  productSku: string;
  productName: string;
  requested: number;
  available: number;
  short: number;
}

interface Props {
  id: string;
  orderNumber: string;
  status: string;
  isAdmin: boolean;
  canConfirm: boolean;
  canEditDispatch: boolean;
  expectedDispatchDate: string | null;
  /** Reservation preview — present only while the order is `pending`. */
  preview: PreviewLine[] | null;
}

type Pending = null | 'confirm' | 'cancel' | 'dispatch';

export function OrderActions({
  id,
  orderNumber,
  status,
  isAdmin,
  canConfirm,
  canEditDispatch,
  expectedDispatchDate,
  preview,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dispatchDate, setDispatchDate] = useState(expectedDispatchDate ?? '');

  const previewShort = (preview ?? []).filter((l) => l.short > 0);
  const canConfirmNow = preview !== null && previewShort.length === 0;

  async function doConfirm() {
    setPending('confirm');
    setError(null);
    const r = await confirmOrder({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setConfirmOpen(false);
    setNotice(`Reserved ${r.data.reservedCount} inventory item(s).`);
    router.refresh();
    setPending(null);
  }

  async function doCancel() {
    if (!cancelReason.trim()) {
      setError('A cancellation reason is required.');
      return;
    }
    setPending('cancel');
    setError(null);
    const r = await cancelOrder({ id, reason: cancelReason.trim() });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setCancelOpen(false);
    setNotice(`Order cancelled — released ${r.data.releasedCount} reservation(s).`);
    router.refresh();
    setPending(null);
  }

  async function doDispatchDate() {
    setPending('dispatch');
    setError(null);
    const r = await updateOrderExpectedDispatch({
      id,
      expectedDispatchDate: dispatchDate || null,
    });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setDispatchOpen(false);
    router.refresh();
    setPending(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'pending' && canConfirm && (
          <Button variant="primary" onClick={() => setConfirmOpen((o) => !o)} disabled={!!pending}>
            Confirm order
          </Button>
        )}
        {canEditDispatch && status !== 'cancelled' && status !== 'closed' && (
          <Button variant="default" onClick={() => setDispatchOpen((o) => !o)} disabled={!!pending}>
            {expectedDispatchDate ? 'Edit dispatch date' : 'Set dispatch date'}
          </Button>
        )}
        {isAdmin && (status === 'pending' || status === 'confirmed') && (
          <Button
            variant="destructive"
            onClick={() => setCancelOpen((o) => !o)}
            disabled={!!pending}
          >
            Cancel order
          </Button>
        )}
      </div>

      {confirmOpen && (
        <div className="border-line w-[420px] space-y-2 rounded-[6px] border bg-white p-4">
          <div className="text-ink text-[13px] font-semibold">Confirm {orderNumber}</div>
          <p className="text-mute text-[12px]">
            Confirming reserves serialised inventory (FIFO) for every line:
          </p>
          <ul className="space-y-1 text-[12.5px]">
            {(preview ?? []).map((l) => (
              <li
                key={l.productId}
                className={`flex justify-between rounded-[4px] px-2 py-1 ${
                  l.short > 0 ? 'bg-rose-50 text-rose-700' : 'bg-paper-2'
                }`}
              >
                <span>
                  {l.productName} <span className="mono text-[11px]">· {l.productSku}</span>
                </span>
                <span className="mono">
                  {l.short > 0
                    ? `${l.short} short — need ${l.requested}, ${l.available} in stock`
                    : `reserve ${l.requested}`}
                </span>
              </li>
            ))}
          </ul>
          {!canConfirmNow && (
            <div className="rounded-[4px] bg-rose-50 px-2 py-1.5 text-[12px] text-rose-700">
              Cannot confirm — {previewShort.length} product(s) short of stock. Procure more
              inventory, then retry.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setConfirmOpen(false)}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={doConfirm}
              disabled={!!pending || !canConfirmNow}
            >
              {pending === 'confirm' ? 'Reserving…' : 'Confirm & reserve'}
            </Button>
          </div>
        </div>
      )}

      {dispatchOpen && (
        <div className="border-line w-[300px] space-y-2 rounded-[6px] border bg-white p-3">
          <label className="text-ink block text-[12px] font-medium">Expected dispatch date</label>
          <input
            type="date"
            value={dispatchDate}
            onChange={(e) => setDispatchDate(e.target.value)}
            className="border-line bg-paper focus:ring-accent h-8 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setDispatchOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={doDispatchDate} disabled={!!pending}>
              {pending === 'dispatch' ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      )}

      {cancelOpen && (
        <div className="border-line w-[360px] space-y-2 rounded-[6px] border bg-white p-3">
          <label className="text-ink block text-[12px] font-medium">Cancellation reason</label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
            placeholder="e.g., dealer cancelled the order"
          />
          <p className="text-mute text-[11.5px]">
            Cancelling releases any reserved inventory back to stock.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button type="button" variant="destructive" onClick={doCancel} disabled={!!pending}>
              {pending === 'cancel' ? 'Cancelling…' : 'Confirm cancel'}
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <div className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700">
          {notice}
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
