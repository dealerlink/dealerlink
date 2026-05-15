import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { getQuotationById, getQuotationRevisionChain } from '@/lib/queries/quotations';
import { impersonationTenantId } from '@/lib/tenant/context';
import type { QuotationStatus } from '@dealerlink/schemas';

import { QuotationActions } from './quotation-actions';

export const dynamic = 'force-dynamic';

function statusTone(s: QuotationStatus): StatusTone {
  switch (s) {
    case 'draft':
      return 'mu';
    case 'sent':
      return 'in';
    case 'accepted':
      return 'em';
    case 'rejected':
      return 'ro';
    case 'expired':
      return 'am';
    case 'superseded':
      return 'mu';
    default:
      return 'mu';
  }
}

interface PageProps {
  params: { id: string };
}

export default async function QuotationDetailPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const q = await getQuotationById(tenantId, params.id);
  if (!q) notFound();

  const isAdmin = ctx.user.role === 'admin';
  const canEdit = isAdmin || (ctx.user.role === 'sales' && q.preparedBy.id === ctx.user.id);

  const chain =
    q.parentQuotationId || q.revision > 1 ? await getQuotationRevisionChain(tenantId, q.id) : [];

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10">
      <Link
        href="/quotations"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Quotations
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <div className="titlecaps mb-1">Quotation</div>
          <h1 className="flex items-center gap-3 text-[26px] font-semibold tracking-[-0.02em]">
            <span className="mono">{q.quoteNumber}</span>
            {q.revision > 1 && (
              <span className="text-mute text-[18px] font-normal">· Rev {q.revision}</span>
            )}
            <StatusPill tone={statusTone(q.status)}>{q.status}</StatusPill>
          </h1>
          <p className="text-mute mt-1 text-[13px]">
            Prepared by <span className="text-ink">{q.preparedBy.fullName}</span> ·{' '}
            {formatDate(new Date(q.quoteDate + 'T00:00:00Z'))}
            {q.sentAt && <> · Sent {formatDate(q.sentAt)}</>}
          </p>
        </div>
        <QuotationActions
          id={q.id}
          status={q.status}
          quoteNumber={q.quoteNumber}
          isAdmin={isAdmin}
          canEdit={canEdit}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps text-mute mb-3">Parties</div>
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">Bill to</div>
                <div className="text-ink font-medium">{q.dealer.name}</div>
                <div className="text-mute text-[12.5px]">{q.dealer.legalName}</div>
                <div className="text-mute mono text-[12px]">
                  {q.dealer.gstin ?? '—'} · {q.dealer.state ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">
                  Place of supply
                </div>
                <div className="mono text-ink text-[15px]">{q.placeOfSupply}</div>
                <div className="text-mute text-[12.5px]">
                  Tenant state at issue: <span className="mono">{q.tenantStateAtIssue}</span>
                </div>
                <div className="text-mute text-[12.5px]">
                  Valid until:{' '}
                  <span className="mono">{formatDate(new Date(q.validUntil + 'T00:00:00Z'))}</span>
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
                {q.lines.map((l) => (
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

          {q.termsAndConditions && (
            <section className="border-line rounded-[6px] border bg-white p-5">
              <div className="titlecaps text-mute mb-3">Terms & conditions</div>
              <p className="text-ink whitespace-pre-wrap text-[13px] leading-relaxed">
                {q.termsAndConditions}
              </p>
            </section>
          )}

          {q.notes && (
            <section className="border-line rounded-[6px] border bg-amber-50 p-5">
              <div className="titlecaps text-mute mb-2">Internal notes</div>
              <p className="text-ink whitespace-pre-wrap text-[13px]">{q.notes}</p>
            </section>
          )}

          {q.rejectedReason && (
            <section className="border-line rounded-[6px] border border-rose-200 bg-rose-50 p-5">
              <div className="titlecaps text-mute mb-2">Rejection reason</div>
              <p className="text-ink whitespace-pre-wrap text-[13px]">{q.rejectedReason}</p>
            </section>
          )}

          {chain.length > 1 && (
            <section className="border-line rounded-[6px] border bg-white p-5">
              <div className="titlecaps text-mute mb-3">Revision chain</div>
              <div className="space-y-1.5">
                {chain.map((c) => (
                  <Link
                    key={c.id}
                    href={`/quotations/${c.id}`}
                    className={`hover:bg-paper-2 flex items-center justify-between rounded-[4px] border px-3 py-2 text-[13px] ${
                      c.id === q.id ? 'border-ink' : 'border-line'
                    }`}
                  >
                    <span className="mono">
                      Rev {c.revision}
                      {c.id === q.id && <span className="text-mute ml-2">· current</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusPill tone={statusTone(c.status)}>{c.status}</StatusPill>
                      <span className="mono text-mute text-[12.5px]">
                        {formatINRExact(c.totalAmount)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps text-mute mb-3">Activity</div>
            {q.history.length === 0 ? (
              <p className="text-mute text-[12.5px]">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-[12.5px]">
                {q.history.map((h) => (
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
            <Row label="Subtotal" value={formatINRExact(q.subtotal)} />
            {q.discountAmount > 0 && (
              <Row
                label={`Discount${q.discountType === 'percent' ? ` (${q.discountValue}%)` : ''}`}
                value={`− ${formatINRExact(q.discountAmount)}`}
                mute
              />
            )}
            <Row label="Taxable" value={formatINRExact(q.taxableAmount)} />
            {q.igstAmount > 0 ? (
              <Row label="IGST" value={formatINRExact(q.igstAmount)} />
            ) : (
              <>
                <Row label="CGST" value={formatINRExact(q.cgstAmount)} />
                <Row label="SGST" value={formatINRExact(q.sgstAmount)} />
              </>
            )}
          </dl>
          <div className="border-line mt-4 flex items-baseline justify-between border-t pt-3">
            <span className="text-mute text-[12px]">Total</span>
            <span className="text-ink mono text-[22px] font-semibold tabular-nums">
              {formatINRExact(q.totalAmount)}
            </span>
          </div>
        </aside>
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
