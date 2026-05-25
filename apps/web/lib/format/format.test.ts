import { describe, expect, it } from 'vitest';

import { formatINR, formatINRExact } from './index';

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
