'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { PdfProgress } from '@/components/ui/pdf-progress';
import { downloadPerformaInvoicePdf, generatePerformaInvoicePdf } from '@/lib/actions/pi/pdf';
import { cancelPi, confirmPi, sendPi } from '@/lib/actions/pi/status-transitions';
import type { PerformaInvoiceStatus } from '@dealerlink/schemas';

interface Props {
  id: string;
  piNumber: string;
  status: PerformaInvoiceStatus;
  isAdmin: boolean;
  canEdit: boolean;
  role: 'admin' | 'sales' | 'accounts' | 'dispatch' | 'operator';
  order: { id: string; orderNumber: string } | null;
  lastGeneratedAt: string | null;
}

type Pending = null | 'send' | 'confirm' | 'cancel' | 'pdf';

function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function PiActions({
  id,
  piNumber,
  status,
  isAdmin,
  canEdit,
  role,
  order,
  lastGeneratedAt,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const canDownloadPdf = role === 'admin' || role === 'sales' || role === 'accounts';

  async function doSend() {
    if (!confirm(`Send ${piNumber} to the buyer?`)) return;
    setPending('send');
    setError(null);
    const r = await sendPi({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    router.refresh();
    setPending(null);
  }

  async function doConfirm() {
    if (
      !confirm(
        `Confirm ${piNumber}? This creates an order and advances the linked deal to Payment Pending.`,
      )
    )
      return;
    setPending('confirm');
    setError(null);
    const r = await confirmPi({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setNotice(`Order ${r.data.orderNumber} created.`);
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
    const r = await cancelPi({ id, reason: cancelReason.trim() });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setCancelOpen(false);
    router.refresh();
    setPending(null);
  }

  async function doDownload() {
    setPending('pdf');
    setError(null);
    setNotice(null);
    const r = await downloadPerformaInvoicePdf({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    if (r.data.base64) {
      const blob = base64ToBlob(r.data.base64, r.data.mimeType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } else if (r.data.url) {
      window.open(r.data.url, '_blank');
    }
    setPending(null);
  }

  async function doRegenerate() {
    if (!confirm('Regenerate the PDF from current data?')) return;
    setPending('pdf');
    setError(null);
    setNotice(null);
    const r = await generatePerformaInvoicePdf({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setNotice('PDF regenerated.');
    router.refresh();
    setPending(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'draft' && canEdit && (
          <Button asChild variant="default">
            <a href={`/pi/${id}/edit`}>Edit</a>
          </Button>
        )}
        {status === 'draft' && canEdit && (
          <Button variant="accent" onClick={doSend} disabled={!!pending}>
            {pending === 'send' ? 'Sending…' : 'Send'}
          </Button>
        )}
        {status === 'sent' && canEdit && (
          <Button variant="primary" onClick={doConfirm} disabled={!!pending}>
            {pending === 'confirm' ? 'Confirming…' : 'Confirm PI'}
          </Button>
        )}
        {(status === 'draft' || status === 'sent') && isAdmin && (
          <Button
            variant="destructive"
            onClick={() => setCancelOpen((o) => !o)}
            disabled={!!pending}
          >
            Cancel PI
          </Button>
        )}
        {status === 'confirmed' && order && (
          <Button asChild variant="primary">
            <a href={`/orders/${order.id}`}>View order {order.orderNumber}</a>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canDownloadPdf && (
          <Button variant="default" onClick={doDownload} disabled={!!pending}>
            {pending === 'pdf' ? 'Working…' : 'Download PDF'}
          </Button>
        )}
        {isAdmin && lastGeneratedAt && (
          <Button variant="default" onClick={doRegenerate} disabled={!!pending}>
            Regenerate PDF
          </Button>
        )}
      </div>
      <PdfProgress show={pending === 'pdf'} />
      {lastGeneratedAt && (
        <p className="text-mute text-[11.5px]">
          Last generated:{' '}
          {new Date(lastGeneratedAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      {cancelOpen && (
        <div className="border-line space-y-2 rounded-[6px] border bg-white p-3">
          <label className="text-ink block text-[12px] font-medium">Cancellation reason</label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
            placeholder="e.g., buyer withdrew the order"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setCancelOpen(false)}>
              Keep PI
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
