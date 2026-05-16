/**
 * Typed inputs for the quotation PDF template.
 *
 * Every field the template renders is declared here — there is no `any` in
 * the template props (Day 10 guardrail). The data loader in `quotation.tsx`
 * builds one of these from the DB; the React components only ever read it.
 */

/** A party block — Bill-From, Bill-To, or Ship-To. */
export interface PdfParty {
  /** Trading / display name. */
  name: string;
  /** Registered legal name (may equal `name`). */
  legalName: string;
  /** Address lines, already split and non-empty. */
  addressLines: string[];
  gstin: string | null;
  /** Contact person — shown for dealer parties only. */
  contact?: string | null;
}

/** Bill-From (the tenant / distributor) — carries logo + PAN. */
export interface PdfBillFrom extends PdfParty {
  pan: string | null;
  /** Logo as a data URI or Spaces URL; null → text fallback. */
  logoUrl: string | null;
}

/** One rendered line item with its tax breakdown (from @dealerlink/tax). */
export interface PdfLineItem {
  lineNumber: number;
  sku: string;
  name: string;
  hsnCode: string;
  description: string | null;
  quantity: number;
  unitOfMeasure: string;
  unitPrice: number;
  /** Per-line discount — placeholder column, always 0 in Phase 1. */
  lineDiscount: number;
  taxableValue: number;
  gstRate: number;
  gstAmount: number;
  lineTotal: number;
}

/** Tenant bank details for the invoice-footer block. */
export interface PdfBankDetails {
  name: string;
  accountNumber: string;
  ifsc: string;
  branch: string | null;
}

export interface QuotationPdfData {
  /** Banner title in the header, e.g. "QUOTATION" or "PERFORMA INVOICE". */
  documentTitle: string;
  /** Label for the document-number row, e.g. "Quote No." or "PI No.". */
  numberLabel: string;

  quoteNumber: string;
  revision: number;
  quoteDate: string;
  validUntil: string;
  status: string;
  currency: string;

  tenantStateAtIssue: string;
  placeOfSupply: string;
  isInterState: boolean;

  billFrom: PdfBillFrom;
  billTo: PdfParty;
  /**
   * Ship-To party. `null` for quotations (Ship-To == Bill-To — the template
   * renders a "Ship-To same as Bill-To" note). Day 11 invoices pass a
   * distinct party here and the same component renders it (CLAUDE.md §6).
   */
  shipTo: PdfParty | null;

  lines: PdfLineItem[];

  subtotal: number;
  discountLabel: string | null;
  discountAmount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  /** Effective GST rate for the summary label, e.g. "18". Mixed → null. */
  gstRateLabel: string | null;
  totalAmount: number;
  amountInWords: string;

  termsAndConditions: string | null;
  bank: PdfBankDetails | null;

  generatedAt: Date;
}
