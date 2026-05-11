import { describe, expect, it } from 'vitest';

import {
  gstinCheckChar,
  isValidGSTIN,
  isValidGSTINChecksum,
  isValidGSTINFormat,
  isValidIFSC,
  isValidPAN,
  isValidPincode,
  panFromGSTIN,
} from './index';

describe('GSTIN format', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(isValidGSTINFormat('27AABCD1234E1Z8')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidGSTINFormat('27AABCD1234E1Z')).toBe(false);
    expect(isValidGSTINFormat('27AABCD1234E1Z88')).toBe(false);
  });

  it('rejects bad shape', () => {
    expect(isValidGSTINFormat('AAABCD1234E1Z5')).toBe(false); // letters in state position
    expect(isValidGSTINFormat('27AABCD1234E1!8')).toBe(false); // non-alnum in checksum slot
  });

  it('is case-insensitive — lowercase input is normalised', () => {
    expect(isValidGSTINFormat('27aabcd1234e1z8')).toBe(true);
  });
});

describe('GSTIN checksum', () => {
  it('computes the expected check digit', () => {
    expect(gstinCheckChar('27AABCD1234E1Z')).toBe('8');
    expect(gstinCheckChar('29AABCS9999P1Z')).toBe('Y');
  });

  it('validates a known-good GSTIN', () => {
    expect(isValidGSTINChecksum('27AABCD1234E1Z8')).toBe(true);
    expect(isValidGSTIN('27AABCD1234E1Z8')).toBe(true);
  });

  it('rejects tampered last digit', () => {
    expect(isValidGSTIN('27AABCD1234E1Z5')).toBe(false);
    expect(isValidGSTINChecksum('27AABCD1234E1Z9')).toBe(false);
  });
});

describe('panFromGSTIN', () => {
  it('extracts the PAN substring', () => {
    expect(panFromGSTIN('27AABCD1234E1Z8')).toBe('AABCD1234E');
  });
  it('returns null on bad format', () => {
    expect(panFromGSTIN('not a gstin')).toBeNull();
  });
});

describe('PAN validation', () => {
  it('accepts a valid PAN', () => {
    expect(isValidPAN('AABCD1234E')).toBe(true);
  });
  it('rejects malformed PAN', () => {
    expect(isValidPAN('AABCD12345')).toBe(false);
    expect(isValidPAN('12345ABCDE')).toBe(false);
  });
});

describe('pincode validation', () => {
  it('accepts 6 digits not starting with 0', () => {
    expect(isValidPincode('400093')).toBe(true);
    expect(isValidPincode('560095')).toBe(true);
  });
  it('rejects leading zero or wrong length', () => {
    expect(isValidPincode('040093')).toBe(false);
    expect(isValidPincode('40093')).toBe(false);
    expect(isValidPincode('4000935')).toBe(false);
  });
});

describe('IFSC validation', () => {
  it('accepts the 4-letter + 0 + 6-alnum form', () => {
    expect(isValidIFSC('HDFC0001234')).toBe(true);
    expect(isValidIFSC('ICIC0000032')).toBe(true);
  });
  it('rejects wrong shape', () => {
    expect(isValidIFSC('HDFC1001234')).toBe(false); // 5th must be 0
    expect(isValidIFSC('hdfc0001234')).toBe(true); // case is normalized
  });
});
