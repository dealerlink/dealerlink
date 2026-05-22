'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { PdfProgress } from '@/components/ui/pdf-progress';
import { deleteQuotation } from '@/lib/actions/quotations/delete-quotation';
import { downloadQuotationPdf } from '@/lib/actions/quotations/download-pdf';
import { emailQuotationPdf } from '@/lib/actions/quotations/email-pdf';
import { generateQuotationPdf } from '@/lib/actions/quotations/generate-pdf';
import { reviseQuotation } from '@/lib/actions/quotations/revise-quotation';
import {
  markQuotationAccepted,
  markQuotationRejected,
  sendQuotation,
} from '@/lib/actions/quotations/status-transitions';

type QuotationRole = 'admin' | 'sales' | 'accounts' | 'dispatch' | 'operator';

interface Props {
  id: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'superseded';
  quoteNumber: string;
  isAdmin: boolean;
  canEdit: boolean;
  role: QuotationRole;
  dealerEmail: string | null;
  /** ISO string of the most recent PDF render, or null if never generated. */
  lastGeneratedAt: string | null;
}

type Pending = null | 'send' | 'accept' | 'reject' | 'revise' | 'delete' | 'pdf' | 'email';

/** Decode a base64 string into a Blob for a browser download. */
function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function QuotationActions({
  id,
  status,
  quoteNumber,
  isAdmin,
  canEdit,
  role,
  dealerEmail,
  lastGeneratedAt,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(dealerEmail ?? '');
  const [emailSubject, setEmailSubject] = useState(`Quotation ${quoteNumber}`);
  const [emailBody, setEmailBody] = useState(
    `Dear customer,\n\nPlease find attached quotation ${quoteNumber}.\n\nRegards`,
  );

  const canDownloadPdf = role === 'admin' || role === 'sales' || role === 'accounts';
  const canEmailPdf = role === 'admin' || role === 'sales';

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

  async function doDownload() {
    setPending('pdf');
    setError(null);
    setNotice(null);
    const r = await downloadQuotationPdf({ id });
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
    if (!confirm('Regenerate the PDF? A fresh copy will be rendered from the current data.'))
      return;
    setPending('pdf');
    setError(null);
    setNotice(null);
    const r = await generateQuotationPdf({ id });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setNotice('PDF regenerated.');
    router.refresh();
    setPending(null);
  }

  async function doEmail() {
    if (!emailTo.trim() || !emailSubject.trim()) {
      setError('Recipient and subject are required.');
      return;
    }
    setPending('email');
    setError(null);
    const r = await emailQuotationPdf({
      id,
      recipient: emailTo.trim(),
      subject: emailSubject.trim(),
      body: emailBody.trim() || undefined,
    });
    if (!r.ok) {
      setError(r.error.message);
      setPending(null);
      return;
    }
    setEmailOpen(false);
    setNotice('Quotation PDF queued for delivery.');
    setPending(null);
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
        {status === 'accepted' && canEdit && (
          <Button asChild variant="primary">
            <a href={`/quotations/${id}/convert-to-pi`}>Convert to PI</a>
          </Button>
        )}
        {(status === 'accepted' || status === 'rejected' || status === 'expired') && canEdit && (
          <Button variant="default" onClick={doRevise} disabled={!!pending}>
            {pending === 'revise' ? 'Creating…' : 'Revise'}
          </Button>
        )}
      </div>

      {/* PDF actions — available regardless of quotation status. */}
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
        {canEmailPdf && (
          <Button variant="default" onClick={() => setEmailOpen((o) => !o)} disabled={!!pending}>
            Email PDF
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

      {emailOpen && (
        <div className="border-line w-[340px] space-y-2 rounded-[6px] border bg-white p-3">
          <div className="text-ink text-[12px] font-medium">Email quotation PDF</div>
          <div className="space-y-1">
            <label className="text-mute block text-[11px]">Recipient</label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
              placeholder="dealer@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-mute block text-[11px]">Subject</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
            />
          </div>
          <div className="space-y-1">
            <label className="text-mute block text-[11px]">Message</label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={4}
              className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="default" onClick={() => setEmailOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="accent" onClick={doEmail} disabled={!!pending}>
              {pending === 'email' ? 'Queuing…' : 'Send'}
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <div className="border-line rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-700">
          {notice}
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
