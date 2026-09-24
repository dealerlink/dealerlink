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

/**
 * One distinct GST rate present on a document, with the split already decided by
 * the engine (F.4). Half-rates on an intra-state document, the full rate
 * inter-state; the unused side is `null` rather than zero, so a template cannot
 * print a 0% row by accident.
 */
export interface PdfTaxRateGroup {
  rate: number;
  cgstRate: number | null;
  cgstAmount: number;
  sgstRate: number | null;
  sgstAmount: number;
  igstRate: number | null;
  igstAmount: number;
}

/**
 * One row of the HSN/SAC summary table, keyed on the **(HSN, rate) PAIR** — not on
 * the HSN alone (F.4, D-1). A single HSN carrying two different GST rates yields two
 * rows, which is why `rate` is non-null and is a column of its own: on an
 * intra-state document only the half-rate is shown elsewhere, and a reader cannot
 * recover 18 from 9 without knowing the convention.
 */
export interface PdfTaxHsnGroup {
  hsn: string;
  rate: number;
  taxableValue: number;
  centralRate: number | null;
  centralAmount: number;
  stateRate: number | null;
  stateAmount: number;
  integratedRate: number | null;
  integratedAmount: number;
  totalTax: number;
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
  /**
   * Effective GST rate for the summary label, e.g. "18". Mixed → null.
   *
   * **On a mixed-rate document this is `null`, and `buildViewModel` turns `null`
   * into the EMPTY STRING, so the totals block renders `CGST ` with a trailing
   * space and no rate.** That is a live defect on exactly the documents F.4 exists
   * for. `taxRateGroups` below is what replaces it; this field stays until the
   * template stops reading it (F.4 A.2).
   */
  gstRateLabel: string | null;
  /**
   * One entry per distinct GST rate actually present, ascending (F.4, D-3).
   *
   * Derived in the loaders by `templates/tax-groups.ts` so that production, the
   * snapshot test and `scripts/render-typst.ts` all see it — the last of those
   * being the byte-measurement harness, which does not use `buildViewModel`
   * (F.108).
   */
  taxRateGroups: PdfTaxRateGroup[];
  /**
   * One entry per distinct (HSN, rate) pair, ascending by HSN then rate (F.4, D-1).
   * Longer than the number of distinct HSN codes whenever one HSN carries two rates.
   */
  taxHsnGroups: PdfTaxHsnGroup[];
  totalAmount: number;
  amountInWords: string;

  termsAndConditions: string | null;
  bank: PdfBankDetails | null;

  generatedAt: Date;
}

/** One row in a receipt's allocation breakdown — an order/PI + amount. */
export interface PdfReceiptAllocation {
  /** "Order" or "Proforma Invoice". */
  documentLabel: string;
  documentNumber: string;
  amount: number;
}

/**
 * Typed inputs for the payment-receipt PDF template (Day 12). Receipts are
 * tax-neutral — no GST breakdown, no place of supply. The payer is the
 * Bill-To dealer (CLAUDE.md §6).
 */
export interface PaymentReceiptPdfData {
  billFrom: PdfBillFrom;

  receiptNumber: string;
  /** Date the money was received. */
  receiptDate: string;
  status: string;
  currency: string;

  /** The paying dealer (Bill-To). */
  receivedFrom: PdfParty;

  amount: number;
  amountInWords: string;

  /** Human-readable method label, e.g. "Bank Transfer". */
  method: string;
  reference: string | null;
  depositedToBank: string | null;
  depositedDate: string | null;

  allocations: PdfReceiptAllocation[];
  /** Amount not yet allocated — a positive advance balance. */
  unallocatedAmount: number;

  bank: PdfBankDetails | null;

  generatedAt: Date;
}

/** Logistics block for the dispatch note (Day 13). */
export interface PdfDispatchLogistics {
  vehicleNumber: string | null;
  transporterName: string | null;
  transporterDocketNumber: string | null;
  driverName: string | null;
  driverPhone: string | null;
  ewayBillNumber: string | null;
  ewayBillDate: string | null;
  expectedDeliveryDate: string | null;
}

/** One dispatch-note line — a product and the serial numbers shipped on it. */
export interface PdfDispatchLine {
  lineNumber: number;
  sku: string;
  name: string;
  quantity: number;
  /** Serial numbers shipped on this line (may include "—" for unserialised). */
  serials: string[];
}

/**
 * Typed inputs for the dispatch-note PDF template (Day 13). A dispatch note
 * is tax-neutral — no GST breakdown. The consignee is the Ship-To dealer
 * (CLAUDE.md §6 — physical goods follow delivery); Bill-To is shown only as
 * a reference sub-block.
 */
export interface DispatchNotePdfData {
  billFrom: PdfBillFrom;

  dispatchNumber: string;
  dispatchDate: string;
  status: string;

  /** Source order reference. */
  orderNumber: string;
  orderDate: string;

  /** Consignee — where the goods physically go. */
  shipTo: PdfParty;
  /** Payer — shown for reference only. */
  billTo: PdfParty;

  logistics: PdfDispatchLogistics;
  lines: PdfDispatchLine[];
  notes: string | null;

  bank: PdfBankDetails | null;

  generatedAt: Date;
}
