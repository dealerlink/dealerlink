'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  allocatePayment,
  downloadPaymentReceipt,
  markPaymentBounced,
  markPaymentCleared,
  refundPayment,
  sendPaymentReceipt,
  verifyPayment,
} from '@/lib/actions/payments';
import { formatINRExact } from '@/lib/format';

interface OutstandingOrder {
  id: string;
  orderNumber: string;
  outstanding: number;
}

interface Props {
  id: string;
  paymentNumber: string;
  status: string;
  isAdmin: boolean;
  canManage: boolean;
  unallocatedAmount: number;
  outstandingOrders: OutstandingOrder[];
  autoOpenAllocate: boolean;
}

type Panel = null | 'allocate' | 'bounce' | 'refund';

export function PaymentActions({
  id,
  paymentNumber,
  status,
  isAdmin,
  canManage,
  unallocatedAmount,
  outstandingOrders,
  autoOpenAllocate,
}: Props) {
  const router = useRouter();
  const allocatable = status === 'verified' || status === 'cleared';
  const [panel, setPanel] = useState<Panel>(
    autoOpenAllocate && allocatable && unallocatedAmount > 0 ? 'allocate' : null,
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  function reset() {
    setError(null);
    setNotice(null);
  }

  async function run(
    label: string,
    fn: () => Promise<{ ok: boolean; error?: { message: string } }>,
  ) {
    setPending(label);
    reset();
    const r = await fn();
    if (!r.ok) {
      setError(r.error?.message ?? 'Something went wrong.');
      setPending(null);
      return false;
    }
    setPending(null);
    return true;
  }

  async function doVerify() {
    if (await run('verify', () => verifyPayment({ id }))) {
      setNotice('Payment verified — it can now be allocated.');
      router.refresh();
    }
  }

  async function doClear() {
    if (await run('clear', () => markPaymentCleared({ id }))) {
      setNotice('Payment marked cleared.');
      router.refresh();
    }
  }

  async function doBounce() {
    if (!reason.trim()) {
      setError('A reason is required to mark a payment bounced.');
      return;
    }
    if (await run('bounce', () => markPaymentBounced({ id, reason: reason.trim() }))) {
      setPanel(null);
      setReason('');
      setNotice('Payment bounced — allocations reversed.');
      router.refresh();
    }
  }

  async function doRefund() {
    if (!reason.trim()) {
      setError('A reason is required to refund a payment.');
      return;
    }
    if (await run('refund', () => refundPayment({ id, reason: reason.trim() }))) {
      setPanel(null);
      setReason('');
      setNotice('Payment refunded — allocations reversed.');
      router.refresh();
    }
  }

  async function doAllocate() {
    const allocations = Object.entries(amounts)
      .map(([orderId, raw]) => ({ orderId, amount: Number(raw) }))
      .filter((a) => Number.isFinite(a.amount) && a.amount > 0);
    if (allocations.length === 0) {
      setError('Enter an amount against at least one order.');
      return;
    }
    if (await run('allocate', () => allocatePayment({ paymentId: id, allocations }))) {
      setPanel(null);
      setAmounts({});
      setNotice(`Allocated to ${allocations.length} order(s).`);
      router.refresh();
    }
  }

  async function doDownload() {
    setPending('download');
    reset();
    const r = await downloadPaymentReceipt({ id });
    setPending(null);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    if (r.data.url) {
      window.open(r.data.url, '_blank');
      return;
    }
    if (r.data.base64) {
      const bytes = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: r.data.mimeType });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = r.data.filename;
      a.click();
      URL.revokeObjectURL(href);
    }
  }

  async function doSend() {
    if (await run('send', () => sendPaymentReceipt({ id }))) {
      setNotice('Receipt queued for email delivery.');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canManage && status === 'pending_verification' && (
          <Button variant="primary" onClick={doVerify} disabled={!!pending}>
            {pending === 'verify' ? 'Verifying…' : 'Verify'}
          </Button>
        )}
        {canManage && status === 'verified' && (
          <Button variant="primary" onClick={doClear} disabled={!!pending}>
            {pending === 'clear' ? 'Saving…' : 'Mark cleared'}
          </Button>
        )}
        {canManage && allocatable && unallocatedAmount > 0 && (
          <Button
            variant="default"
            onClick={() => setPanel((p) => (p === 'allocate' ? null : 'allocate'))}
            disabled={!!pending}
          >
            Allocate
          </Button>
        )}
        {canManage && status === 'verified' && (
          <Button
            variant="destructive"
            onClick={() => setPanel((p) => (p === 'bounce' ? null : 'bounce'))}
            disabled={!!pending}
          >
            Mark bounced
          </Button>
        )}
        {isAdmin && status === 'cleared' && (
          <Button
            variant="destructive"
            onClick={() => setPanel((p) => (p === 'refund' ? null : 'refund'))}
            disabled={!!pending}
          >
            Refund
          </Button>
        )}
        <Button variant="default" onClick={doDownload} disabled={!!pending}>
          {pending === 'download' ? 'Preparing…' : 'Download receipt'}
        </Button>
        {canManage && (
          <Button variant="default" onClick={doSend} disabled={!!pending}>
            {pending === 'send' ? 'Queuing…' : 'Send receipt'}
          </Button>
        )}
      </div>

      {panel === 'allocate' && (
        <div className="border-line w-[460px] space-y-2 rounded-[6px] border bg-white p-4">
          <div className="text-ink text-[13px] font-semibold">Allocate {paymentNumber}</div>
          <p className="text-mute text-[12px]">
            Unallocated: <span className="mono">{formatINRExact(unallocatedAmount)}</span>. Enter an
            amount against the dealer&apos;s outstanding orders.
          </p>
          {outstandingOrders.length === 0 ? (
            <p className="text-mute text-[12px]">This dealer has no outstanding orders.</p>
          ) : (
            <ul className="space-y-1.5">
              {outstandingOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="mono">{o.orderNumber}</span>
                  <span className="text-mute text-[11.5px]">
                    outstanding {formatINRExact(o.outstanding)}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={amounts[o.id] ?? ''}
                    onChange={(e) => setAmounts((m) => ({ ...m, [o.id]: e.target.value }))}
                    className="border-line bg-paper focus:ring-accent mono h-8 w-28 rounded-[4px] border px-2 text-[12.5px] focus:outline-none focus:ring-1"
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setPanel(null)}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={doAllocate}
              disabled={!!pending || outstandingOrders.length === 0}
            >
              {pending === 'allocate' ? 'Allocating…' : 'Allocate'}
            </Button>
          </div>
        </div>
      )}

      {(panel === 'bounce' || panel === 'refund') && (
        <div className="border-line w-[380px] space-y-2 rounded-[6px] border bg-white p-3">
          <label className="text-ink block text-[12px] font-medium">
            {panel === 'bounce' ? 'Bounce reason' : 'Refund reason'}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
            placeholder={panel === 'bounce' ? 'e.g., cheque returned' : 'e.g., duplicate payment'}
          />
          <p className="text-mute text-[11.5px]">
            This reverses every allocation of this payment — affected orders may regress to unpaid.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={panel === 'bounce' ? doBounce : doRefund}
              disabled={!!pending}
            >
              {pending ? 'Working…' : panel === 'bounce' ? 'Confirm bounce' : 'Confirm refund'}
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
