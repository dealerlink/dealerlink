/**
 * Line-items table with per-line GST breakdown.
 *
 * `<thead>` is a table-header-group so Chromium repeats the column headings
 * on every page when a long quotation wraps. The Discount column is a
 * Phase-1 placeholder (line-level discounts are not modelled yet — only
 * document-level discount exists), kept so Day 11's invoice table is
 * column-compatible.
 */
import { formatMoney, formatRate } from '../../lib/format';
import type { PdfLineItem } from '../types';

interface LineItemsTableProps {
  lines: PdfLineItem[];
}

export function LineItemsTable({ lines }: LineItemsTableProps) {
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalTaxable = lines.reduce((s, l) => s + l.taxableValue, 0);
  const totalGst = lines.reduce((s, l) => s + l.gstAmount, 0);
  const totalLine = lines.reduce((s, l) => s + l.lineTotal, 0);

  return (
    <table className="items">
      <thead>
        <tr>
          <th>#</th>
          <th>Description</th>
          <th className="num">Qty</th>
          <th className="num">Unit Price</th>
          <th className="num">Discount</th>
          <th className="num">Taxable Value</th>
          <th className="num">GST</th>
          <th className="num">GST Amount</th>
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.lineNumber}>
            <td className="mono">{l.lineNumber}</td>
            <td>
              <div className="item-name">{l.name}</div>
              <div className="item-sub mono">
                {l.sku} · HSN {l.hsnCode}
              </div>
              {l.description ? <div className="item-sub">{l.description}</div> : null}
            </td>
            <td className="num mono">
              {l.quantity} {l.unitOfMeasure}
            </td>
            <td className="num mono">{formatMoney(l.unitPrice)}</td>
            <td className="num mono">{formatMoney(l.lineDiscount)}</td>
            <td className="num mono">{formatMoney(l.taxableValue)}</td>
            <td className="num mono">{formatRate(l.gstRate)}</td>
            <td className="num mono">{formatMoney(l.gstAmount)}</td>
            <td className="num mono">{formatMoney(l.lineTotal)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>Total</td>
          <td className="num mono">{totalQty}</td>
          <td />
          <td />
          <td className="num mono">{formatMoney(totalTaxable)}</td>
          <td />
          <td className="num mono">{formatMoney(totalGst)}</td>
          <td className="num mono">{formatMoney(totalLine)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
