'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { INDIAN_STATES } from '@/lib/admin/constants';
import {
  deactivateDealer,
  reactivateDealer,
  updateDealer,
  updateDealerCommercial,
} from '@/lib/actions/dealers';
import { DEALER_CATEGORIES, DEALER_RISK_LEVELS, DEALER_TYPES } from '@dealerlink/schemas';

interface DealerView {
  id: string;
  legalName: string;
  displayName: string;
  contactPerson: string | null;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  altEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  gstin: string | null;
  pan: string | null;
  type: 'retailer' | 'wholesaler' | 'installer' | 'epc' | 'other';
  category: 'A' | 'B' | 'C';
  riskLevel: 'low' | 'medium' | 'high';
  status: 'active' | 'inactive' | 'on_hold';
  notes: string | null;
  tags: string[];
  creditLimit: string | null;
  creditPeriodDays: number | null;
  discountPercent: string;
  inactivatedReason: string | null;
}

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

export function DealerDetailSections({
  dealer,
  canEdit,
  canEditCommercial,
  formatINR,
}: {
  dealer: DealerView;
  canEdit: boolean;
  canEditCommercial: boolean;
  formatINR: (n: number) => string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(dealer);

  const set = <K extends keyof DealerView>(k: K, v: DealerView[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function saveSection(payload: Partial<DealerView>) {
    setSaving(true);
    try {
      const result = await updateDealer({ id: dealer.id, ...payload });
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

  async function saveCommercial() {
    setSaving(true);
    try {
      const result = await updateDealerCommercial({
        id: dealer.id,
        creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
        creditPeriodDays: form.creditPeriodDays ?? null,
        discountPercent: Number(form.discountPercent),
      });
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

  async function onDeactivate() {
    const reason = window.prompt('Reason for deactivation?');
    if (!reason) return;
    const result = await deactivateDealer({ id: dealer.id, reason });
    if (!result.ok) {
      alert(result.error.message);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function onReactivate() {
    const result = await reactivateDealer({ id: dealer.id });
    if (!result.ok) {
      alert(result.error.message);
      return;
    }
    startTransition(() => router.refresh());
  }

  const isInactive = dealer.status !== 'active';

  return (
    <>
      <Section
        title="Identity & contact"
        canEdit={canEdit}
        editing={editing === 'identity'}
        onEdit={() => {
          setEditing('identity');
          setForm(dealer);
        }}
        onCancel={() => setEditing(null)}
        onSave={() =>
          saveSection({
            legalName: form.legalName,
            displayName: form.displayName,
            contactPerson: form.contactPerson,
            phone: form.phone,
            altPhone: form.altPhone,
            email: form.email,
            altEmail: form.altEmail,
          })
        }
        saving={saving}
      >
        {editing === 'identity' ? (
          <>
            <LabeledInput
              label="Legal name"
              value={form.legalName}
              onChange={(v) => set('legalName', v)}
            />
            <LabeledInput
              label="Display name"
              value={form.displayName}
              onChange={(v) => set('displayName', v)}
            />
            <LabeledInput
              label="Contact person"
              value={form.contactPerson ?? ''}
              onChange={(v) => set('contactPerson', v)}
            />
            <LabeledInput
              label="Phone"
              value={form.phone ?? ''}
              onChange={(v) => set('phone', v)}
            />
            <LabeledInput
              label="Alt phone"
              value={form.altPhone ?? ''}
              onChange={(v) => set('altPhone', v)}
            />
            <LabeledInput
              label="Email"
              value={form.email ?? ''}
              onChange={(v) => set('email', v)}
            />
            <LabeledInput
              label="Alt email"
              value={form.altEmail ?? ''}
              onChange={(v) => set('altEmail', v)}
            />
          </>
        ) : (
          <>
            <Field label="Legal name" value={dealer.legalName} />
            <Field label="Display name" value={dealer.displayName} />
            <Field label="Contact person" value={dealer.contactPerson} />
            <Field label="Phone" value={dealer.phone} mono />
            <Field label="Alt phone" value={dealer.altPhone} mono />
            <Field label="Email" value={dealer.email} mono />
            <Field label="Alt email" value={dealer.altEmail} mono />
          </>
        )}
      </Section>

      <Section
        title="Address"
        canEdit={canEdit}
        editing={editing === 'address'}
        onEdit={() => {
          setEditing('address');
          setForm(dealer);
        }}
        onCancel={() => setEditing(null)}
        onSave={() =>
          saveSection({
            addressLine1: form.addressLine1,
            addressLine2: form.addressLine2,
            city: form.city,
            state: form.state,
            pincode: form.pincode,
          })
        }
        saving={saving}
      >
        {editing === 'address' ? (
          <>
            <LabeledInput
              label="Line 1"
              value={form.addressLine1 ?? ''}
              onChange={(v) => set('addressLine1', v)}
            />
            <LabeledInput
              label="Line 2"
              value={form.addressLine2 ?? ''}
              onChange={(v) => set('addressLine2', v)}
            />
            <LabeledInput label="City" value={form.city ?? ''} onChange={(v) => set('city', v)} />
            <LabeledSelect
              label="State"
              value={form.state ?? ''}
              onChange={(v) => set('state', v)}
              options={['', ...INDIAN_STATES]}
            />
            <LabeledInput
              label="Pincode"
              value={form.pincode ?? ''}
              onChange={(v) => set('pincode', v)}
            />
          </>
        ) : (
          <>
            <Field label="Line 1" value={dealer.addressLine1} />
            <Field label="Line 2" value={dealer.addressLine2} />
            <Field label="City" value={dealer.city} />
            <Field label="State" value={dealer.state} />
            <Field label="Pincode" value={dealer.pincode} mono />
            <Field label="Country" value={dealer.country} />
          </>
        )}
      </Section>

      <Section
        title="Compliance & classification"
        canEdit={canEdit}
        editing={editing === 'compliance'}
        onEdit={() => {
          setEditing('compliance');
          setForm(dealer);
        }}
        onCancel={() => setEditing(null)}
        onSave={() =>
          saveSection({
            gstin: form.gstin,
            pan: form.pan,
            type: form.type,
            category: form.category,
            riskLevel: form.riskLevel,
          })
        }
        saving={saving}
      >
        {editing === 'compliance' ? (
          <>
            <LabeledInput
              label="GSTIN"
              value={form.gstin ?? ''}
              onChange={(v) => set('gstin', v.toUpperCase())}
            />
            <LabeledInput
              label="PAN"
              value={form.pan ?? ''}
              onChange={(v) => set('pan', v.toUpperCase())}
            />
            <LabeledSelect
              label="Type"
              value={form.type}
              onChange={(v) => set('type', v as DealerView['type'])}
              options={[...DEALER_TYPES]}
            />
            <LabeledSelect
              label="Category"
              value={form.category}
              onChange={(v) => set('category', v as DealerView['category'])}
              options={[...DEALER_CATEGORIES]}
            />
            <LabeledSelect
              label="Risk level"
              value={form.riskLevel}
              onChange={(v) => set('riskLevel', v as DealerView['riskLevel'])}
              options={[...DEALER_RISK_LEVELS]}
            />
          </>
        ) : (
          <>
            <Field label="GSTIN" value={dealer.gstin} mono />
            <Field label="PAN" value={dealer.pan} mono />
            <Field label="Type" value={dealer.type} />
            <Field label="Category" value={dealer.category} mono />
            <Field label="Risk level" value={dealer.riskLevel} />
          </>
        )}
      </Section>

      <Section
        title="Commercial terms"
        canEdit={canEditCommercial}
        editing={editing === 'commercial'}
        onEdit={() => {
          setEditing('commercial');
          setForm(dealer);
        }}
        onCancel={() => setEditing(null)}
        onSave={saveCommercial}
        saving={saving}
      >
        {editing === 'commercial' ? (
          <>
            <LabeledInput
              label="Credit limit (₹)"
              value={form.creditLimit ?? ''}
              onChange={(v) => set('creditLimit', v)}
            />
            <LabeledInput
              label="Credit period (days)"
              value={form.creditPeriodDays != null ? String(form.creditPeriodDays) : ''}
              onChange={(v) => set('creditPeriodDays', v ? Number(v) : null)}
            />
            <LabeledInput
              label="Discount (%)"
              value={String(form.discountPercent)}
              onChange={(v) => set('discountPercent', v)}
            />
          </>
        ) : (
          <>
            <Field
              label="Credit limit"
              value={dealer.creditLimit ? formatINR(Number(dealer.creditLimit)) : null}
              mono
            />
            <Field
              label="Credit period"
              value={dealer.creditPeriodDays != null ? `${dealer.creditPeriodDays} days` : null}
              mono
            />
            <Field label="Discount %" value={`${dealer.discountPercent}%`} mono />
          </>
        )}
      </Section>

      <section className="border-line mt-6 rounded-[6px] border bg-white p-4">
        <h2 className="text-[13px] font-semibold tracking-[-0.01em]">Status</h2>
        {dealer.inactivatedReason && (
          <p className="text-mute mt-2 text-[12.5px]">
            <span className="text-rose font-medium">Inactivated:</span> {dealer.inactivatedReason}
          </p>
        )}
        {canEditCommercial && (
          <div className="mt-3 flex gap-2">
            {isInactive ? (
              <Button size="sm" variant="primary" onClick={onReactivate}>
                Reactivate
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={onDeactivate}>
                Deactivate
              </Button>
            )}
          </div>
        )}
      </section>
    </>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="text-mute mb-1 text-[11px] uppercase tracking-[0.06em]">{label}</div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <div className="text-mute mb-1 text-[11px] uppercase tracking-[0.06em]">{label}</div>
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
    </label>
  );
}
