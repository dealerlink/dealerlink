/**
 * Shared types for the Quotation Builder. The Builder is split into smaller
 * components for editorial clarity; they all consume these types.
 */
export interface DealerOption {
  id: string;
  label: string;
  state: string | null;
}

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  hsnCode: string;
  gstRate: number;
  defaultSellingPrice: number | null;
}

export interface DealOption {
  id: string;
  label: string;
  dealerId: string;
}

export interface UserOption {
  id: string;
  label: string;
}

export interface BuilderLineRow {
  productId: string;
  productSku: string;
  productName: string;
  hsnCode: string;
  gstRate: number;
  quantity: string;
  unitPrice: string;
  description: string;
  notes: string;
}

export interface DiscountState {
  type: 'none' | 'percent' | 'amount';
  value: string;
}

export interface BuilderFormState {
  dealerId: string;
  dealId: string;
  preparedBy: string;
  quoteDate: string;
  validUntil: string;
  placeOfSupplyOverride: string;
  termsAndConditions: string;
  notes: string;
  lines: BuilderLineRow[];
  discount: DiscountState;
}

export interface BuilderContext {
  tenantState: string;
  defaultQuoteValidity: number;
  defaultTerms: string | null;
}
