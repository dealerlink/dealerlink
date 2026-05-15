/**
 * Tax summary block — subtotal → discount → taxable → GST → grand total,
 * plus the legal "Amount in words" line.
 *
 * GST is shown as EITHER CGST + SGST (intra-state) OR IGST (inter-state),
 * never both — `isInterState` decides (CLAUDE.md §6). For intra-state the
 * rate label is halved per component (CGST 9% + SGST 9% for an 18% line).
 */
import { formatMoney } from '../../lib/format';
import type { QuotationPdfData } from '../types';

type TaxSummaryProps = Pick<
  QuotationPdfData,
  | 'subtotal'
  | 'discountLabel'
  | 'discountAmount'
  | 'taxableAmount'
  | 'cgstAmount'
  | 'sgstAmount'
  | 'igstAmount'
  | 'gstRateLabel'
  | 'totalAmount'
  | 'amountInWords'
  | 'isInterState'
>;

export function TaxSummary(props: TaxSummaryProps) {
  const halfRate = props.gstRateLabel != null ? `${Number(props.gstRateLabel) / 2}%` : '';
  const fullRate = props.gstRateLabel != null ? `${props.gstRateLabel}%` : '';

  return (
    <div className="summary">
      <div className="words">
        <div className="titlecaps">Amount Chargeable (in words)</div>
        <div className="words-value">{props.amountInWords}</div>
      </div>

      <table className="totals">
        <tbody>
          <tr>
            <td className="k">Subtotal</td>
            <td className="v mono">{formatMoney(props.subtotal)}</td>
          </tr>
          {props.discountAmount > 0 ? (
            <tr>
              <td className="k">
                Discount{props.discountLabel ? ` (${props.discountLabel})` : ''}
              </td>
              <td className="v mono">− {formatMoney(props.discountAmount)}</td>
            </tr>
          ) : null}
          <tr className="rule">
            <td className="k">Taxable Amount</td>
            <td className="v mono">{formatMoney(props.taxableAmount)}</td>
          </tr>
          {props.isInterState ? (
            <tr>
              <td className="k">IGST {fullRate}</td>
              <td className="v mono">{formatMoney(props.igstAmount)}</td>
            </tr>
          ) : (
            <>
              <tr>
                <td className="k">CGST {halfRate}</td>
                <td className="v mono">{formatMoney(props.cgstAmount)}</td>
              </tr>
              <tr>
                <td className="k">SGST {halfRate}</td>
                <td className="v mono">{formatMoney(props.sgstAmount)}</td>
              </tr>
            </>
          )}
          <tr className="grand">
            <td className="k">Grand Total</td>
            <td className="v mono">₹{formatMoney(props.totalAmount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
