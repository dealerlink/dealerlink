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
  // No hardcoded default: a default rate is a small statutory claim of its own.
  gstRate: '',
  category: 'Solar Panel',
  subcategory: '',
  mrp: '',
  defaultPurchasePrice: '',
  defaultSellingPrice: '',
  requiresSerial: true,
  unitOfMeasure: 'Nos',
};

/**
 * `knownGstRates` is the distinct set already present in THIS tenant's catalogue
 * (`listTenantGstRates`). They are SUGGESTIONS, never a constraint — F.55 replaced
 * a hardcoded `[0, 5, 12, 18, 28]` `<select>` with a numeric input precisely so the
 * application stops asserting which rates exist. A brand-new tenant gets an empty
 * array, types its own rates, and sees them thereafter.
 */
export function NewProductForm({ knownGstRates = [] }: { knownGstRates?: number[] }) {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL);
  const [specs, setSpecs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // D-6: an unusual rate gets an inline WARNING and requires a second, explicit
  // click. Never a rejection — a rejection threshold is a bound wearing different
  // clothes and would reintroduce the staleness F.55 removes.
  const [rateAcknowledged, setRateAcknowledged] = useState(false);

  const set = (k: keyof typeof INITIAL, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v as never }));

  // Compared as NUMBERS. `knownGstRates` is already numeric (the query coerces at
  // the boundary); comparing the input string against DB strings is the
  // `'18.00'` vs `'18'` hazard CLAUDE.md §5 names.
  const rateIsUnusual = useMemo(() => {
    const t = form.gstRate.trim();
    if (t === '' || knownGstRates.length === 0) return false;
    const n = Number(t);
    return Number.isFinite(n) && !knownGstRates.includes(n);
  }, [form.gstRate, knownGstRates]);

  const suggested = useMemo(() => {
    const list = SUGGESTED_SPEC_FIELDS[form.category] ?? [];
    return list.filter((k) => !(k in specs));
  }, [form.category, specs]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // D-6: warn once, then let it through on an explicit second click.
    if (rateIsUnusual && !rateAcknowledged) {
      setRateAcknowledged(true);
      return;
    }
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
        <Lbl label="GST rate (%) *">
          <Input
            required
            type="number"
            inputMode="decimal"
            min="0"
            max="999.99"
            step="0.01"
            list="gst-rate-suggestions"
            aria-label="GST rate"
            placeholder={knownGstRates.length > 0 ? String(knownGstRates[0]) : 'e.g. 18'}
            value={form.gstRate}
            onChange={(e) => {
              set('gstRate', e.target.value);
              setRateAcknowledged(false);
            }}
          />
          {knownGstRates.length > 0 && (
            <datalist id="gst-rate-suggestions">
              {knownGstRates.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          )}
          {rateIsUnusual && (
            <p
              data-testid="gst-rate-warning"
              className="mt-1 text-[12px] leading-snug text-amber-700"
            >
              {rateAcknowledged
                ? `Using ${form.gstRate}% — click Save again to confirm.`
                : `${form.gstRate}% is not a rate this catalogue already uses. Check it, then click Save again to continue.`}
            </p>
          )}
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
