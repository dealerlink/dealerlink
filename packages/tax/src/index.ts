/**
 * @dealerlink/tax — the authoritative GST computation engine.
 *
 * This package is a PURE library: it depends only on `decimal.js`, performs
 * no I/O, and imports nothing from the app, the DB, or any framework. The
 * single entry point is `computeTax`; everything else is types and helpers.
 */
export {
  TaxComputationError,
  type GstRate,
  type TaxLineInput,
  type TaxDiscount,
  type TaxComputationInput,
  type TaxLineOutput,
  type TaxComputationOutput,
  type TaxErrorCode,
} from './types';

export { computeTax } from './compute';
export { serializeOutput, type SerializedTaxOutput, type SerializedTaxLine } from './serialize';

export { toDecimal, sumDecimals, Decimal } from './decimal';
export { round2 } from './round';
export { isInterState } from './state';
