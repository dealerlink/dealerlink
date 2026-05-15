import { Decimal } from 'decimal.js';

/**
 * Global Decimal configuration for the whole tax engine.
 *
 * - precision 30: far beyond any realistic invoice — guarantees intermediate
 *   products (quantity × price × rate) never lose significant digits.
 * - ROUND_HALF_UP: the rounding mode used by Indian invoicing for money.
 *
 * Importing this module anywhere in the package installs this config; every
 * other engine file imports `toDecimal`/`sumDecimals` from here, so the
 * config is always applied before any arithmetic runs.
 */
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/** Normalise any accepted money input to an exact Decimal. */
export function toDecimal(value: number | string | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

/** Exact summation of a list of Decimals (empty list → 0). */
export function sumDecimals(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), new Decimal(0));
}

export { Decimal };
