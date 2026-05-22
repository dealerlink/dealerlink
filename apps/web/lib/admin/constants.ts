/**
 * Indian states are canonicalised as ISO 3166-2:IN codes — the single source
 * of truth lives in `@dealerlink/schemas` (DEV.33). Re-exported here so the
 * operator console keeps one import path; never hardcode state strings.
 */
export {
  INDIAN_STATES,
  INDIAN_STATE_CODES,
  INDIAN_STATE_OPTIONS,
  formatStateLabel,
  getStateName,
  type IndianStateCode,
} from '@dealerlink/schemas';

export const DEFAULT_DOC_PREFIXES = {
  quotation: 'QT',
  proforma: 'PI',
  order: 'ORD',
  invoice: 'INV',
  payment: 'PAY',
  dispatch: 'DSP',
} as const;
