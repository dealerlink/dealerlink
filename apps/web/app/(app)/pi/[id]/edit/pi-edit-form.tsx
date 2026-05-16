'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { updatePi } from '@/lib/actions/pi/update-pi';

interface DealerOption {
  id: string;
  name: string;
  state: string;
}

interface LineSnapshot {
  productId: string;
  productSku: string;
  productName: string;
  hsnCode: string;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  gstRate: number;
}

interface Props {
  id: string;
  tenantState: string;
  billToId: string;
  shipToId: string;
  validUntil: string;
  terms: string;
  notes: string;
  dealers: DealerOption[];
  lines: LineSnapshot[];
}

export function PiEditForm({
  id,
  tenantState,
  billToId,
  shipToId: initialShipTo,
  validUntil: initialValidUntil,
  terms: initialTerms,
  notes: initialNotes,
  dealers,
  lines,
}: Props) {
  const router = useRouter();
  const [shipToId, setShipToId] = useState(initialShipTo);
  const [validUntil, setValidUntil] = useState(initialValidUntil);
  const [terms, setTerms] = useState(initialTerms);
  const [notes, setNotes] = useState(initialNotes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shipTo = useMemo(() => dealers.find((d) => d.id === shipToId), [dealers, shipToId]);
  const interState = shipTo ? tenantState.trim() !== shipTo.state.trim() : false;

  async function submit() {
    setPending(true);
    setError(null);
    const r = await updatePi({
      id,
      shipToDealerId: shipToId,
      validUntil,
      termsAndConditions: terms.trim() || null,
      notes: notes.trim() || null,
      lines: lines.map((l) => ({
        productId: l.productId,
        productSku: l.productSku,
        productName: l.productName,
        hsnCode: l.hsnCode,
        quantity: l.quantity,
        unitOfMeasure: l.unitOfMeasure,
        unitPrice: l.unitPrice,
        gstRate: l.gstRate,
      })),
    });
    if (!r.ok) {
      setError(r.error.message);
      setPending(false);
      return;
    }
    router.push(`/pi/${id}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="border-line rounded-[6px] border bg-white p-5">
        <label className="text-ink mb-1 block text-[12px] font-medium">Ship to</label>
        <select
          value={shipToId}
          onChange={(e) => setShipToId(e.target.value)}
          className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        >
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.state || '—'}){d.id === billToId ? ' — same as Bill-To' : ''}
            </option>
          ))}
        </select>
        <p className="text-mute mt-2 text-[12px]">
          Place of supply <span className="mono text-ink">{shipTo?.state || '—'}</span> ·{' '}
          {interState ? 'Inter-state — IGST' : 'Intra-state — CGST + SGST'}. Totals recompute on
          save.
        </p>
      </section>

      <section className="border-line rounded-[6px] border bg-white p-5">
        <label className="text-ink mb-1 block text-[12px] font-medium">Valid until</label>
        <input
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          className="border-line bg-paper focus:ring-accent h-9 w-48 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <label className="text-ink mb-1 mt-3 block text-[12px] font-medium">
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
        />
      </section>

      <section className="border-line rounded-[6px] border bg-white p-5">
        <div className="titlecaps text-mute mb-2">Line items (inherited)</div>
        <ul className="space-y-1 text-[12.5px]">
          {lines.map((l) => (
            <li key={l.productId} className="text-ink flex justify-between">
              <span>
                {l.productName} <span className="text-mute mono">· {l.productSku}</span>
              </span>
              <span className="mono text-mute">
                {l.quantity} {l.unitOfMeasure} @ {l.gstRate}%
              </span>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="primary" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        <Button asChild variant="default">
          <a href={`/pi/${id}`}>Cancel</a>
        </Button>
      </div>
    </div>
  );
}
