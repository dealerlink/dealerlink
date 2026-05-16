import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { getLatestGeneratedDocument } from '@/lib/queries/generated-documents';
import { getPerformaInvoiceById } from '@/lib/queries/performa-invoices';
import { impersonationTenantId } from '@/lib/tenant/context';

import { piStatusTone } from '../pi-status';
import { PiActions } from './pi-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

function Party({
  label,
  party,
}: {
  label: string;
  party: { name: string; legalName: string; state: string | null; gstin: string | null };
}) {
  return (
    <div>
      <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">{label}</div>
      <div className="text-ink font-medium">{party.name}</div>
      {party.legalName !== party.name && (
        <div className="text-mute text-[12.5px]">{party.legalName}</div>
      )}
      <div className="text-mute mono text-[12px]">
        {party.gstin ?? '—'} · {party.state ?? '—'}
      </div>
    </div>
  );
}

function Row({ label, value, mute }: { label: string; value: string; mute?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-mute text-[12px]">{label}</dt>
      <dd className={`mono text-[13px] tabular-nums ${mute ? 'text-mute' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}

export default async function PiDetailPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const pi = await getPerformaInvoiceById(tenantId, params.id);
  if (!pi) notFound();

  const isAdmin = ctx.user.role === 'admin';
  const canEdit = isAdmin || ctx.user.role === 'sales';
  const latestPdf = await getLatestGeneratedDocument(tenantId, 'performa_invoice', pi.id);

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10">
      <Link
        href="/pi"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Performa Invoices
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <div className="titlecaps mb-1">Performa Invoice</div>
          <h1 className="flex items-center gap-3 text-[26px] font-semibold tracking-[-0.02em]">
            <span className="mono">{pi.piNumber}</span>
            <StatusPill tone={piStatusTone(pi.status)}>{pi.status}</StatusPill>
          </h1>
          <p className="text-mute mt-1 text-[13px]">
            Prepared by <span className="text-ink">{pi.preparedByName}</span> ·{' '}
            {formatDate(new Date(pi.piDate + 'T00:00:00Z'))}
            {pi.quoteNumber && (
              <>
                {' '}
                · from{' '}
                <Link href={`/quotations/${pi.quotationId}`} className="text-ink hover:underline">
                  {pi.quoteNumber}
                </Link>
              </>
            )}
          </p>
        </div>
        <PiActions
          id={pi.id}
          piNumber={pi.piNumber}
          status={pi.status}
          isAdmin={isAdmin}
          canEdit={canEdit}
          role={ctx.user.role}
          order={pi.order}
          lastGeneratedAt={latestPdf ? latestPdf.generatedAt.toISOString() : null}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps text-mute mb-3">Parties</div>
            {pi.threeParty ? (
              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <Party label="Bill to" party={pi.billTo} />
                <Party label="Ship to" party={pi.shipTo} />
              </div>
            ) : (
              <div className="text-[13px]">
                <Party label="Bill to & Ship to" party={pi.billTo} />
                <div className="text-mute mt-1 text-[12px]">Ship-To same as Bill-To.</div>
              </div>
            )}
            <div className="border-line mt-4 grid grid-cols-2 gap-4 border-t pt-4 text-[13px]">
              <div>
                <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">
                  Place of supply
                </div>
                <div className="mono text-ink text-[15px]">{pi.placeOfSupply}</div>
                <div className="text-mute text-[12px]">
                  Tenant state: <span className="mono">{pi.tenantStateAtIssue}</span>
                </div>
              </div>
              <div>
                <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">
                  Tax classification
                </div>
                <StatusPill tone={pi.isInterState ? 'am' : 'in'}>
                  {pi.isInterState ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}
                </StatusPill>
                <div className="text-mute mt-1 text-[12px]">
                  Valid until{' '}
                  <span className="mono">{formatDate(new Date(pi.validUntil + 'T00:00:00Z'))}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps text-mute mb-3">Line items</div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-mute border-line border-b text-left text-[11px] uppercase tracking-[0.06em]">
                  <th className="py-2 pr-2 font-medium">Product</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 text-right font-medium">Unit price</th>
                  <th className="px-2 py-2 text-right font-medium">GST</th>
                  <th className="py-2 pl-2 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody>
                {pi.lines.map((l) => (
                  <tr key={l.id} className="border-line border-b last:border-b-0">
                    <td className="py-3 pr-2">
                      <div className="text-ink font-medium">{l.productName}</div>
                      <div className="text-mute mono text-[11px]">
                        {l.productSku} · HSN {l.hsnCode}
                        {l.description && ` · ${l.description}`}
                      </div>
                    </td>
                    <td className="mono px-2 py-3 text-right tabular-nums">
                      {l.quantity} {l.unitOfMeasure}
                    </td>
                    <td className="mono px-2 py-3 text-right tabular-nums">
                      {formatINRExact(l.unitPrice)}
                    </td>
                    <td className="mono text-mute px-2 py-3 text-right">{l.gstRate}%</td>
                    <td className="mono py-3 pl-2 text-right tabular-nums">
                      {formatINRExact(l.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {pi.termsAndConditions && (
            <section className="border-line rounded-[6px] border bg-white p-5">
              <div className="titlecaps text-mute mb-3">Terms &amp; conditions</div>
              <p className="text-ink whitespace-pre-wrap text-[13px] leading-relaxed">
                {pi.termsAndConditions}
              </p>
            </section>
          )}

          {pi.notes && (
            <section className="border-line rounded-[6px] border bg-amber-50 p-5">
              <div className="titlecaps text-mute mb-2">Internal notes</div>
              <p className="text-ink whitespace-pre-wrap text-[13px]">{pi.notes}</p>
            </section>
          )}

          {pi.cancelledReason && (
            <section className="rounded-[6px] border border-rose-200 bg-rose-50 p-5">
              <div className="titlecaps text-mute mb-2">Cancellation reason</div>
              <p className="text-ink whitespace-pre-wrap text-[13px]">{pi.cancelledReason}</p>
            </section>
          )}

          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps text-mute mb-3">Activity</div>
            {pi.history.length === 0 ? (
              <p className="text-mute text-[12.5px]">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-[12.5px]">
                {pi.history.map((h) => (
                  <li key={h.id} className="border-line flex items-baseline gap-3 border-l-2 pl-3">
                    <span className="text-mute mono w-20 shrink-0 text-[11px]">
                      {h.transitionedAt.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                    <span className="text-ink">
                      {h.fromStatus ? `${h.fromStatus} → ` : ''}
                      <span className="font-medium">{h.toStatus}</span>
                      {h.actorName && <span className="text-mute"> · {h.actorName}</span>}
                      {h.reason && <span className="text-mute"> · {h.reason}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="border-line sticky top-4 self-start rounded-[6px] border bg-white p-5">
          <div className="titlecaps text-mute mb-3">Totals</div>
          <dl className="space-y-2 text-[13px]">
            <Row label="Subtotal" value={formatINRExact(pi.subtotal)} />
            {pi.discountAmount > 0 && (
              <Row
                label={`Discount${pi.discountType === 'percent' ? ` (${pi.discountValue}%)` : ''}`}
                value={`− ${formatINRExact(pi.discountAmount)}`}
                mute
              />
            )}
            <Row label="Taxable" value={formatINRExact(pi.taxableAmount)} />
            {pi.igstAmount > 0 ? (
              <Row label="IGST" value={formatINRExact(pi.igstAmount)} />
            ) : (
              <>
                <Row label="CGST" value={formatINRExact(pi.cgstAmount)} />
                <Row label="SGST" value={formatINRExact(pi.sgstAmount)} />
              </>
            )}
          </dl>
          <div className="border-line mt-4 flex items-baseline justify-between border-t pt-3">
            <span className="text-mute text-[12px]">Total</span>
            <span className="text-ink mono text-[22px] font-semibold tabular-nums">
              {formatINRExact(pi.totalAmount)}
            </span>
          </div>
          {pi.order && (
            <Link
              href={`/orders/${pi.order.id}`}
              className="border-line hover:bg-paper-2 mt-4 block rounded-[4px] border px-3 py-2 text-center text-[12.5px]"
            >
              Order <span className="mono">{pi.order.orderNumber}</span> →
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
