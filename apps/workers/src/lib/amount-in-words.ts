/**
 * Indian-format amount-in-words.
 *
 * Converts a rupee amount to words using the Indian numbering system
 * (Thousand → Lakh → Crore), NOT the international system (Thousand →
 * Million). Used on quotation/invoice PDFs where the legal "Amount in
 * words" line must read the way an Indian reader expects.
 *
 *   amountInWords(127200)    → "Rupees One Lakh Twenty Seven Thousand Two Hundred Only"
 *   amountInWords(127200.50) → "Rupees One Lakh Twenty Seven Thousand Two Hundred and Fifty Paise Only"
 *   amountInWords(10000000)  → "Rupees One Crore Only"
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** Words for an integer 0–99. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const tens = TENS[Math.floor(n / 10)] ?? '';
  const ones = ONES[n % 10] ?? '';
  return ones ? `${tens} ${ones}` : tens;
}

/** Words for an integer 0–999. */
function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundred > 0) parts.push(`${ONES[hundred]} Hundred`);
  if (rest > 0) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/** Words for a non-negative integer rupee amount (Indian grouping). */
function rupeesToWords(rupees: number): string {
  if (rupees === 0) return 'Zero';

  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1_000);
  const belowThousand = rupees % 1_000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${rupeesToWords(crore)} Crore`);
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (belowThousand > 0) parts.push(threeDigits(belowThousand));

  return parts.join(' ');
}

/**
 * Convert a rupee amount to a legal "Amount in words" string.
 *
 * Accepts a number or a decimal string (e.g. the fixed-2dp strings the tax
 * engine's `serializeOutput` produces). Negative inputs are treated as their
 * absolute value — quotation/invoice totals are never negative.
 */
export function amountInWords(value: number | string): string {
  const numeric = Math.abs(typeof value === 'string' ? Number(value) : value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`amountInWords: not a finite number — ${String(value)}`);
  }

  // Work in integer paise to avoid binary-float drift on the 2dp boundary.
  const totalPaise = Math.round(numeric * 100);
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  let words = `Rupees ${rupeesToWords(rupees)}`;
  if (paise > 0) {
    words += ` and ${twoDigits(paise)} Paise`;
  }
  return `${words} Only`;
}
