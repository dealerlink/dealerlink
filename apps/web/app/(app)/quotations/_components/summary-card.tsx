'use client';

import { useMemo } from 'react';

import { TaxSummaryBlock } from '@/components/tax/tax-summary-block';
import { formatINRExact, formatTaxAmount } from '@/lib/format';
import { computeQuotationTotals } from '@/lib/quotation/preview';

import type { BuilderFormState } from './builder-types';

interface Props {
  form: BuilderFormState;
  tenantState: string;
  placeOfSupply: string;
}

export function SummaryCard({ form, tenantState, placeOfSupply }: Props) {
  const preview = useMemo(() => {
    const discount =
      form.discount.type !== 'none' && Number(form.discount.value) > 0
        ? {
            type: form.discount.type as 'percent' | 'amount',
            value: Number(form.discount.value),
          }
        : null;
    return computeQuotationTotals({
      tenantState: tenantState || 'XX',
      placeOfSupply: placeOfSupply || 'XX',
      lines: form.lines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        gstRate: l.gstRate,
      })),
      discount,
    });
  }, [form.lines, form.discount, tenantState, placeOfSupply]);

  return (
    <aside className="border-line sticky top-4 self-start rounded-[6px] border bg-white p-5">
      <div className="titlecaps text-mute mb-3">Totals</div>

      <div className="mb-4">
        <span
          className={`inline-flex items-center gap-2 rounded-[4px] border px-2 py-1 text-[11px] font-medium ${
            preview.isInterState
              ? 'border-[#FCD34D] bg-[#FFFBEB] text-[#92400E]'
              : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]'
          }`}
          data-testid="interstate-badge"
        >
          <span className="mono">{tenantState || '??'}</span>
          <span>→</span>
          <span className="mono">{placeOfSupply || '??'}</span>
          <span className="ml-1">· {preview.isInterState ? 'Inter-state' : 'Intra-state'}</span>
        </span>
      </div>

      <dl className="space-y-2 text-[13px]">
        <Row label="Subtotal" value={formatINRExact(preview.subtotal)} />
        {preview.discountAmount > 0 && (
          <Row
            label={`Discount${form.discount.type === 'percent' ? ` (${form.discount.value}%)` : ''}`}
            value={`− ${formatINRExact(preview.discountAmount)}`}
            mute
          />
        )}
        <Row label="Taxable amount" value={formatTaxAmount(preview.taxableAmount)} />
        {/*
          One row per distinct rate, replacing the single "CGST @ mixed" pair.
          "mixed" was the defect, not a shorthand: it told the customer a rate
          existed without naming it, on the one figure they reconcile against.
        */}
        <TaxSummaryBlock rows={preview.byRate} isInterState={preview.isInterState} />
      </dl>

      <div className="border-line mt-4 flex items-baseline justify-between border-t pt-3">
        <span className="text-mute text-[12px]">Total</span>
        <span
          className="text-ink mono text-[20px] font-semibold tabular-nums"
          data-testid="total-amount"
        >
          {formatINRExact(preview.total)}
        </span>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  mute,
  ...rest
}: {
  label: string;
  value: string;
  mute?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="flex items-baseline justify-between" {...rest}>
      <dt className="text-mute text-[12px]">{label}</dt>
      <dd className={`mono text-[13px] tabular-nums ${mute ? 'text-mute' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}
