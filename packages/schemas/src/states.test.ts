import { describe, expect, it } from 'vitest';

import {
  INDIAN_STATE_CODES,
  INDIAN_STATE_OPTIONS,
  formatStateLabel,
  getStateCodeFromName,
  getStateName,
  indianStateCodeSchema,
  isValidStateCode,
  normalizeStateInput,
  optionalStateCodeInputSchema,
  stateCodeInputSchema,
  type IndianStateCode,
} from './states';

describe('INDIAN_STATES canonical map', () => {
  it('covers all 28 states + 8 union territories', () => {
    expect(INDIAN_STATE_CODES).toHaveLength(36);
  });

  it('every code is exactly two uppercase letters', () => {
    for (const code of INDIAN_STATE_CODES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('round-trips code → name → code', () => {
    for (const code of INDIAN_STATE_CODES) {
      expect(getStateCodeFromName(getStateName(code))).toBe(code);
    }
  });

  it('exposes sorted {code,name} options for dropdowns', () => {
    expect(INDIAN_STATE_OPTIONS).toHaveLength(36);
    const names = INDIAN_STATE_OPTIONS.map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('migration safety net — every seeded value maps cleanly', () => {
  // Values currently persisted across the seed set (full names, both cases)
  // plus the codes the migration will produce. If any of these stops mapping,
  // the migration would leave a row that fails the new CHECK — surface it here.
  const SEEDED: Array<[string, IndianStateCode]> = [
    ['Maharashtra', 'MH'],
    ['MAHARASHTRA', 'MH'],
    ['Karnataka', 'KA'],
    ['KARNATAKA', 'KA'],
    ['Gujarat', 'GJ'],
    ['Tamil Nadu', 'TN'],
    ['TAMIL NADU', 'TN'],
    ['Rajasthan', 'RJ'],
    ['Assam', 'AS'],
    ['Uttar Pradesh', 'UP'],
  ];

  it.each(SEEDED)('getStateCodeFromName(%s) → %s', (value, code) => {
    expect(getStateCodeFromName(value)).toBe(code);
  });

  it.each(SEEDED)('normalizeStateInput(%s) → %s', (value, code) => {
    expect(normalizeStateInput(value)).toBe(code);
  });
});

describe('normalizeStateInput', () => {
  it('accepts canonical codes (any case)', () => {
    expect(normalizeStateInput('MH')).toBe('MH');
    expect(normalizeStateInput('mh')).toBe('MH');
    expect(normalizeStateInput('  Tn ')).toBe('TN');
  });

  it('accepts full names', () => {
    expect(normalizeStateInput('West Bengal')).toBe('WB');
    expect(normalizeStateInput('  delhi ')).toBe('DL');
  });

  it('resolves former names + alternate codes', () => {
    expect(normalizeStateInput('Orissa')).toBe('OD');
    expect(normalizeStateInput('Uttaranchal')).toBe('UT');
    expect(normalizeStateInput('OR')).toBe('OD');
    expect(normalizeStateInput('TS')).toBe('TG');
  });

  it('returns null for blank or unknown input', () => {
    expect(normalizeStateInput('')).toBeNull();
    expect(normalizeStateInput('   ')).toBeNull();
    expect(normalizeStateInput('Atlantis')).toBeNull();
    expect(normalizeStateInput('ZZ')).toBeNull();
  });
});

describe('isValidStateCode / getStateName', () => {
  it('validates codes', () => {
    expect(isValidStateCode('MH')).toBe(true);
    expect(isValidStateCode('mh')).toBe(false);
    expect(isValidStateCode('Maharashtra')).toBe(false);
  });

  it('formats display labels tolerantly', () => {
    expect(formatStateLabel('MH')).toBe('Maharashtra');
    expect(formatStateLabel('Maharashtra')).toBe('Maharashtra');
    expect(formatStateLabel('')).toBe('');
    expect(formatStateLabel(null)).toBe('');
    expect(formatStateLabel('Atlantis')).toBe('Atlantis');
  });
});

describe('Zod schemas', () => {
  it('indianStateCodeSchema accepts codes, rejects names + unknown codes', () => {
    expect(indianStateCodeSchema.safeParse('MH').success).toBe(true);
    expect(indianStateCodeSchema.safeParse('Maharashtra').success).toBe(false);
    expect(indianStateCodeSchema.safeParse('ZZ').success).toBe(false);
  });

  it('stateCodeInputSchema normalises codes AND names to a canonical code', () => {
    expect(stateCodeInputSchema.parse('MH')).toBe('MH');
    expect(stateCodeInputSchema.parse('Maharashtra')).toBe('MH');
    expect(stateCodeInputSchema.parse('karnataka')).toBe('KA');
    expect(stateCodeInputSchema.safeParse('Atlantis').success).toBe(false);
  });

  it('optionalStateCodeInputSchema treats blank/undefined as undefined', () => {
    expect(optionalStateCodeInputSchema.parse('')).toBeUndefined();
    expect(optionalStateCodeInputSchema.parse(undefined)).toBeUndefined();
    expect(optionalStateCodeInputSchema.parse('TN')).toBe('TN');
    expect(optionalStateCodeInputSchema.parse('Tamil Nadu')).toBe('TN');
  });
});
