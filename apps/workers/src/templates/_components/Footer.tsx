/**
 * In-body document footer — Terms & Conditions and bank details.
 *
 * The repeating page-number band is the Chromium `footerTemplate` (built in
 * `quotation.tsx`), not this component. This renders the end-of-document
 * blocks: T&Cs (always, when present) and the bank block (last page).
 */
import type { PdfBankDetails } from '../types';

interface FooterProps {
  termsAndConditions: string | null;
  bank: PdfBankDetails | null;
}

export function Footer({ termsAndConditions, bank }: FooterProps) {
  return (
    <>
      {termsAndConditions ? (
        <div className="section">
          <div className="titlecaps">Terms &amp; Conditions</div>
          <div className="section-body">{termsAndConditions}</div>
        </div>
      ) : null}

      {bank ? (
        <div className="bank">
          <div className="titlecaps">Bank Details</div>
          <div className="bank-grid">
            <div className="bank-item">
              <div className="titlecaps k">Bank</div>
              <div className="v">{bank.name}</div>
            </div>
            <div className="bank-item">
              <div className="titlecaps k">Account No.</div>
              <div className="v mono">{bank.accountNumber}</div>
            </div>
            <div className="bank-item">
              <div className="titlecaps k">IFSC</div>
              <div className="v mono">{bank.ifsc}</div>
            </div>
            {bank.branch ? (
              <div className="bank-item">
                <div className="titlecaps k">Branch</div>
                <div className="v">{bank.branch}</div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
