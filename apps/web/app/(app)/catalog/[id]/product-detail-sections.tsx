'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  deactivateProduct,
  discontinueProduct,
  reactivateProduct,
  updateProduct,
} from '@/lib/actions/products';
import { formatINRExact } from '@/lib/format';

interface ProductView {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  hsnCode: string;
  gstRate: string;
  category: string | null;
  subcategory: string | null;
  specs: Record<string, unknown>;
  mrp: string | null;
  defaultPurchasePrice: string | null;
  defaultSellingPrice: string | null;
  requiresSerial: boolean;
  unitOfMeasure: string;
  status: 'active' | 'inactive' | 'discontinued';
}

function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

const SPEC_SUFFIX: Record<string, string> = {
  wattage: ' (W)',
  voltage: ' (V)',
  current: ' (A)',
  warranty_years: ' (years)',
  warrantyYears: ' (years)',
  efficiency: ' (%)',
  weight: ' (kg)',
};

function Section({
  title,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  canEdit,
  children,
}: {
  title: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-line mt-6 rounded-[6px] border bg-white">
      <header className="border-line flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">{title}</h2>
        {canEdit && !editing && (
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
        )}
        {editing && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </header>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 text-[13px]">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-mute mb-1 text-[11px] uppercase tracking-[0.06em]">{label}</div>
      <div className={mono ? 'mono text-ink' : 'text-ink'}>{value || '—'}</div>
    </div>
  );
}

export function ProductDetailSections({
  product,
  canEdit,
  knownGstRates = [],
}: {
  product: ProductView;
  canEdit: boolean;
  /**
   * Distinct rates already in THIS tenant's catalogue — suggestions only (F.55 §3).
   * Editing a product to a NEW rate is R8's actual use case and the reason the old
   * hardcoded `<select>` made that runbook structurally unable to do its job.
   */
  knownGstRates?: number[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(product);
  // D-6: warn on an unusual rate, never reject. Second explicit click confirms.
  const [rateAcknowledged, setRateAcknowledged] = useState(false);

  // NOTE: `form.gstRate` is the raw DB string (`'18.00'`) — `ProductView.gstRate`
  // is typed `string` and `lib/queries/products.ts` does not coerce it. That is the
  // very mismatch that made the old `<select value={form.gstRate}>` select NOTHING
  // for an 18% product, because its options rendered integer literals (CLAUDE.md
  // §5). Comparison here is numeric on both sides, which is what fixes it.
  const rateIsUnusual = (() => {
    const t = String(form.gstRate ?? '').trim();
    if (t === '' || knownGstRates.length === 0) return false;
    const n = Number(t);
    return Number.isFinite(n) && !knownGstRates.includes(n);
  })();

  const set = <K extends keyof ProductView>(k: K, v: ProductView[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function saveSection(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const result = await updateProduct({ id: product.id, ...payload });
      if (!result.ok) {
        alert(result.error.message);
        return;
      }
      setEditing(null);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const isInactive = product.status !== 'active';

  return (
    <>
      <Section
        title="Identity"
        canEdit={canEdit}
        editing={editing === 'identity'}
        onEdit={() => {
          setEditing('identity');
          setForm(product);
        }}
        onCancel={() => setEditing(null)}
        onSave={() =>
          saveSection({
            name: form.name,
            description: form.description,
            manufacturer: form.manufacturer,
            model: form.model,
            category: form.category,
            subcategory: form.subcategory,
            unitOfMeasure: form.unitOfMeasure,
          })
        }
        saving={saving}
      >
        {editing === 'identity' ? (
          <>
            <Lbl label="Name">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Lbl>
            <Lbl label="Manufacturer">
              <Input
                value={form.manufacturer ?? ''}
                onChange={(e) => set('manufacturer', e.target.value)}
              />
            </Lbl>
            <Lbl label="Model">
              <Input value={form.model ?? ''} onChange={(e) => set('model', e.target.value)} />
            </Lbl>
            <Lbl label="Category">
              <Input
                value={form.category ?? ''}
                onChange={(e) => set('category', e.target.value)}
              />
            </Lbl>
            <Lbl label="Subcategory">
              <Input
                value={form.subcategory ?? ''}
                onChange={(e) => set('subcategory', e.target.value)}
              />
            </Lbl>
            <Lbl label="Unit of measure">
              <Input
                value={form.unitOfMeasure}
                onChange={(e) => set('unitOfMeasure', e.target.value)}
              />
            </Lbl>
            <Lbl label="Description">
              <textarea
                rows={3}
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
                className="border-line w-full rounded-[5px] border bg-white p-2 text-[13px]"
              />
            </Lbl>
          </>
        ) : (
          <>
            <Field label="SKU" value={product.sku} mono />
            <Field label="Name" value={product.name} />
            <Field label="Manufacturer" value={product.manufacturer} />
            <Field label="Model" value={product.model} />
            <Field label="Category" value={product.category} />
            <Field label="Subcategory" value={product.subcategory} />
            <Field label="Unit of measure" value={product.unitOfMeasure} />
            <Field label="Description" value={product.description} />
          </>
        )}
      </Section>

      <Section
        title="Tax & pricing"
        canEdit={canEdit}
        editing={editing === 'pricing'}
        onEdit={() => {
          setEditing('pricing');
          setForm(product);
        }}
        onCancel={() => setEditing(null)}
        onSave={() => {
          // D-6: an unusual rate warns once and requires a second explicit save.
          // Never a rejection — see the warning text below.
          if (rateIsUnusual && !rateAcknowledged) {
            setRateAcknowledged(true);
            return;
          }
          return saveSection({
            hsnCode: form.hsnCode,
            gstRate: Number(form.gstRate),
            mrp: form.mrp ? Number(form.mrp) : null,
            defaultPurchasePrice: form.defaultPurchasePrice
              ? Number(form.defaultPurchasePrice)
              : null,
            defaultSellingPrice: form.defaultSellingPrice ? Number(form.defaultSellingPrice) : null,
          });
        }}
        saving={saving}
      >
        {editing === 'pricing' ? (
          <>
            <Lbl label="HSN code">
              <Input value={form.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} />
            </Lbl>
            <Lbl label="GST rate (%)">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                max="999.99"
                step="0.01"
                list="gst-rate-suggestions-edit"
                aria-label="GST rate"
                value={form.gstRate}
                onChange={(e) => {
                  set('gstRate', e.target.value);
                  setRateAcknowledged(false);
                }}
              />
              {knownGstRates.length > 0 && (
                <datalist id="gst-rate-suggestions-edit">
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
                    ? `Using ${String(form.gstRate)}% — save again to confirm.`
                    : `${String(form.gstRate)}% is not a rate this catalogue already uses. Check it, then save again to continue.`}
                </p>
              )}
            </Lbl>
            <Lbl label="MRP (₹)">
              <Input value={form.mrp ?? ''} onChange={(e) => set('mrp', e.target.value)} />
            </Lbl>
            <Lbl label="Default purchase price (₹)">
              <Input
                value={form.defaultPurchasePrice ?? ''}
                onChange={(e) => set('defaultPurchasePrice', e.target.value)}
              />
            </Lbl>
            <Lbl label="Default selling price (₹)">
              <Input
                value={form.defaultSellingPrice ?? ''}
                onChange={(e) => set('defaultSellingPrice', e.target.value)}
              />
            </Lbl>
          </>
        ) : (
          <>
            <Field label="HSN" value={product.hsnCode} mono />
            <Field label="GST rate" value={`${product.gstRate}%`} mono />
            <Field
              label="MRP"
              value={product.mrp ? formatINRExact(Number(product.mrp)) : null}
              mono
            />
            <Field
              label="Default purchase price"
              value={
                product.defaultPurchasePrice
                  ? formatINRExact(Number(product.defaultPurchasePrice))
                  : null
              }
              mono
            />
            <Field
              label="Default selling price"
              value={
                product.defaultSellingPrice
                  ? formatINRExact(Number(product.defaultSellingPrice))
                  : null
              }
              mono
            />
          </>
        )}
      </Section>

      <section className="border-line mt-6 rounded-[6px] border bg-white">
        <header className="border-line border-b px-4 py-3">
          <h2 className="text-[13px] font-semibold tracking-[-0.01em]">Specifications</h2>
        </header>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 text-[13px]">
          {Object.keys(product.specs).length === 0 ? (
            <div className="text-mute col-span-2 text-[12.5px]">No specs recorded.</div>
          ) : (
            Object.entries(product.specs).map(([k, v]) => (
              <div key={k}>
                <div className="text-mute mb-1 text-[11px] uppercase tracking-[0.06em]">
                  {humanize(k)}
                  {SPEC_SUFFIX[k] ?? ''}
                </div>
                <div className="mono text-ink">{String(v)}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="border-line mt-6 rounded-[6px] border bg-white p-4">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">Inventory behavior</h2>
        <p className="text-mute mt-1 text-[12.5px]">
          When <em>requires serial</em> is on, every inventory item must be created with a unique
          serial number (per docs/WORKFLOWS.md). Useful for panels and inverters; off for
          accessories.
        </p>
        <div className="mt-3">
          <span className="mono text-ink text-[13px]">
            requires_serial = {String(product.requiresSerial)}
          </span>
        </div>
      </section>

      <section className="border-line mt-6 rounded-[6px] border bg-white p-4">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">Lifecycle</h2>
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            {isInactive ? (
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  const r = await reactivateProduct({ id: product.id });
                  if (!r.ok) alert(r.error.message);
                  else startTransition(() => router.refresh());
                }}
              >
                Reactivate
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={async () => {
                    const r = await deactivateProduct({ id: product.id });
                    if (!r.ok) alert(r.error.message);
                    else startTransition(() => router.refresh());
                  }}
                >
                  Deactivate
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    if (!confirm('Mark as discontinued? This is irreversible by design.')) return;
                    const r = await discontinueProduct({ id: product.id });
                    if (!r.ok) alert(r.error.message);
                    else startTransition(() => router.refresh());
                  }}
                >
                  Discontinue
                </Button>
              </>
            )}
          </div>
        )}
      </section>
    </>
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
