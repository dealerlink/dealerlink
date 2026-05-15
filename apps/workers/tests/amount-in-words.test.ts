import { describe, expect, it } from 'vitest';

import { amountInWords } from '../src/lib/amount-in-words';

describe('amountInWords — Indian numbering', () => {
  const cases: Array<[number | string, string]> = [
    [0, 'Rupees Zero Only'],
    [1, 'Rupees One Only'],
    [99, 'Rupees Ninety Nine Only'],
    [100, 'Rupees One Hundred Only'],
    [1_000, 'Rupees One Thousand Only'],
    [99_999, 'Rupees Ninety Nine Thousand Nine Hundred Ninety Nine Only'],
    [100_000, 'Rupees One Lakh Only'],
    [9_999_999, 'Rupees Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine Only'],
    [10_000_000, 'Rupees One Crore Only'],
    [127_200.5, 'Rupees One Lakh Twenty Seven Thousand Two Hundred and Fifty Paise Only'],
  ];

  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      expect(amountInWords(input)).toBe(expected);
    });
  }

  it('accepts a fixed-2dp decimal string (tax-engine serialize output)', () => {
    expect(amountInWords('1770000.00')).toBe('Rupees Seventeen Lakh Seventy Thousand Only');
  });

  it('reads the reference grand total from CLAUDE.md §6', () => {
    expect(amountInWords(127_200)).toBe('Rupees One Lakh Twenty Seven Thousand Two Hundred Only');
  });

  it('throws on a non-numeric input', () => {
    expect(() => amountInWords('not-a-number')).toThrow(/finite number/);
  });
});
