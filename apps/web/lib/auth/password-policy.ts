import { z } from 'zod';

/**
 * Product password policy — CLAUDE.md §6:
 *   "min 8 chars, 1 uppercase, 1 number, 1 special".
 *
 * This module is the SINGLE SOURCE OF TRUTH for the rule. Both the
 * change-password form (client, react-hook-form) and the `changePassword`
 * server action import `newPasswordSchema`, so the two can never drift.
 *
 * A "special character" is anything that is neither a letter nor a digit —
 * a deliberately broad definition so users aren't fighting an opaque
 * allow-list. The temporary-password generator (admin/credentials.ts) draws
 * its symbol from `!@#$%&*`, which satisfies this rule.
 */
export const PASSWORD_MIN_LENGTH = 8;

const hasUppercase = (v: string) => /[A-Z]/.test(v);
const hasNumber = (v: string) => /[0-9]/.test(v);
const hasSpecial = (v: string) => /[^A-Za-z0-9]/.test(v);

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .refine(hasUppercase, 'Add at least one uppercase letter.')
  .refine(hasNumber, 'Add at least one number.')
  .refine(hasSpecial, 'Add at least one special character (e.g. ! @ # $).');

export interface PasswordChecks {
  length: boolean;
  uppercase: boolean;
  number: boolean;
  special: boolean;
}

export interface PasswordStrength {
  /** 0 = empty, 1 = weak … 4 = strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Empty' | 'Weak' | 'Fair' | 'Good' | 'Strong';
  /** Whether the value satisfies every policy rule. */
  valid: boolean;
  checks: PasswordChecks;
}

/**
 * Pure helper for the live strength indicator on the new-password field.
 * Counts the four policy rules met, with a bonus point for length ≥ 12.
 * `valid` is true only when all four required rules pass — the same gate the
 * Zod schema enforces.
 */
export function evaluatePasswordStrength(value: string): PasswordStrength {
  if (value.length === 0) {
    return {
      score: 0,
      label: 'Empty',
      valid: false,
      checks: { length: false, uppercase: false, number: false, special: false },
    };
  }

  const checks: PasswordChecks = {
    length: value.length >= PASSWORD_MIN_LENGTH,
    uppercase: hasUppercase(value),
    number: hasNumber(value),
    special: hasSpecial(value),
  };

  const valid = checks.length && checks.uppercase && checks.number && checks.special;
  const met =
    Number(checks.length) +
    Number(checks.uppercase) +
    Number(checks.number) +
    Number(checks.special);

  // Invalid passwords score 1–3 by how many rules they meet, so the meter
  // climbs as the user types. A compliant password is at least "Good" (3),
  // and "Strong" (4) once it also clears 12 characters.
  const score = (valid ? (value.length >= 12 ? 4 : 3) : Math.max(1, Math.min(3, met))) as
    | 1
    | 2
    | 3
    | 4;

  const label = (
    {
      1: 'Weak',
      2: 'Fair',
      3: 'Good',
      4: 'Strong',
    } as const
  )[score];

  return { score, label, valid, checks };
}
