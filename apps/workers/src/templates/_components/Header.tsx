/**
 * Document header band — tenant branding (left) + document identity (right).
 *
 * The logo is optional: when `billFrom.logoUrl` is null the band falls back
 * to the tenant legal name set in the accent colour (DEV.16 — many tenants
 * have no logo until DO Spaces ships).
 */
import { formatDocDate } from '../../lib/format';
import type { PdfBillFrom } from '../types';

interface HeaderProps {
  billFrom: PdfBillFrom;
  /** Banner title — "QUOTATION", "PERFORMA INVOICE", … */
  documentTitle: string;
  /** Label for the number row — "Quote No.", "PI No.", … */
  numberLabel: string;
  quoteNumber: string;
  revision: number;
  quoteDate: string;
  validUntil: string;
}

export function Header({
  billFrom,
  documentTitle,
  numberLabel,
  quoteNumber,
  revision,
  quoteDate,
  validUntil,
}: HeaderProps) {
  return (
    <div className="hdr">
      <div className="hdr-left">
        {billFrom.logoUrl ? (
          <img className="logo" src={billFrom.logoUrl} alt={billFrom.legalName} />
        ) : (
          <div className="logo-fallback">{billFrom.name}</div>
        )}
        <div className="tenant-name">{billFrom.legalName}</div>
        <div className="tenant-meta">
          {billFrom.addressLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div>
            GSTIN <span className="mono">{billFrom.gstin ?? '—'}</span>
            {billFrom.pan ? (
              <>
                {'  ·  '}PAN <span className="mono">{billFrom.pan}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="hdr-right">
        <div className="doc-title">
          {documentTitle}
          {revision > 1 ? <span className="rev-badge">REV {revision}</span> : null}
        </div>
        <table className="doc-meta">
          <tbody>
            <tr>
              <td className="k">{numberLabel}</td>
              <td className="v mono">{quoteNumber}</td>
            </tr>
            <tr>
              <td className="k">Date</td>
              <td className="v mono">{formatDocDate(quoteDate)}</td>
            </tr>
            <tr>
              <td className="k">Valid Until</td>
              <td className="v mono">{formatDocDate(validUntil)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
