import { notFound, redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { getInvoiceDetail } from '@/lib/queries/invoices';
import { impersonationTenantId } from '@/lib/tenant/context';

import { InvoiceActions } from './invoice-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tax Invoice' };

/**
 * A tax invoice.
 *
 * Every money figure here is the STORED column (F.152 / F6 D-1), including
 * `roundOff` — which is why the total is a whole rupee and is not the sum of the
 * rows above it. The Round Off row appears only when the term is non-zero
 * (F6_SPEC §2), matching the rendered PDF.
 *
 * No edit, no delete, no re-issue. A wrong amount is corrected by a credit note; an
 * invoice that should never have existed is cancelled with a reason.
 */
export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const detail = await getInvoiceDetail(tenantId, params.id);
  if (!detail) notFound();
  const { header, lines, credits, debits } = detail;

  const row = (label: string, value: number, testid?: string) => (
    <div className="flex justify-between py-0.5">
      <span className="text-mute">{label}</span>
      <span className="mono text-ink" data-testid={testid}>
        {formatINRExact(value)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-ink mono text-[20px] font-semibold" data-testid="invoice-number">
            {header.invoiceNumber}
          </h1>
          <p className="text-mute mt-0.5 text-[12.5px]">
            {formatDate(new Date(header.invoiceDate))} · {header.billToName} · place of supply{' '}
            <span className="mono" data-testid="invoice-pos">
              {header.placeOfSupply}
            </span>
          </p>
        </div>
        <StatusPill tone={header.status === 'cancelled' ? 'ro' : 'em'}>{header.status}</StatusPill>
      </div>

      <div className="border-line overflow-hidden rounded-[6px] border bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="bg-paper text-mute border-line border-b">
            <tr>
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-left font-medium">HSN</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
              <th className="px-3 py-2 text-right font-medium">GST</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-line border-b last:border-0">
                <td className="text-mute px-3 py-2">{l.lineNumber}</td>
                <td className="text-ink px-3 py-2">{l.productName}</td>
                <td className="mono text-mute px-3 py-2">{l.hsnCode}</td>
                <td className="mono px-3 py-2 text-right">{l.quantity}</td>
                <td className="mono px-3 py-2 text-right">{formatINRExact(l.unitPrice)}</td>
                <td className="mono text-mute px-3 py-2 text-right">{l.gstRate}%</td>
                <td className="mono px-3 py-2 text-right">{formatINRExact(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-[320px] text-[12.5px]">
        {row('Subtotal', header.subtotal)}
        {header.discountAmount !== 0 && row('Discount', header.discountAmount)}
        {row('Taxable Amount', header.taxableAmount, 'invoice-taxable')}
        {header.cgstAmount !== 0 && row('CGST', header.cgstAmount)}
        {header.sgstAmount !== 0 && row('SGST', header.sgstAmount)}
        {header.igstAmount !== 0 && row('IGST', header.igstAmount)}
        {/*
          ROUND OFF — shown only when non-zero, matching the PDF (F6_SPEC §2). The
          value is SIGNED: a downward rounding renders negative, which is the case
          the column exists for.
        */}
        {header.roundOff !== 0 && row('Round Off', header.roundOff, 'invoice-round-off')}
        <div className="border-line mt-1 flex justify-between border-t-2 pt-1 font-semibold">
          <span className="text-ink">Grand Total</span>
          <span className="mono text-ink" data-testid="invoice-total">
            {formatINRExact(header.totalAmount)}
          </span>
        </div>
      </div>

      <InvoiceActions
        invoiceId={header.id}
        invoiceNumber={header.invoiceNumber}
        isAdmin={ctx.user.role === 'admin'}
        cancelled={header.status === 'cancelled'}
        lines={lines.map((l) => ({
          productId: l.productId,
          productName: l.productName,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        }))}
      />

      {(credits.length > 0 || debits.length > 0) && (
        <div className="space-y-1" data-testid="invoice-notes">
          <h2 className="text-ink text-[13px] font-semibold">Notes against this invoice</h2>
          {credits.map((c) => (
            <div key={c.id} className="text-[12.5px]" data-testid="credit-note-row">
              <span className="mono text-accent">{c.number}</span>{' '}
              <span className="text-mute">credit · {c.reason} ·</span>{' '}
              <span className="mono">{formatINRExact(c.totalAmount)}</span>
            </div>
          ))}
          {debits.map((d) => (
            <div key={d.id} className="text-[12.5px]" data-testid="debit-note-row">
              <span className="mono text-accent">{d.number}</span>{' '}
              <span className="text-mute">debit · {d.reason} ·</span>{' '}
              <span className="mono">{formatINRExact(d.totalAmount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
