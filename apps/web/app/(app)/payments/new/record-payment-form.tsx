'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { recordPayment } from '@/lib/actions/payments';
import { PAYMENT_METHODS } from '@dealerlink/schemas';
import type { PaymentMethod } from '@dealerlink/schemas';

import { paymentMethodLabel } from '../payment-status';

interface DealerOption {
  id: string;
  name: string;
}

interface Props {
  dealers: DealerOption[];
  initialDealerId: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function RecordPaymentForm({ dealers, initialDealerId }: Props) {
  const router = useRouter();
  const [dealerId, setDealerId] = useState(initialDealerId);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [receivedDate, setReceivedDate] = useState(today());
  const [depositedToBank, setDepositedToBank] = useState('');
  const [depositedDate, setDepositedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [allocateNow, setAllocateNow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!dealerId) {
      setError('Select the dealer who paid.');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    setPending(true);
    const r = await recordPayment({
      dealerId,
      amount: amt,
      method,
      reference: reference.trim() || undefined,
      receivedDate,
      depositedToBank: depositedToBank.trim() || undefined,
      depositedDate: depositedDate || undefined,
      notes: notes.trim() || undefined,
    });
    if (!r.ok) {
      setError(r.error.message);
      setPending(false);
      return;
    }
    router.push(`/payments/${r.data.id}${allocateNow ? '?allocate=1' : ''}`);
  }

  return (
    <div className="border-line space-y-4 rounded-[6px] border bg-white p-5">
      <Field label="Dealer (payer)">
        <select
          value={dealerId}
          onChange={(e) => setDealerId(e.target.value)}
          className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        >
          <option value="">Select a dealer…</option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Amount (₹)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="border-line bg-paper focus:ring-accent mono h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          />
        </Field>
        <Field label="Method">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {paymentMethodLabel(m)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Reference (txn / cheque no.)">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Optional"
            className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          />
        </Field>
        <Field label="Received date">
          <input
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Deposited to bank">
          <input
            value={depositedToBank}
            onChange={(e) => setDepositedToBank(e.target.value)}
            placeholder="Optional"
            className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          />
        </Field>
        <Field label="Deposited date">
          <input
            type="date"
            value={depositedDate}
            onChange={(e) => setDepositedDate(e.target.value)}
            className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional"
          className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
        />
      </Field>

      <label className="flex items-center gap-2 text-[12.5px]">
        <input
          type="checkbox"
          checked={allocateNow}
          onChange={(e) => setAllocateNow(e.target.checked)}
        />
        <span className="text-ink">
          Allocate now — jump to the allocation panel after recording (requires verification first)
        </span>
      </label>

      {error && (
        <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="default" onClick={() => router.push('/payments')}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={submit} disabled={pending}>
          {pending ? 'Recording…' : 'Record payment'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-ink mb-1 block text-[12px] font-medium">{label}</label>
      {children}
    </div>
  );
}
