/** Indian number formatting utilities per CLAUDE.md §5 typography rules */

const LAKH = 100_000;
const CRORE = 10_000_000;

type FormatINROptions = {
  /**
   * When true, auto-scales large numbers:
   *   >= 1 Cr  → "₹3.42 Cr"
   *   >= 1 L   → "₹47.80 L"
   *   < 1 L    → "₹14,82,000"
   *
   * Default: true
   */
  autoScale?: boolean;
  /** Number of decimal places when auto-scaling. Default: 2 */
  scaledDecimals?: number;
  /** Include ₹ symbol. Default: true */
  symbol?: boolean;
};

/**
 * Format a number as Indian Rupees.
 *
 * Uses en-IN locale for lakh/crore grouping.
 * Auto-scales to L/Cr for values >= 1 lakh (prototype display style).
 *
 * @example
 *   formatINR(34200000)  → "₹3.42 Cr"
 *   formatINR(4780000)   → "₹47.80 L"
 *   formatINR(148200)    → "₹1,48,200"
 *   formatINR(14820)     → "₹14,820"
 */
export function formatINR(
  value: number,
  { autoScale = true, scaledDecimals = 2, symbol = true }: FormatINROptions = {},
): string {
  const prefix = symbol ? '₹' : '';

  if (autoScale) {
    if (Math.abs(value) >= CRORE) {
      const scaled = value / CRORE;
      return `${prefix}${scaled.toFixed(scaledDecimals)} Cr`;
    }
    if (Math.abs(value) >= LAKH) {
      const scaled = value / LAKH;
      return `${prefix}${scaled.toFixed(scaledDecimals)} L`;
    }
  }

  // For values < 1 lakh (or autoScale=false), use full Indian grouping
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

  return `${prefix}${formatted}`;
}

/**
 * Format a number with Indian grouping (no auto-scale, for table cells showing exact amounts).
 *
 * @example
 *   formatINRExact(14820000) → "₹1,48,20,000"
 */
export function formatINRExact(
  value: number,
  { symbol = true }: Pick<FormatINROptions, 'symbol'> = {},
): string {
  const prefix = symbol ? '₹' : '';
  return `${prefix}${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

/** Format a percentage for display (e.g., 68 → "68%") */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/** Format Indian date for display (e.g., new Date() → "07 May 2026") */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** Validate basic GSTIN format (15 chars, specific pattern) */
export function isValidGSTIN(gstin: string): boolean {
  // GSTIN: 2-digit state code + 10-char PAN + 1-digit entity + Z + checksum
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/.test(gstin.toUpperCase());
}
