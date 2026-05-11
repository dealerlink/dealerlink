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
  formatINR,
}: {
  product: ProductView;
  canEdit: boolean;
  formatINR: (n: number) => string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(product);

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
        onSave={() =>
          saveSection({
            hsnCode: form.hsnCode,
            gstRate: Number(form.gstRate),
            mrp: form.mrp ? Number(form.mrp) : null,
            defaultPurchasePrice: form.defaultPurchasePrice
              ? Number(form.defaultPurchasePrice)
              : null,
            defaultSellingPrice: form.defaultSellingPrice ? Number(form.defaultSellingPrice) : null,
          })
        }
        saving={saving}
      >
        {editing === 'pricing' ? (
          <>
            <Lbl label="HSN code">
              <Input value={form.hsnCode} onChange={(e) => set('hsnCode', e.target.value)} />
            </Lbl>
            <Lbl label="GST rate (%)">
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
            <Field label="MRP" value={product.mrp ? formatINR(Number(product.mrp)) : null} mono />
            <Field
              label="Default purchase price"
              value={
                product.defaultPurchasePrice
                  ? formatINR(Number(product.defaultPurchasePrice))
                  : null
              }
              mono
            />
            <Field
              label="Default selling price"
              value={
                product.defaultSellingPrice ? formatINR(Number(product.defaultSellingPrice)) : null
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
          serial number (per CLAUDE.md §11). Useful for panels and inverters; off for accessories.
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
