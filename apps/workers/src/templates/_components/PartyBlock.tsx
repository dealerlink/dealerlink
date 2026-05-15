/**
 * A single party card — Bill-To or Ship-To.
 *
 * Three-party support (CLAUDE.md §6): the template always renders Bill-To.
 * For quotations Ship-To equals Bill-To, so `note` carries the explicit
 * "Ship-To same as Bill-To" line instead of a second address. Day 11
 * invoices pass a distinct `party` and drop the note — the same component,
 * no rewrite.
 */
import type { PdfParty } from '../types';

interface PartyBlockProps {
  label: string;
  party: PdfParty | null;
  /** Shown in place of the address when `party` is null. */
  note?: string;
}

export function PartyBlock({ label, party, note }: PartyBlockProps) {
  return (
    <div className="party">
      <div className="party-label titlecaps">{label}</div>
      {party ? (
        <>
          <div className="party-name">{party.name}</div>
          {party.legalName !== party.name ? (
            <div className="party-line">{party.legalName}</div>
          ) : null}
          {party.addressLines.map((line, i) => (
            <div className="party-line" key={i}>
              {line}
            </div>
          ))}
          {party.contact ? <div className="party-line">Attn: {party.contact}</div> : null}
          <div className="party-gstin">
            GSTIN <span className="mono">{party.gstin ?? '—'}</span>
          </div>
        </>
      ) : (
        <div className="party-note">{note ?? 'Same as Bill-To'}</div>
      )}
    </div>
  );
}
