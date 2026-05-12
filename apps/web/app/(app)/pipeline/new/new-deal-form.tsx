'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createDeal } from '@/lib/actions/deals';
import { DEAL_SOURCES } from '@dealerlink/schemas';

interface Option {
  id: string;
  label: string;
}

interface ProductLine {
  productId: string;
  estimatedQuantity: string;
  notes: string;
}

const INITIAL = {
  title: '',
  dealerId: '',
  estimatedValue: '',
  probabilityPercent: '',
  expectedCloseDate: '',
  source: 'outbound' as (typeof DEAL_SOURCES)[number],
  notes: '',
  hot: false,
};

const EMPTY_LINE: ProductLine = { productId: '', estimatedQuantity: '1', notes: '' };

interface Props {
  dealers: Option[];
  products: Option[];
}

export function NewDealForm({ dealers, products }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof INITIAL>(k: K, v: (typeof INITIAL)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await createDeal({
        title: form.title,
        dealerId: form.dealerId,
        estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
        probabilityPercent: form.probabilityPercent ? Number(form.probabilityPercent) : null,
        expectedCloseDate: form.expectedCloseDate || null,
        source: form.source,
        notes: form.notes,
        hot: form.hot,
        products: lines
          .filter((l) => l.productId)
          .map((l) => ({
            productId: l.productId,
            estimatedQuantity: Number(l.estimatedQuantity) || 1,
            notes: l.notes,
          })),
      });
      if (!result.ok) {
        setError(result.error.message);
        setSaving(false);
        return;
      }
      router.push(`/pipeline/${result.data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deal');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6">
      <section className="border-line space-y-3 rounded-[6px] border bg-white p-5">
        <div className="titlecaps text-mute mb-2">Deal</div>
        <Field label="Title" required>
          <Input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Q3 commercial rooftop — 120 panels"
            required
            maxLength={200}
          />
        </Field>
        <Field label="Dealer" required>
          <select
            value={form.dealerId}
            onChange={(e) => set('dealerId', e.target.value)}
            required
            className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
          >
            <option value="">Select a dealer…</option>
            {dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Est. value (₹)">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.estimatedValue}
              onChange={(e) => set('estimatedValue', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Probability %">
            <Input
              type="number"
              min="0"
              max="100"
              value={form.probabilityPercent}
              onChange={(e) => set('probabilityPercent', e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Expected close">
            <Input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => set('expectedCloseDate', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <select
              value={form.source}
              onChange={(e) => set('source', e.target.value as (typeof DEAL_SOURCES)[number])}
              className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
            >
              {DEAL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hot deal">
            <label className="text-ink mt-2 inline-flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={form.hot}
                onChange={(e) => set('hot', e.target.checked)}
              />
              Mark as hot
            </label>
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
          />
        </Field>
      </section>

      <section className="border-line rounded-[6px] border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="titlecaps text-mute">Products (optional)</div>
          <Button
            type="button"
            variant="default"
            onClick={() => setLines((ls) => [...ls, EMPTY_LINE])}
          >
            + Add product
          </Button>
        </div>
        {lines.length === 0 ? (
          <p className="text-mute editorial text-[12.5px] italic">
            No products linked yet — you can add them later from the deal page.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_90px_1fr_28px] items-center gap-2">
                <select
                  value={l.productId}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x, i) => (i === idx ? { ...x, productId: e.target.value } : x)),
                    )
                  }
                  className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
                >
                  <option value="">Select…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min="1"
                  value={l.estimatedQuantity}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x, i) =>
                        i === idx ? { ...x, estimatedQuantity: e.target.value } : x,
                      ),
                    )
                  }
                />
                <Input
                  value={l.notes}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)),
                    )
                  }
                  placeholder="Notes"
                  maxLength={500}
                />
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                  className="text-mute hover:text-rose-700"
                  aria-label="Remove line"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="border-line rounded-[6px] border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] text-rose-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="default" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !form.title || !form.dealerId}>
          {saving ? 'Creating…' : 'Create deal'}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-ink mb-1 block text-[12px] font-medium">
        {label}
        {required && <span className="text-rose-700"> *</span>}
      </label>
      {children}
    </div>
  );
}
