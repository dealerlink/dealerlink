'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { convertQuotationToPi } from '@/lib/actions/pi/convert-quotation-to-pi';
import { previewKey, type PlaceOfSupplyPreviewMap } from '@/lib/tax/place-of-supply-preview';
import {
  DeliveryArrangementField,
  type ArrangementValue,
} from '@/components/tax/delivery-arrangement-field';

interface DealerOption {
  id: string;
  name: string;
  state: string;
}

interface Props {
  quotationId: string;
  quoteNumber: string;
  billTo: DealerOption;
  quotationPlaceOfSupply: string;
  defaultValidUntil: string;
  defaultTerms: string;
  dealers: DealerOption[];
  /**
   * Every (Ship-To, arrangement) classification, derived on the server (D-8).
   *
   * The local `classification()` helper this replaced restated CLAUDE.md §5's
   * inter/intra rule client-side. Adding the §10(1)(a)/(b) branch to it would have
   * made a third copy of a rule that is supposed to have one home, and a drifted
   * copy shows a FALSE tax type to the person choosing the arrangement.
   */
  previews: PlaceOfSupplyPreviewMap;
}

export function ConvertToPiForm({
  quotationId,
  quoteNumber,
  billTo,
  quotationPlaceOfSupply,
  defaultValidUntil,
  defaultTerms,
  dealers,
  previews,
}: Props) {
  const router = useRouter();
  const [shipToId, setShipToId] = useState(billTo.id);
  const [arrangement, setArrangement] = useState<ArrangementValue>('s10_1_a');
  const [validUntil, setValidUntil] = useState(defaultValidUntil);
  const [terms, setTerms] = useState(defaultTerms);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shipTo = useMemo(
    () => dealers.find((d) => d.id === shipToId) ?? billTo,
    [dealers, shipToId, billTo],
  );

  const shipToDiffers = shipToId !== billTo.id;

  // Both classifications come from the server-built table (D-8). Nothing here
  // computes tax; the arrangement is only asked when the parties differ, so the
  // 'none' entry is the one that applies otherwise.
  const original = previews[previewKey(billTo.id, 'none')];
  const current = previews[previewKey(shipToId, shipToDiffers ? arrangement : 'none')];
  const originalClass = original?.taxLabel ?? '—';
  const newClass = current?.taxLabel ?? '—';
  // NO FALLBACK TO `shipTo.state`. That would silently reinstate the §10(1)(a)
  // assumption this change exists to remove, and it would look plausible — a real
  // state code beside a total computed from a different one. An empty string
  // renders as an em dash, which is visibly "not known" rather than quietly wrong.
  const newPlaceOfSupply = current?.placeOfSupply ?? '';
  const taxFlips = shipToDiffers && Boolean(current) && newClass !== originalClass;

  async function submit() {
    setPending(true);
    setError(null);
    const r = await convertQuotationToPi({
      quotationId,
      shipToDealerId: shipToId,
      // Only sent when the parties differ. The server clears it in that case
      // anyway (convert-quotation-to-pi.ts), so this is agreement, not reliance.
      deliveryArrangement: shipToDiffers ? arrangement : undefined,
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
        {shipToDiffers && (
          <DeliveryArrangementField
            value={arrangement}
            onChange={setArrangement}
            billToName={billTo.name}
            shipToName={shipTo.name}
          />
        )}
      </section>

      {taxFlips && (
        <div className="rounded-[6px] border border-amber-300 bg-amber-50 px-4 py-3 text-[13px]">
          <div className="font-semibold text-amber-900">Tax classification will change</div>
          <p className="mt-1 text-amber-800">
            Ship-To moves the place of supply from{' '}
            <span className="mono">{quotationPlaceOfSupply}</span> to{' '}
            <span className="mono">{newPlaceOfSupply}</span> — tax changes from{' '}
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
            <span className="mono">{newPlaceOfSupply}</span>) — tax classification is unchanged (
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
          {/*
            From the server preview, NOT from `shipTo.state`. This line read the
            ship-to state directly, which is correct only under §10(1)(a) — under
            (b) the place of supply is the Bill-To state, and this would have
            displayed the wrong one beside a correctly computed total.
          */}
          Place of supply: <span className="mono text-ink">{newPlaceOfSupply || '—'}</span>
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
