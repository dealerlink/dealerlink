/**
 * Number + date formatting for PDF documents.
 *
 * All money is formatted with the Indian grouping (`1,27,200.00`, not
 * `127,200.00`) at exactly 2 decimal places — GST documents must show paise.
 * Dates use the `DD-MMM-YYYY` form used across Dealerlink letterheads.
 */

const INR = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a rupee amount with Indian grouping and 2 decimals (no symbol). */
export function formatMoney(value: number): string {
  return INR.format(value);
}

/** Format a rupee amount with the ₹ symbol. */
export function formatINR(value: number): string {
  return `₹${INR.format(value)}`;
}

/** Format a GST rate as a percentage — `18%`, `12.5%` (no trailing `.0`). */
export function formatRate(rate: number): string {
  return `${rate}%`;
}

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** Format a date-only string (`2026-05-15`) or Date as `15-May-2026`. */
export function formatDocDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value;
  return DATE.format(d).replace(/ /g, '-');
}

/** Format a timestamp as `15-May-2026 14:30 IST` for the generated-on footer. */
export function formatGeneratedAt(d: Date): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
    .format(d)
    .replace(/ /g, '-');
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(d);
  return `${date} ${time} IST`;
}
