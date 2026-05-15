'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { markQuotationAccepted } from '@/lib/actions/quotations/status-transitions';
import { markQuotationRejected } from '@/lib/actions/quotations/status-transitions';
import { sendQuotation } from '@/lib/actions/quotations/status-transitions';
import { reviseQuotation } from '@/lib/actions/quotations/revise-quotation';
import { deleteQuotation } from '@/lib/actions/quotations/delete-quotation';

interface Props {
  id: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'superseded';
  quoteNumber: string;
  isAdmin: boolean;
  canEdit: boolean;
}

type Pending = null | 'send' | 'accept' | 'reject' | 'revise' | 'delete';

export function QuotationActions({ id, status, quoteNumber, isAdmin, canEdit }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  async function doSend() {
    if (!confirm(`Send ${quoteNumber} to the dealer?`)) return;
    setPending('send');
    setError(null);
    const r = await sendQuotation({ id, via: 'email' });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    router.refresh();
    setPending(null);
  }

  async function doAccept() {
    setPending('accept');
    setError(null);
    const r = await markQuotationAccepted({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    router.refresh();
    setPending(null);
  }

  async function doReject() {
    if (!rejectReason.trim()) {
      setError('Rejection reason is required.');
      return;
    }
    setPending('reject');
    setError(null);
    const r = await markQuotationRejected({ id, reason: rejectReason.trim() });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setRejectOpen(false);
    router.refresh();
    setPending(null);
  }

  async function doRevise() {
    setPending('revise');
    setError(null);
    const r = await reviseQuotation({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    router.push(`/quotations/${r.data.id}/edit`);
    router.refresh();
  }

  async function doDelete() {
    if (!confirm(`Delete draft ${quoteNumber}? This cannot be undone.`)) return;
    setPending('delete');
    setError(null);
    const r = await deleteQuotation({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    router.push('/quotations');
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === 'draft' && canEdit && (
          <>
            <Button asChild variant="default">
              <a href={`/quotations/${id}/edit`}>Edit</a>
            </Button>
            <Button variant="accent" onClick={doSend} disabled={!!pending}>
              {pending === 'send' ? 'Sending…' : 'Send'}
            </Button>
            {isAdmin && (
              <Button variant="destructive" onClick={doDelete} disabled={!!pending}>
                Delete
              </Button>
            )}
          </>
        )}
        {status === 'sent' && canEdit && (
          <>
            <Button variant="primary" onClick={doAccept} disabled={!!pending}>
              {pending === 'accept' ? 'Saving…' : 'Mark accepted'}
            </Button>
            <Button variant="default" onClick={() => setRejectOpen((o) => !o)}>
              Mark rejected
            </Button>
            <Button variant="default" onClick={doRevise} disabled={!!pending}>
              {pending === 'revise' ? 'Creating…' : 'Revise'}
            </Button>
          </>
        )}
        {(status === 'accepted' || status === 'rejected' || status === 'expired') && canEdit && (
          <Button variant="default" onClick={doRevise} disabled={!!pending}>
            {pending === 'revise' ? 'Creating…' : 'Revise'}
          </Button>
        )}
      </div>
      {rejectOpen && (
        <div className="border-line space-y-2 rounded-[6px] border bg-white p-3">
          <label className="text-ink block text-[12px] font-medium">Rejection reason</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
            placeholder="e.g., dealer chose a competitor offer"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={doReject} disabled={!!pending}>
              Confirm reject
            </Button>
          </div>
        </div>
      )}
      {error && (
        <div className="border-line rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}
