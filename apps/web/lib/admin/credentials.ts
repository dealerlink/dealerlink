import { randomBytes, randomInt } from 'node:crypto';

/**
 * Generate a 12-character temporary password with at least one uppercase
 * letter, one lowercase letter, one digit, and one of `!@#$%&*`. The
 * remaining positions are chosen from a broad ASCII alphabet for entropy.
 * Designed for one-time use — the user is forced to rotate on first login
 * via `users.must_change_password`.
 *
 * ~70 bits of entropy across 12 chars from a ~70-char alphabet, with the
 * positional shuffle below preventing predictable layout (e.g., the digit
 * always being first).
 */
export function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // omit I, O (visually ambiguous)
  const lower = 'abcdefghijkmnopqrstuvwxyz'; // omit l
  const digits = '23456789'; // omit 0, 1
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;

  const picks = [
    upper[randomInt(upper.length)]!,
    lower[randomInt(lower.length)]!,
    digits[randomInt(digits.length)]!,
    symbols[randomInt(symbols.length)]!,
  ];

  for (let i = picks.length; i < 12; i++) {
    picks.push(all[randomInt(all.length)]!);
  }

  // Fisher–Yates shuffle with crypto-strong randomness
  for (let i = picks.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = picks[i]!;
    const b = picks[j]!;
    picks[i] = b;
    picks[j] = a;
  }
  return picks.join('');
}

/** 32-hex-character token used in inbound email addresses. */
export function generateInboundToken(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Tenant workspace login URL.
 *
 *   Production: https://<slug>.dealerlink.in/login
 *   Development: http://localhost:3000/login?tenant=<slug>
 *
 * The `NEXT_PUBLIC_APP_URL` env var overrides the dev default when set
 * (useful for staging environments).
 */
export function tenantLoginUrl(slug: string): string {
  if (process.env.NODE_ENV === 'production') {
    return `https://${slug}.dealerlink.in/login`;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/login?tenant=${encodeURIComponent(slug)}`;
}
