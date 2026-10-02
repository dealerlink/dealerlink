'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { createCreditNote, createDebitNote } from '@/lib/actions/invoices/create-note';

interface Line {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Raise a credit or debit note against this invoice.
 *
 * ## ADMIN ONLY, AND THAT IS THE POINT OF THE SEPARATE FLAG (F6 D-8)
 *
 * Accounts issues the invoice; **Admin alone** issues the notes that reduce or
 * increase what the dealer owes. Reducing a receivable is different authority from
 * raising one. The prop is `isAdmin` rather than a reused "can do invoice things"
 * flag precisely so the two rules cannot drift into one.
 *
 * **The server enforces it independently.** `createCreditNote` and
 * `createDebitNote` are both `tenantAction(['admin'], …)`, so hiding this block
 * from Accounts is a courtesy, not the control — CLAUDE.md §6: hiding a button is
 * not security.
 *
 * ## ONE LINE, FULL QUANTITY, DELIBERATELY SIMPLE
 *
 * Phase 1 raises a note for a whole line. **A fully-reversed line is expressed by
 * OMITTING it**, never by sending quantity 0 — `computeTax`'s bound is
 * `quantity > 0` (executed, not read), while `unitPrice >= 0` accepts a zero price.
 * So a free line is expressible and a nil-quantity line is not, and the engine's
 * error for the latter is misleadingly named `NEGATIVE_QUANTITY` (F.159). Partial
 * quantities are a later question.
 */
export function InvoiceActions({
  invoiceId,
  invoiceNumber,
  isAdmin,
  cancelled,
  lines,
}: {
  invoiceId: string;
  invoiceNumber: string;
  isAdmin: boolean;
  cancelled: boolean;
  lines: Line[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<null | 'credit' | 'debit'>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin || cancelled || lines.length === 0) return null;

  async function submit(kind: 'credit' | 'debit') {
    setPending(true);
    setError(null);
    const input = {
      invoiceId,
      reason,
      lines: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    };
    const r = kind === 'credit' ? await createCreditNote(input) : await createDebitNote(input);
    setPending(false);
    if (r.ok) {
      setOpen(null);
      setReason('');
      router.refresh();
    } else {
      // The action's own message. A zero-quantity line, a cancelled invoice or a
      // missing product each produce a distinct sentence the spec can assert on.
      setError(r.error.message);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="default"
          data-testid="raise-credit-note"
          onClick={() => setOpen((o) => (o === 'credit' ? null : 'credit'))}
          disabled={pending}
        >
          Raise credit note
        </Button>
        <Button
          variant="default"
          data-testid="raise-debit-note"
          onClick={() => setOpen((o) => (o === 'debit' ? null : 'debit'))}
          disabled={pending}
        >
          Raise debit note
        </Button>
      </div>

      {open && (
        <div className="border-line space-y-2 rounded-[5px] border bg-white p-3">
          <p className="text-mute text-[12px]">
            {open === 'credit'
              ? `A credit note REDUCES what the dealer owes against ${invoiceNumber}.`
              : `A debit note INCREASES what the dealer owes against ${invoiceNumber}.`}{' '}
            The invoice itself is not changed — it cannot be.
          </p>
          <input
            data-testid="note-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required)"
            className="border-line w-full rounded-[4px] border px-2 py-1.5 text-[12.5px]"
          />
          <Button
            variant="primary"
            data-testid={open === 'credit' ? 'submit-credit-note' : 'submit-debit-note'}
            onClick={() => void submit(open)}
            disabled={pending || reason.trim().length < 3}
          >
            {pending ? 'Issuing…' : open === 'credit' ? 'Issue credit note' : 'Issue debit note'}
          </Button>
        </div>
      )}

      {error && (
        <p data-testid="invoice-action-error" className="text-[12.5px] text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
