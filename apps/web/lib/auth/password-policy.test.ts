import { describe, expect, it } from 'vitest';

import { evaluatePasswordStrength, newPasswordSchema } from './password-policy';

describe('newPasswordSchema', () => {
  it('accepts a password meeting every rule', () => {
    expect(newPasswordSchema.safeParse('Sunshine9!').success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const r = newPasswordSchema.safeParse('Ab9!');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/at least 8/i);
  });

  it('rejects a password with no uppercase letter', () => {
    const r = newPasswordSchema.safeParse('sunshine9!');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/uppercase/i);
  });

  it('rejects a password with no number', () => {
    const r = newPasswordSchema.safeParse('Sunshine!!');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/number/i);
  });

  it('rejects a password with no special character', () => {
    const r = newPasswordSchema.safeParse('Sunshine99');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toMatch(/special/i);
  });

  it('accepts the temporary-password shape (upper/lower/digit/symbol)', () => {
    // The generator (admin/credentials.ts) always satisfies the policy.
    expect(newPasswordSchema.safeParse('Kp7#mt2@qWx').success).toBe(true);
  });
});

describe('evaluatePasswordStrength', () => {
  it('reports an empty value as score 0 / invalid', () => {
    const s = evaluatePasswordStrength('');
    expect(s.score).toBe(0);
    expect(s.label).toBe('Empty');
    expect(s.valid).toBe(false);
  });

  it('flags a value that meets some but not all rules as invalid', () => {
    const s = evaluatePasswordStrength('sunshine'); // length only
    expect(s.valid).toBe(false);
    expect(s.checks).toEqual({ length: true, uppercase: false, number: false, special: false });
  });

  it('marks a fully-compliant password as valid', () => {
    const s = evaluatePasswordStrength('Sunshine9!');
    expect(s.valid).toBe(true);
    expect(s.checks).toEqual({ length: true, uppercase: true, number: true, special: true });
    expect(s.score).toBeGreaterThanOrEqual(3);
  });

  it('awards the top score to a long compliant password', () => {
    const s = evaluatePasswordStrength('Sunshine9!extra'); // 15 chars, all rules
    expect(s.score).toBe(4);
    expect(s.label).toBe('Strong');
  });

  it('never returns a score below 1 for a non-empty value', () => {
    expect(evaluatePasswordStrength('a').score).toBeGreaterThanOrEqual(1);
  });
});
