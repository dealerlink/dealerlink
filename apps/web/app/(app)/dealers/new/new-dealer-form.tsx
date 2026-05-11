'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createDealer } from '@/lib/actions/dealers';
import { INDIAN_STATES } from '@/lib/admin/constants';
import { panFromGSTIN } from '@/lib/format';
import { DEALER_CATEGORIES, DEALER_RISK_LEVELS, DEALER_TYPES } from '@dealerlink/schemas';

const INITIAL = {
  legalName: '',
  displayName: '',
  contactPerson: '',
  phone: '',
  altPhone: '',
  email: '',
  altEmail: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  pincode: '',
  country: 'IN',
  gstin: '',
  pan: '',
  type: 'retailer' as const,
  category: 'B' as const,
  riskLevel: 'low' as const,
  notes: '',
  tags: '' as string,
  creditLimit: '',
  creditPeriodDays: '',
  discountPercent: '0',
};

export function NewDealerForm({ canSetCommercial }: { canSetCommercial: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof INITIAL, v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'gstin' && v && !f.pan) {
        const derived = panFromGSTIN(v.toUpperCase());
        if (derived) next.pan = derived;
      }
      return next;
    });
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await createDealer({
        legalName: form.legalName,
        displayName: form.displayName,
        contactPerson: form.contactPerson,
        phone: form.phone,
        altPhone: form.altPhone,
        email: form.email,
        altEmail: form.altEmail,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        country: form.country || 'IN',
        gstin: form.gstin,
        pan: form.pan,
        type: form.type,
        category: form.category,
        riskLevel: form.riskLevel,
        notes: form.notes,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
        creditLimit: canSetCommercial && form.creditLimit ? Number(form.creditLimit) : null,
        creditPeriodDays:
          canSetCommercial && form.creditPeriodDays ? Number(form.creditPeriodDays) : null,
        discountPercent: canSetCommercial ? Number(form.discountPercent || 0) : 0,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/dealers/${result.data.id}`);
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
        <Lbl label="Legal name *">
          <Input
            required
            value={form.legalName}
            onChange={(e) => set('legalName', e.target.value)}
          />
        </Lbl>
        <Lbl label="Display name *">
          <Input
            required
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
          />
        </Lbl>
        <Lbl label="Contact person">
          <Input
            value={form.contactPerson}
            onChange={(e) => set('contactPerson', e.target.value)}
          />
        </Lbl>
        <Lbl label="Phone">
          <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Lbl>
        <Lbl label="Email">
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Lbl>
        <Lbl label="Alt phone">
          <Input value={form.altPhone} onChange={(e) => set('altPhone', e.target.value)} />
        </Lbl>
      </Card>

      <Card title="Address">
        <Lbl label="Line 1">
          <Input value={form.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} />
        </Lbl>
        <Lbl label="Line 2">
          <Input value={form.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} />
        </Lbl>
        <Lbl label="City">
          <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Lbl>
        <Lbl label="State">
          <Sel
            value={form.state}
            onChange={(v) => set('state', v)}
            options={['', ...INDIAN_STATES]}
          />
        </Lbl>
        <Lbl label="Pincode">
          <Input value={form.pincode} onChange={(e) => set('pincode', e.target.value)} />
        </Lbl>
      </Card>

      <Card title="Compliance & classification">
        <Lbl label="GSTIN">
          <Input
            value={form.gstin}
            onChange={(e) => set('gstin', e.target.value.toUpperCase())}
            className="mono"
          />
        </Lbl>
        <Lbl label="PAN (auto-derived from GSTIN)">
          <Input
            value={form.pan}
            onChange={(e) => set('pan', e.target.value.toUpperCase())}
            className="mono"
          />
        </Lbl>
        <Lbl label="Type">
          <Sel value={form.type} onChange={(v) => set('type', v)} options={[...DEALER_TYPES]} />
        </Lbl>
        <Lbl label="Category">
          <Sel
            value={form.category}
            onChange={(v) => set('category', v)}
            options={[...DEALER_CATEGORIES]}
          />
        </Lbl>
        <Lbl label="Risk level">
          <Sel
            value={form.riskLevel}
            onChange={(v) => set('riskLevel', v)}
            options={[...DEALER_RISK_LEVELS]}
          />
        </Lbl>
      </Card>

      {canSetCommercial && (
        <Card title="Commercial terms">
          <Lbl label="Credit limit (₹)">
            <Input
              type="number"
              min="0"
              value={form.creditLimit}
              onChange={(e) => set('creditLimit', e.target.value)}
            />
          </Lbl>
          <Lbl label="Credit period (days)">
            <Input
              type="number"
              min="0"
              max="365"
              value={form.creditPeriodDays}
              onChange={(e) => set('creditPeriodDays', e.target.value)}
            />
          </Lbl>
          <Lbl label="Discount (%)">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.discountPercent}
              onChange={(e) => set('discountPercent', e.target.value)}
            />
          </Lbl>
        </Card>
      )}

      <Card title="Notes & tags">
        <Lbl label="Tags (comma-separated)">
          <Input value={form.tags} onChange={(e) => set('tags', e.target.value)} />
        </Lbl>
        <Lbl label="Notes">
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            className="border-line w-full rounded-[5px] border bg-white p-2 text-[13px]"
          />
        </Lbl>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={() => router.push('/dealers')}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create dealer'}
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

function Sel({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-line text-ink h-[34px] w-full rounded-[5px] border bg-white px-2 text-[13px]"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o || '—'}
        </option>
      ))}
    </select>
  );
}
