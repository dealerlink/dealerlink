import { describe, expect, it } from 'vitest';

import { formatINR, formatINRExact, formatTaxAmount } from './index';

// Regression coverage for UX finding P-9: a grouping space rendered as
// "₹41, 418" in the payment allocation panel. The grouped output must contain
// digits, commas and an optional decimal point only — never whitespace.
const NO_WHITESPACE_IN_GROUPING = /^₹[\d,]+(\.\d+)?$/;

describe('formatINRExact — Indian grouping, no whitespace (P-9)', () => {
  it('groups lakhs/crores with bare commas', () => {
    expect(formatINRExact(1234567)).toBe('₹12,34,567');
    expect(formatINRExact(41418)).toBe('₹41,418');
    expect(formatINRExact(14820000)).toBe('₹1,48,20,000');
  });

  it('never emits a space inside the grouping', () => {
    for (const v of [41418, 1234567, 148200, 12345678, 100000]) {
      expect(formatINRExact(v)).toMatch(NO_WHITESPACE_IN_GROUPING);
    }
  });
});

describe('formatINR — grouped (non-scaled) path has no grouping whitespace (P-9)', () => {
  it('formats sub-lakh values with bare commas', () => {
    expect(formatINR(41418)).toBe('₹41,418');
    expect(formatINR(41418)).toMatch(NO_WHITESPACE_IN_GROUPING);
  });

  it('with autoScale disabled, large values group without spaces', () => {
    expect(formatINR(1234567, { autoScale: false })).toBe('₹12,34,567');
    expect(formatINR(1234567, { autoScale: false })).toMatch(NO_WHITESPACE_IN_GROUPING);
  });

  it('auto-scales lakh/crore (suffix space is intentional, outside grouping)', () => {
    expect(formatINR(4780000)).toBe('₹47.80 L');
    expect(formatINR(34200000)).toBe('₹3.42 Cr');
  });
});

describe('minDecimals / formatTaxAmount — P-8, the dropped second decimal', () => {
  it('DEFAULT IS UNCHANGED — the option is opt-in', () => {
    // The load-bearing assertion of D-6 option (c): 121 call sites across 30
    // files keep their current output because the default stays 0.
    expect(formatINRExact(211.5)).toBe('₹211.5');
    expect(formatINRExact(19929.2)).toBe('₹19,929.2');
    expect(formatINRExact(1234567)).toBe('₹12,34,567');
  });

  it('forces the second decimal when asked', () => {
    expect(formatINRExact(211.5, { minDecimals: 2 })).toBe('₹211.50');
    expect(formatINRExact(19929.2, { minDecimals: 2 })).toBe('₹19,929.20');
  });

  it('pads a whole rupee amount to 2dp rather than leaving it bare', () => {
    expect(formatINRExact(37492, { minDecimals: 2 })).toBe('₹37,492.00');
  });

  it('never invents a third decimal — maximumFractionDigits still caps at 2', () => {
    expect(formatINRExact(562.394, { minDecimals: 2 })).toBe('₹562.39');
  });

  it('formatTaxAmount is the named 2dp wrapper, and matches the option form', () => {
    for (const v of [211.5, 19929.2, 37492, 562.39, 0]) {
      expect(formatTaxAmount(v)).toBe(formatINRExact(v, { minDecimals: 2 }));
    }
    expect(formatTaxAmount(211.5)).toBe('₹211.50');
    expect(formatTaxAmount(562.39, { symbol: false })).toBe('562.39');
  });

  it('keeps P-9 — no whitespace inside the grouping when padding', () => {
    for (const v of [100000.5, 1234567.8, 12345678.9]) {
      expect(formatTaxAmount(v)).not.toMatch(/\s/);
    }
  });
});
