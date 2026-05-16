'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { createDispatch } from '@/lib/actions/dispatch';
import type { AvailableSerial, DispatchableLine } from '@/lib/queries/dispatch';

interface Props {
  orderId: string;
  orderNumber: string;
  lines: DispatchableLine[];
  serials: AvailableSerial[];
}

const today = () => new Date().toISOString().slice(0, 10);

export function CreateDispatchForm({ orderId, orderNumber, lines, serials }: Props) {
  const router = useRouter();

  // Reserved serials grouped by product — each line picks from its pool.
  const serialsByProduct = useMemo(() => {
    const m = new Map<string, AvailableSerial[]>();
    for (const s of serials) {
      const arr = m.get(s.productId) ?? [];
      arr.push(s);
      m.set(s.productId, arr);
    }
    return m;
  }, [serials]);

  // Selected serial ids per order line.
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [dispatchDate, setDispatchDate] = useState(today());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [transporterDocketNumber, setTransporterDocketNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [ewayBillDate, setEwayBillDate] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A serial may only be picked on one line — track globally.
  const globallySelected = useMemo(() => {
    const all = new Set<string>();
    for (const set of Object.values(selected)) for (const id of set) all.add(id);
    return all;
  }, [selected]);

  function toggle(lineId: string, serialId: string, remaining: number) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set(next[lineId] ?? []);
      if (set.has(serialId)) {
        set.delete(serialId);
      } else {
        if (set.size >= remaining) return prev; // cannot exceed remaining-to-dispatch
        set.add(serialId);
      }
      next[lineId] = set;
      return next;
    });
  }

  function selectUpTo(lineId: string, pool: AvailableSerial[], remaining: number) {
    setSelected((prev) => {
      const next = { ...prev };
      const set = new Set<string>();
      for (const s of pool) {
        if (set.size >= remaining) break;
        if (globallySelected.has(s.id) && !(prev[lineId]?.has(s.id) ?? false)) continue;
        set.add(s.id);
      }
      next[lineId] = set;
      return next;
    });
  }

  const totalSelected = globallySelected.size;

  async function submit() {
    setError(null);
    const payloadLines = lines
      .map((l) => ({
        orderLineId: l.orderLineId,
        serialIds: [...(selected[l.orderLineId] ?? [])],
      }))
      .filter((l) => l.serialIds.length > 0);

    if (payloadLines.length === 0) {
      setError('Pick at least one serial to dispatch.');
      return;
    }

    setPending(true);
    const r = await createDispatch({
      orderId,
      lines: payloadLines,
      dispatchDate,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      vehicleNumber: vehicleNumber.trim() || undefined,
      transporterName: transporterName.trim() || undefined,
      transporterDocketNumber: transporterDocketNumber.trim() || undefined,
      driverName: driverName.trim() || undefined,
      driverPhone: driverPhone.trim() || undefined,
      ewayBillNumber: ewayBillNumber.trim() || undefined,
      ewayBillDate: ewayBillDate || undefined,
      notes: notes.trim() || undefined,
    });
    if (!r.ok) {
      setError(r.error.message);
      setPending(false);
      return;
    }
    router.push(`/dispatch/${r.data.id}`);
  }

  return (
    <div className="space-y-5">
      {/* Line items + serial pickers */}
      <section className="border-line rounded-[6px] border bg-white">
        <div className="titlecaps text-mute border-line border-b px-5 py-3">Line items</div>
        {lines.length === 0 && (
          <div className="text-mute px-5 py-8 text-center text-[13px]">
            This order has no lines to dispatch.
          </div>
        )}
        {lines.map((l) => {
          const pool = serialsByProduct.get(l.productId) ?? [];
          const sel = selected[l.orderLineId] ?? new Set<string>();
          const fullyDone = l.remaining <= 0;
          return (
            <div key={l.orderLineId} className="border-line border-b px-5 py-4 last:border-b-0">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-ink font-medium">{l.productName}</div>
                  <div className="text-mute mono text-[11px]">{l.productSku}</div>
                </div>
                <div className="text-mute flex gap-4 text-[12px]">
                  <span>
                    Ordered <span className="mono text-ink">{l.ordered}</span>
                  </span>
                  <span>
                    Dispatched <span className="mono text-ink">{l.dispatched}</span>
                  </span>
                  <span>
                    Remaining <span className="mono text-ink">{l.remaining}</span>
                  </span>
                </div>
              </div>

              {fullyDone ? (
                <div className="text-mute mt-2 text-[12px]">Fully dispatched.</div>
              ) : (
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-mute text-[12px]">
                      <span className="mono text-ink">{sel.size}</span> of{' '}
                      <span className="mono">{Math.min(l.remaining, pool.length)}</span> serials
                      selected
                    </span>
                    <button
                      type="button"
                      onClick={() => selectUpTo(l.orderLineId, pool, l.remaining)}
                      className="text-accent text-[12px] hover:underline"
                    >
                      Select up to remaining
                    </button>
                  </div>
                  {pool.length === 0 ? (
                    <div className="rounded-[4px] bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
                      No reserved serials available for this product.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {pool.map((s) => {
                        const checked = sel.has(s.id);
                        const takenElsewhere = globallySelected.has(s.id) && !checked;
                        return (
                          <label
                            key={s.id}
                            className={`flex items-center gap-2 rounded-[4px] border px-2 py-1.5 text-[12px] ${
                              checked
                                ? 'border-accent bg-accent/5'
                                : takenElsewhere
                                  ? 'border-line bg-paper-2 opacity-50'
                                  : 'border-line bg-paper'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={takenElsewhere}
                              onChange={() => toggle(l.orderLineId, s.id, l.remaining)}
                            />
                            <span className="mono truncate">{s.serialNumber ?? '(no serial)'}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Logistics */}
      <section className="border-line rounded-[6px] border bg-white p-5">
        <div className="titlecaps text-mute mb-3">Logistics</div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Dispatch date">
            <DateInput value={dispatchDate} onChange={setDispatchDate} />
          </Field>
          <Field label="Expected delivery date">
            <DateInput value={expectedDeliveryDate} onChange={setExpectedDeliveryDate} />
          </Field>
          <Field label="Vehicle number">
            <TextInput
              value={vehicleNumber}
              onChange={setVehicleNumber}
              placeholder="MH-12-AB-1234"
            />
          </Field>
          <Field label="Transporter">
            <TextInput
              value={transporterName}
              onChange={setTransporterName}
              placeholder="Optional"
            />
          </Field>
          <Field label="Transporter docket no.">
            <TextInput
              value={transporterDocketNumber}
              onChange={setTransporterDocketNumber}
              placeholder="Optional"
            />
          </Field>
          <Field label="Driver name">
            <TextInput value={driverName} onChange={setDriverName} placeholder="Optional" />
          </Field>
          <Field label="Driver phone">
            <TextInput value={driverPhone} onChange={setDriverPhone} placeholder="Optional" />
          </Field>
          <Field label="E-way bill number">
            <TextInput value={ewayBillNumber} onChange={setEwayBillNumber} placeholder="Optional" />
          </Field>
          <Field label="E-way bill date">
            <DateInput value={ewayBillDate} onChange={setEwayBillDate} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
              className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
            />
          </Field>
        </div>
      </section>

      {error && (
        <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-mute text-[12.5px]">
          <span className="mono text-ink">{totalSelected}</span> serial(s) selected for{' '}
          {orderNumber}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="default" onClick={() => router.push('/dispatch')}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={submit}
            disabled={pending || totalSelected === 0}
          >
            {pending ? 'Creating…' : 'Create dispatch'}
          </Button>
        </div>
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

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
    />
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
    />
  );
}
