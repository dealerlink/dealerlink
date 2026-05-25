/** Indian number formatting utilities per docs/DESIGN_SYSTEM.md typography rules */

const LAKH = 100_000;
const CRORE = 10_000_000;

/**
 * Indian-grouped number string with NO whitespace inside the grouping.
 *
 * `Intl.NumberFormat('en-IN')` groups with a plain comma on full-ICU Node, but
 * some ICU builds / browser locale data emit a no-break (U+00A0) or thin
 * (U+202F / U+2009) space as — or beside — the grouping separator, which
 * rendered as "₹41, 418" in the payment allocation panel (UX finding P-9).
 * Stripping all whitespace guarantees "₹41,418" on every runtime. The " L" /
 * " Cr" scale suffixes are appended by callers, outside this helper, so they
 * are unaffected.
 */
function groupedINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
    .format(value)
    .replace(/\s+/g, '');
}

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
  return `${prefix}${groupedINR(value)}`;
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
  return `${prefix}${groupedINR(value)}`;
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

/** Format check: 15 chars, state-code + PAN + entity + Z + checksum */
export function isValidGSTINFormat(gstin: string): boolean {
  // GSTIN: 2-digit state code + 10-char PAN + 1-digit entity + Z + checksum
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/.test(gstin.toUpperCase());
}

const GSTIN_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinCharValue(ch: string): number {
  const idx = GSTIN_CHARSET.indexOf(ch);
  if (idx < 0) throw new Error('invalid GSTIN character');
  return idx;
}

/**
 * Verify the GSTIN check digit (position 15) using the standard
 * mod-36 algorithm published by GSTN.
 *
 *   For each of the first 14 characters with alternating factor 1/2,
 *   sum = Σ ((value * factor) / 36 + (value * factor) % 36)
 *   check = (36 - sum % 36) % 36
 *
 * The 15th character must equal that check value.
 */
export function isValidGSTINChecksum(gstin: string): boolean {
  const g = gstin.toUpperCase();
  if (g.length !== 15) return false;
  let sum = 0;
  let factor = 1;
  for (let i = 0; i < 14; i++) {
    const ch = g[i];
    if (!ch) return false;
    let v: number;
    try {
      v = gstinCharValue(ch);
    } catch {
      return false;
    }
    const p = v * factor;
    sum += Math.floor(p / 36) + (p % 36);
    factor = factor === 1 ? 2 : 1;
  }
  const expected = (36 - (sum % 36)) % 36;
  const expectedCh = GSTIN_CHARSET[expected];
  return expectedCh === g[14];
}

/** Validate GSTIN format and checksum (used at the form + server boundary). */
export function isValidGSTIN(gstin: string): boolean {
  return isValidGSTINFormat(gstin) && isValidGSTINChecksum(gstin);
}

/**
 * Compute the GSTIN check character for a 14-character prefix
 * (state + PAN + entity + 'Z'). Returns the single character that, when
 * appended, produces a checksum-valid GSTIN. Useful for tests + fixtures.
 */
export function gstinCheckChar(prefix14: string): string {
  const p = prefix14.toUpperCase();
  if (p.length !== 14) throw new Error('prefix must be 14 characters');
  let sum = 0;
  let factor = 1;
  for (let i = 0; i < 14; i++) {
    const ch = p[i];
    if (!ch) throw new Error('invalid prefix');
    const v = gstinCharValue(ch);
    const prod = v * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
    factor = factor === 1 ? 2 : 1;
  }
  const check = (36 - (sum % 36)) % 36;
  const ch = GSTIN_CHARSET[check];
  if (!ch) throw new Error('checksum computation failed');
  return ch;
}

/**
 * Derive the PAN portion of a GSTIN (positions 3..12). Useful as a default
 * when the operator hasn't entered PAN separately. Returns null when the
 * GSTIN format is wrong (no PAN to extract).
 */
export function panFromGSTIN(gstin: string): string | null {
  const g = gstin.toUpperCase();
  if (!isValidGSTINFormat(g)) return null;
  return g.slice(2, 12);
}

/** Indian PAN format: 5 letters + 4 digits + 1 letter. */
export function isValidPAN(pan: string): boolean {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(pan.toUpperCase());
}

/** Indian pincode: exactly 6 digits, leading digit 1-9. */
export function isValidPincode(pincode: string): boolean {
  return /^[1-9]\d{5}$/.test(pincode);
}

/** Indian IFSC: 4 letters + '0' + 6 alphanumerics. */
export function isValidIFSC(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase());
}
