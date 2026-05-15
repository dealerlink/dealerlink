'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createQuotation } from '@/lib/actions/quotations/create-quotation';
import { updateQuotation } from '@/lib/actions/quotations/update-quotation';

import type {
  BuilderContext,
  BuilderFormState,
  DealOption,
  DealerOption,
  ProductOption,
  UserOption,
} from './builder-types';
import { DiscountPicker } from './discount-picker';
import { LineItemsTable } from './line-items-table';
import { SummaryCard } from './summary-card';

interface Props {
  mode: 'create' | 'edit';
  quotationId?: string;
  initialState: BuilderFormState;
  context: BuilderContext;
  dealers: DealerOption[];
  products: ProductOption[];
  deals: DealOption[];
  salesUsers: UserOption[];
  canPickPreparedBy: boolean;
}

export function QuotationBuilderForm({
  mode,
  quotationId,
  initialState,
  context,
  dealers,
  products,
  deals,
  salesUsers,
  canPickPreparedBy,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<BuilderFormState>(initialState);
  const [saving, setSaving] = useState<'draft' | 'send' | false>(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDealer = dealers.find((d) => d.id === form.dealerId);
  const placeOfSupply = (form.placeOfSupplyOverride || selectedDealer?.state || '').toUpperCase();
  const filteredDeals = useMemo(
    () => deals.filter((d) => !form.dealerId || d.dealerId === form.dealerId),
    [deals, form.dealerId],
  );

  const update = <K extends keyof BuilderFormState>(k: K, v: BuilderFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function buildPayloadLines() {
    return form.lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({
        productId: l.productId,
        productSku: l.productSku,
        productName: l.productName,
        hsnCode: l.hsnCode,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        gstRate: l.gstRate,
        description: l.description || undefined,
        notes: l.notes || undefined,
      }));
  }

  function buildDiscount() {
    if (form.discount.type === 'none' || !form.discount.value) return null;
    const n = Number(form.discount.value);
    if (!(n > 0)) return null;
    return { type: form.discount.type, value: n };
  }

  async function save(send: boolean) {
    setError(null);
    const lines = buildPayloadLines();
    if (lines.length === 0) {
      setError('Add at least one line item with a positive quantity.');
      return;
    }
    if (!form.dealerId) {
      setError('Select a dealer.');
      return;
    }
    if (!form.validUntil) {
      setError('Set a validity date.');
      return;
    }
    setSaving(send ? 'send' : 'draft');
    try {
      const discount = buildDiscount();
      if (mode === 'create') {
        const result = await createQuotation({
          dealerId: form.dealerId,
          dealId: form.dealId || null,
          preparedBy: canPickPreparedBy && form.preparedBy ? form.preparedBy : undefined,
          quoteDate: form.quoteDate || undefined,
          validUntil: form.validUntil,
          placeOfSupplyOverride: form.placeOfSupplyOverride || undefined,
          discount,
          termsAndConditions: form.termsAndConditions || undefined,
          notes: form.notes || undefined,
          lines,
          sendOnSave: send,
        });
        if (!result.ok) {
          setError(result.error.message);
          setSaving(false);
          return;
        }
        router.push(`/quotations/${result.data.id}`);
        router.refresh();
      } else {
        if (!quotationId) throw new Error('Missing quotation id');
        const result = await updateQuotation({
          id: quotationId,
          dealerId: form.dealerId,
          dealId: form.dealId || null,
          preparedBy: canPickPreparedBy && form.preparedBy ? form.preparedBy : undefined,
          quoteDate: form.quoteDate || undefined,
          validUntil: form.validUntil,
          placeOfSupplyOverride: form.placeOfSupplyOverride || undefined,
          discount,
          termsAndConditions: form.termsAndConditions || null,
          notes: form.notes || null,
          lines,
        });
        if (!result.ok) {
          setError(result.error.message);
          setSaving(false);
          return;
        }
        router.push(`/quotations/${quotationId}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quotation');
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <section className="border-line space-y-3 rounded-[6px] border bg-white p-5">
          <div className="titlecaps text-mute">Header</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dealer" required>
              <select
                value={form.dealerId}
                onChange={(e) => update('dealerId', e.target.value)}
                className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
                required
              >
                <option value="">Select a dealer…</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} {d.state ? `· ${d.state}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Linked deal (optional)">
              <select
                value={form.dealId}
                onChange={(e) => update('dealId', e.target.value)}
                className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
              >
                <option value="">No deal linked</option>
                {filteredDeals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Quote date">
              <Input
                type="date"
                value={form.quoteDate}
                onChange={(e) => update('quoteDate', e.target.value)}
              />
            </Field>
            <Field label="Valid until" required>
              <Input
                type="date"
                value={form.validUntil}
                onChange={(e) => update('validUntil', e.target.value)}
                required
              />
            </Field>
            <Field label="Place of supply (override)">
              <Input
                value={form.placeOfSupplyOverride}
                onChange={(e) => update('placeOfSupplyOverride', e.target.value.toUpperCase())}
                placeholder={selectedDealer?.state ?? '—'}
                maxLength={2}
              />
            </Field>
          </div>
          {canPickPreparedBy && (
            <Field label="Prepared by">
              <select
                value={form.preparedBy}
                onChange={(e) => update('preparedBy', e.target.value)}
                className="border-line bg-paper focus:ring-accent h-9 w-full rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
              >
                {salesUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </section>

        <LineItemsTable
          lines={form.lines}
          products={products}
          onLinesChange={(lines) => update('lines', lines)}
        />

        <DiscountPicker value={form.discount} onChange={(d) => update('discount', d)} />

        <section className="border-line space-y-3 rounded-[6px] border bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="titlecaps text-mute">Terms & conditions</div>
            {context.defaultTerms && (
              <button
                type="button"
                onClick={() => update('termsAndConditions', context.defaultTerms ?? '')}
                className="text-accent text-[12px] underline-offset-4 hover:underline"
              >
                Use tenant default
              </button>
            )}
          </div>
          <textarea
            rows={4}
            value={form.termsAndConditions}
            onChange={(e) => update('termsAndConditions', e.target.value)}
            className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
          />
        </section>

        <section className="border-line space-y-2 rounded-[6px] border bg-white p-5">
          <div className="titlecaps text-mute">Internal notes (not on PDF)</div>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className="border-line bg-paper focus:ring-accent w-full rounded-[4px] border px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1"
          />
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
          <Button type="button" variant="default" onClick={() => save(false)} disabled={!!saving}>
            {saving === 'draft' ? 'Saving…' : 'Save as draft'}
          </Button>
          {mode === 'create' && (
            <Button type="button" variant="accent" onClick={() => save(true)} disabled={!!saving}>
              {saving === 'send' ? 'Sending…' : 'Save & send'}
            </Button>
          )}
        </div>
      </div>

      <SummaryCard form={form} tenantState={context.tenantState} placeOfSupply={placeOfSupply} />
    </div>
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
