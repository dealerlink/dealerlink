'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createProcurement } from '@/lib/actions/procurements';
import { formatINRExact } from '@/lib/format';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  defaultPurchasePrice: string | null;
  manufacturer: string | null;
  hsnCode: string;
}

interface Line {
  uid: number;
  productId: string;
  quantity: number;
  unitPrice: number;
}

export function NewProcurementForm({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [procurementDate, setProcurementDate] = useState(today);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { uid: 1, productId: '', quantity: 1, unitPrice: 0 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  function addLine() {
    setLines((ls) => [
      ...ls,
      { uid: (ls[ls.length - 1]?.uid ?? 0) + 1, productId: '', quantity: 1, unitPrice: 0 },
    ]);
  }

  function removeLine(uid: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.uid !== uid) : ls));
  }

  function updateLine(uid: number, patch: Partial<Line>) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.uid !== uid) return l;
        const next = { ...l, ...patch };
        if (patch.productId && !patch.unitPrice) {
          const p = products.find((x) => x.id === patch.productId);
          if (p?.defaultPurchasePrice) next.unitPrice = Number(p.defaultPurchasePrice);
        }
        return next;
      }),
    );
  }

  function submit() {
    setError(null);
    if (!supplierName.trim()) {
      setError('Supplier name is required');
      return;
    }
    const valid = lines.every((l) => l.productId && l.quantity > 0 && l.unitPrice >= 0);
    if (!valid) {
      setError('Each line must have a product, positive quantity, and a unit price');
      return;
    }
    startTransition(async () => {
      const result = await createProcurement({
        procurementDate,
        supplierName: supplierName.trim(),
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate: invoiceDate.trim(),
        notes: notes.trim(),
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/inventory/procurements/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
      <div className="border-line space-y-4 rounded-[6px] border bg-white p-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Procurement date">
            <Input
              type="date"
              value={procurementDate}
              onChange={(e) => setProcurementDate(e.target.value)}
            />
          </Field>
          <Field label="Supplier">
            <Input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Premier Energies"
            />
          </Field>
          <Field label="Invoice number">
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
          <Field label="Invoice date">
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="border-line w-full rounded-[5px] border bg-white px-3 py-2 text-[13px]"
          />
        </Field>

        <div>
          <div className="titlecaps mb-2">Line items</div>
          <div className="space-y-2">
            {lines.map((l) => {
              const product = products.find((p) => p.id === l.productId);
              const lineTotal = l.quantity * l.unitPrice;
              return (
                <div
                  key={l.uid}
                  className="border-line grid grid-cols-[1fr_90px_120px_120px_36px] items-center gap-2 rounded-[5px] border p-2"
                >
                  <select
                    value={l.productId}
                    onChange={(e) => updateLine(l.uid, { productId: e.target.value })}
                    className="border-line h-[34px] rounded-[4px] border bg-white px-2 text-[12.5px]"
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) => updateLine(l.uid, { quantity: Number(e.target.value) })}
                    className="mono"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) => updateLine(l.uid, { unitPrice: Number(e.target.value) })}
                    className="mono"
                  />
                  <div className="mono text-right text-[12.5px]">{formatINRExact(lineTotal)}</div>
                  <button
                    type="button"
                    onClick={() => removeLine(l.uid)}
                    className="text-mute hover:text-rose-600"
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                  {product && (
                    <div className="text-mute mono col-span-5 text-[11px]">
                      HSN {product.hsnCode} · {product.manufacturer ?? '—'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Button variant="default" onClick={addLine} className="mt-2">
            + Add line
          </Button>
        </div>
        {error && <div className="text-[12.5px] text-rose-700">{error}</div>}
      </div>

      <aside className="border-line space-y-3 rounded-[6px] border bg-white p-5">
        <div className="titlecaps">Summary</div>
        <div className="text-mute text-[12.5px]">Lines</div>
        <div className="mono text-[18px]">{lines.length}</div>
        <div className="text-mute text-[12.5px]">Total</div>
        <div className="mono text-[22px] font-semibold">{formatINRExact(total)}</div>
        <Button variant="primary" onClick={submit} disabled={pending} className="w-full">
          {pending ? 'Saving…' : 'Save as draft'}
        </Button>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-mute mb-1 text-[11.5px] uppercase tracking-[0.05em]">{label}</div>
      {children}
    </label>
  );
}
