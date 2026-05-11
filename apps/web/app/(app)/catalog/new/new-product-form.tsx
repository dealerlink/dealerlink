'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createProduct } from '@/lib/actions/products';

const SUGGESTED_SPEC_FIELDS: Record<string, string[]> = {
  'Solar Panel': ['wattage', 'voltage', 'cells', 'efficiency', 'warranty_years', 'weight'],
  Inverter: ['capacity_kw', 'phases', 'mppt', 'warranty_years'],
  Battery: ['capacity_kwh', 'chemistry', 'cycles', 'warranty_years'],
};

const INITIAL = {
  sku: '',
  name: '',
  description: '',
  manufacturer: '',
  model: '',
  hsnCode: '',
  gstRate: '18',
  category: 'Solar Panel',
  subcategory: '',
  mrp: '',
  defaultPurchasePrice: '',
  defaultSellingPrice: '',
  requiresSerial: true,
  unitOfMeasure: 'Nos',
};

export function NewProductForm() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof INITIAL, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v as never }));

  const suggested = useMemo(() => {
    const list = SUGGESTED_SPEC_FIELDS[form.category] ?? [];
    return list.filter((k) => !(k in specs));
  }, [form.category, specs]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Numeric specs come in as strings; pass through — Zod accepts them.
      const result = await createProduct({
        sku: form.sku,
        name: form.name,
        description: form.description,
        manufacturer: form.manufacturer,
        model: form.model,
        hsnCode: form.hsnCode,
        gstRate: Number(form.gstRate),
        category: form.category,
        subcategory: form.subcategory,
        specs,
        mrp: form.mrp ? Number(form.mrp) : null,
        defaultPurchasePrice: form.defaultPurchasePrice ? Number(form.defaultPurchasePrice) : null,
        defaultSellingPrice: form.defaultSellingPrice ? Number(form.defaultSellingPrice) : null,
        requiresSerial: form.requiresSerial,
        unitOfMeasure: form.unitOfMeasure,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/catalog/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6">
      {error && (
        <div className="border-rose bg-rose/10 text-rose rounded-[5px] border px-3 py-2 text-[12.5px]">
          {error}
        </div>
      )}

      <Card title="Identity">
        <Lbl label="SKU *">
          <Input required value={form.sku} onChange={(e) => set('sku', e.target.value)} />
        </Lbl>
        <Lbl label="Name *">
          <Input required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Lbl>
        <Lbl label="Manufacturer">
          <Input value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} />
        </Lbl>
        <Lbl label="Model">
          <Input value={form.model} onChange={(e) => set('model', e.target.value)} />
        </Lbl>
        <Lbl label="Category">
          <Input value={form.category} onChange={(e) => set('category', e.target.value)} />
        </Lbl>
        <Lbl label="Subcategory (e.g., TOPCon, Bifacial)">
          <Input value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)} />
        </Lbl>
      </Card>

      <Card title="Tax & pricing">
        <Lbl label="HSN code *">
          <Input
            required
            placeholder="4-8 digits"
            value={form.hsnCode}
            onChange={(e) => set('hsnCode', e.target.value)}
          />
        </Lbl>
        <Lbl label="GST rate *">
          <select
            value={form.gstRate}
            onChange={(e) => set('gstRate', e.target.value)}
            className="border-line h-[34px] w-full rounded-[5px] border bg-white px-2 text-[13px]"
          >
            {[0, 5, 12, 18, 28].map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </Lbl>
        <Lbl label="MRP (₹)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.mrp}
            onChange={(e) => set('mrp', e.target.value)}
          />
        </Lbl>
        <Lbl label="Default purchase price (₹)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.defaultPurchasePrice}
            onChange={(e) => set('defaultPurchasePrice', e.target.value)}
          />
        </Lbl>
        <Lbl label="Default selling price (₹)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.defaultSellingPrice}
            onChange={(e) => set('defaultSellingPrice', e.target.value)}
          />
        </Lbl>
        <Lbl label="Unit of measure">
          <Input
            value={form.unitOfMeasure}
            onChange={(e) => set('unitOfMeasure', e.target.value)}
          />
        </Lbl>
      </Card>

      <Card title="Inventory behavior">
        <label className="col-span-2 flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.requiresSerial}
            onChange={(e) => set('requiresSerial', e.target.checked)}
          />
          Requires serial number on every inventory item
        </label>
      </Card>

      <Card title="Specifications">
        <div className="col-span-2">
          {Object.entries(specs).map(([k, v]) => (
            <div key={k} className="mb-2 flex items-center gap-2">
              <span className="text-mute mono w-[140px] text-[11.5px]">{k}</span>
              <Input
                value={v}
                onChange={(e) => setSpecs({ ...specs, [k]: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const next = { ...specs };
                  delete next[k];
                  setSpecs(next);
                }}
              >
                ×
              </Button>
            </div>
          ))}
          {suggested.length > 0 && (
            <div className="text-mute mt-3 text-[11.5px]">
              Suggested for {form.category}:{' '}
              {suggested.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpecs({ ...specs, [s]: '' })}
                  className="border-line hover:bg-paper-2 ml-1 rounded-[3px] border bg-white px-1.5 py-[2px] text-[11px]"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={() => router.push('/catalog')}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line rounded-[6px] border bg-white">
      <header className="border-line border-b px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{title}</h2>
      </header>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4">{children}</div>
    </section>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-mute mb-1 text-[11px] uppercase tracking-[0.06em]">{label}</div>
      {children}
    </label>
  );
}
