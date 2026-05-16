/**
 * Dispatch-note line-items table (Day 13).
 *
 * Each row is one product line; the serial numbers shipped on that line are
 * rendered as a wrapped grid of chips beneath the product name. A dispatch
 * note is tax-neutral, so there is no rate / tax / amount column — just what
 * physically left the warehouse.
 */
import type { PdfDispatchLine } from '../types';

interface SerialsTableProps {
  lines: PdfDispatchLine[];
}

export function SerialsTable({ lines }: SerialsTableProps) {
  const totalUnits = lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <table className="items">
      <thead>
        <tr>
          <th style={{ width: '32px' }}>#</th>
          <th>Product &amp; Serial Numbers</th>
          <th className="num" style={{ width: '70px' }}>
            Qty
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr className="serial-line" key={l.lineNumber}>
            <td className="mono">{l.lineNumber}</td>
            <td>
              <div className="item-name">{l.name}</div>
              <div className="item-sub mono">{l.sku}</div>
              <div className="serial-chips">
                {l.serials.map((s, i) => (
                  <span className="serial-chip mono" key={i}>
                    {s}
                  </span>
                ))}
              </div>
            </td>
            <td className="num mono">{l.quantity}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>Total units dispatched</td>
          <td className="num mono">{totalUnits}</td>
        </tr>
      </tfoot>
    </table>
  );
}
