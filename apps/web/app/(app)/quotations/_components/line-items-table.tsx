'use client';

import { Trash2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { formatINRExact } from '@/lib/format';

import type { BuilderLineRow, ProductOption } from './builder-types';

interface Props {
  lines: BuilderLineRow[];
  products: ProductOption[];
  onLinesChange: (next: BuilderLineRow[]) => void;
}

function emptyRow(p?: ProductOption): BuilderLineRow {
  if (!p) {
    return {
      productId: '',
      productSku: '',
      productName: '',
      hsnCode: '',
      gstRate: 0,
      quantity: '1',
      unitPrice: '0',
      description: '',
      notes: '',
    };
  }
  return {
    productId: p.id,
    productSku: p.sku,
    productName: p.name,
    hsnCode: p.hsnCode,
    gstRate: p.gstRate,
    quantity: '1',
    unitPrice: (p.defaultSellingPrice ?? 0).toString(),
    description: '',
    notes: '',
  };
}

export function LineItemsTable({ lines, products, onLinesChange }: Props) {
  const update = (idx: number, patch: Partial<BuilderLineRow>) =>
    onLinesChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const remove = (idx: number) => onLinesChange(lines.filter((_, i) => i !== idx));

  const addRow = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    onLinesChange([...lines, emptyRow(p)]);
  };

  return (
    <section className="border-line rounded-[6px] border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="titlecaps text-mute">Line items</div>
        <select
          value=""
          aria-label="Add a product line"
          onChange={(e) => {
            if (e.target.value) {
              addRow(e.target.value);
              e.target.value = '';
            }
          }}
          className="border-line bg-paper focus:ring-accent h-9 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        >
          <option value="">+ Add product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.name} · {p.gstRate}%
            </option>
          ))}
        </select>
      </div>

      {lines.length === 0 ? (
        <p className="text-mute editorial text-[12.5px] italic">
          Add the first line item to get started.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="text-mute grid grid-cols-[1fr_72px_56px_120px_120px_28px] gap-2 text-[10.5px] uppercase tracking-wide">
            <div>Product</div>
            <div className="text-right">Qty</div>
            <div className="text-right">GST</div>
            <div className="text-right">Unit price</div>
            <div className="text-right">Line total</div>
            <div />
          </div>
          {lines.map((l, idx) => {
            const lineTotal = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
            return (
              <div key={idx} className="space-y-1.5">
                <div className="grid grid-cols-[1fr_72px_56px_120px_120px_28px] items-center gap-2">
                  <div className="min-w-0">
                    <div className="text-ink truncate text-[13px] font-medium">{l.productName}</div>
                    <div className="text-mute mono text-[11px]">
                      {l.productSku} · HSN {l.hsnCode}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    aria-label={`Quantity for ${l.productName}`}
                    value={l.quantity}
                    onChange={(e) => update(idx, { quantity: e.target.value })}
                    className="text-right tabular-nums"
                  />
                  <div className="mono text-mute text-right text-[12px]">{l.gstRate}%</div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={`Unit price for ${l.productName}`}
                    value={l.unitPrice}
                    onChange={(e) => update(idx, { unitPrice: e.target.value })}
                    className="text-right tabular-nums"
                  />
                  <div className="mono text-ink text-right text-[13px] tabular-nums">
                    {formatINRExact(lineTotal)}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-mute hover:text-rose-700"
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <Input
                  value={l.description}
                  aria-label={`Description for ${l.productName}`}
                  onChange={(e) => update(idx, { description: e.target.value })}
                  placeholder="Description override (optional)"
                  maxLength={500}
                  className="text-[12px]"
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
