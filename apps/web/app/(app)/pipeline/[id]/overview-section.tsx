import type { DealDetail } from '@/lib/queries/deals';
import { formatINRExact } from '@/lib/format';

const SOURCE_LABEL: Record<DealDetail['source'], string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
  referral: 'Referral',
  repeat_business: 'Repeat business',
  other: 'Other',
};

export function DealOverviewSection({ deal }: { deal: DealDetail }) {
  return (
    <section className="border-line mt-8 rounded-[6px] border bg-white">
      <header className="border-line border-b px-5 py-3">
        <div className="titlecaps text-mute">Overview</div>
      </header>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 px-5 py-4 text-[13px]">
        <Field label="Dealer">
          <span className="text-ink">{deal.dealer.name}</span>{' '}
          <span className="text-mute">· {deal.dealer.legalName}</span>
        </Field>
        <Field label="GSTIN">
          <span className="mono">{deal.dealer.gstin ?? '—'}</span>
        </Field>
        <Field label="Owner">
          {deal.assignee.fullName} <span className="text-mute mono">· {deal.assignee.email}</span>
        </Field>
        <Field label="Source">{SOURCE_LABEL[deal.source]}</Field>
        <Field label="Probability">
          <span className="mono">
            {deal.probabilityPercent != null ? `${deal.probabilityPercent}%` : '—'}
          </span>
        </Field>
        <Field label="Expected close">
          <span className="mono">{deal.expectedCloseDate ?? '—'}</span>
        </Field>
        <Field label="Created">
          <span className="mono">
            {deal.createdAt.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </Field>
        <Field label="Last activity">
          <span className="mono">
            {deal.lastActivityAt.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </Field>
        {deal.estimatedValue != null && (
          <Field label="Estimated value (exact)">
            <span className="mono">{formatINRExact(deal.estimatedValue)}</span>
          </Field>
        )}
        {deal.status === 'lost' && (
          <Field label="Lost reason">
            <span className="text-rose-700">
              {deal.lostReason ?? '—'}
              {deal.lostReasonNote ? (
                <span className="text-mute"> — {deal.lostReasonNote}</span>
              ) : null}
            </span>
          </Field>
        )}
      </dl>
      {deal.notes && (
        <div className="border-line border-t px-5 py-4">
          <div className="titlecaps text-mute mb-2">Notes</div>
          <p className="text-ink whitespace-pre-wrap text-[13px] leading-relaxed">{deal.notes}</p>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-mute mb-0.5 text-[11px] uppercase tracking-[0.06em]">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
