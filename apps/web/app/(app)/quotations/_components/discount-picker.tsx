'use client';

import { Input } from '@/components/ui/input';

import type { DiscountState } from './builder-types';

interface Props {
  value: DiscountState;
  onChange: (next: DiscountState) => void;
}

export function DiscountPicker({ value, onChange }: Props) {
  return (
    <section className="border-line rounded-[6px] border bg-white p-5">
      <div className="titlecaps text-mute mb-3">Discount (applied before tax)</div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-ink inline-flex items-center gap-2 text-[13px]">
          <input
            type="radio"
            name="discount-type"
            checked={value.type === 'none'}
            onChange={() => onChange({ type: 'none', value: '' })}
          />
          None
        </label>
        <label className="text-ink inline-flex items-center gap-2 text-[13px]">
          <input
            type="radio"
            name="discount-type"
            checked={value.type === 'percent'}
            onChange={() => onChange({ type: 'percent', value: value.value || '0' })}
          />
          Percent
        </label>
        <label className="text-ink inline-flex items-center gap-2 text-[13px]">
          <input
            type="radio"
            name="discount-type"
            checked={value.type === 'amount'}
            onChange={() => onChange({ type: 'amount', value: value.value || '0' })}
          />
          Amount (₹)
        </label>
        {value.type !== 'none' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step={value.type === 'percent' ? '0.01' : '1'}
              max={value.type === 'percent' ? '100' : undefined}
              value={value.value}
              onChange={(e) => onChange({ ...value, value: e.target.value })}
              className="w-32 text-right tabular-nums"
            />
            <span className="text-mute mono text-[12px]">
              {value.type === 'percent' ? '%' : '₹'}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
