'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { convertQuotationToPi } from '@/lib/actions/pi/convert-quotation-to-pi';

interface DealerOption {
  id: string;
  name: string;
  state: string;
}

interface Props {
  quotationId: string;
  quoteNumber: string;
  billTo: DealerOption;
  tenantState: string;
  quotationPlaceOfSupply: string;
  defaultValidUntil: string;
  defaultTerms: string;
  dealers: DealerOption[];
}

function classification(tenantState: string, placeOfSupply: string): 'IGST' | 'CGST + SGST' {
  return tenantState.trim() !== placeOfSupply.trim() ? 'IGST' : 'CGST + SGST';
}

export function ConvertToPiForm({
  quotationId,
  quoteNumber,
  billTo,
  tenantState,
  quotationPlaceOfSupply,
  defaultValidUntil,
  defaultTerms,
  dealers,
}: Props) {
  const router = useRouter();
  const [shipToId, setShipToId] = useState(billTo.id);
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [terms, setTerms] = useState(defaultTerms);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shipTo = useMemo(
    () => dealers.find((d) => d.id === shipToId) ?? billTo,
    [dealers, shipToId, billTo],
  );

  // Original quotation tax classification vs the classification this PI will
  // carry once place-of-supply follows the chosen Ship-To (ADR-012).
  const originalClass = classification(tenantState, quotationPlaceOfSupply);
  const newClass = classification(tenantState, shipTo.state);
  const shipToDiffers = shipToId !== billTo.id;
  const taxFlips = shipToDiffers && newClass !== originalClass;

  async function submit() {
    setPending(true);
    setError(null);
    const r = await convertQuotationToPi({
      quotationId,
      shipToDealerId: shipToId,
      validUntil,
      termsAndConditions: terms.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    if (!r.ok) {
      setError(r.error.message);
      setPending(false);
      return;
    }
    router.push(`/pi/${r.data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="border-line rounded-[6px] border bg-white p-5">
        <div className="titlecaps text-mute mb-3">Parties</div>
        <div className="mb-4 text-[13px]">
          <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">Bill to</div>
          <div className="text-ink font-medium">{billTo.name}</div>
          <div className="text-mute mono text-[12px]">{billTo.state || '—'}</div>
        </div>
        <label className="text-ink mb-1 block text-[12px] font-medium">
          Ship to <span className="text-mute font-normal">— defaults to the Bill-To dealer</span>
        </label>
        <select
          value={shipToId}
          onChange={(e) => setShipToId(e.target.value)}
          className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        >
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.state || '—'}){d.id === billTo.id ? ' — same as Bill-To' : ''}
            </option>
          ))}
        </select>
      </section>

      {taxFlips && (
        <div className="rounded-[6px] border border-amber-300 bg-amber-50 px-4 py-3 text-[13px]">
          <div className="font-semibold text-amber-900">Tax classification will change</div>
          <p className="mt-1 text-amber-800">
            Ship-To moves the place of supply from{' '}
            <span className="mono">{quotationPlaceOfSupply}</span> to{' '}
            <span className="mono">{shipTo.state}</span> — tax changes from{' '}
            <span className="font-medium">{originalClass}</span> to{' '}
            <span className="font-medium">{newClass}</span>. The total is recomputed when you create
            the PI.
          </p>
        </div>
      )}
      {shipToDiffers && !taxFlips && (
        <div className="border-line rounded-[6px] border bg-white px-4 py-3 text-[12.5px]">
          <span className="text-ink font-medium">Three-party PI.</span>{' '}
          <span className="text-mute">
            Ship-To differs from Bill-To but stays in the same place of supply (
            <span className="mono">{shipTo.state}</span>) — tax classification is unchanged (
            {newClass}).
          </span>
        </div>
      )}

      <section className="border-line grid grid-cols-2 gap-4 rounded-[6px] border bg-white p-5">
        <div>
          <label className="text-ink mb-1 block text-[12px] font-medium">Valid until</label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          />
        </div>
        <div className="text-mute self-end text-[12px]">
          Place of supply: <span className="mono text-ink">{shipTo.state || '—'}</span>
        </div>
      </section>

      <section className="border-line rounded-[6px] border bg-white p-5">
        <label className="text-ink mb-1 block text-[12px] font-medium">
          Terms &amp; conditions
        </label>
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={4}
          className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
        />
        <label className="text-ink mb-1 mt-3 block text-[12px] font-medium">Internal notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
          placeholder="Optional — not shown on the PDF"
        />
      </section>

      {error && (
        <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? 'Creating PI…' : 'Create draft PI'}
        </Button>
        <span className="text-mute text-[12px]">
          Creates a draft PI from {quoteNumber}; you can review before sending.
        </span>
      </div>
    </div>
  );
}
