import { describe, expect, it } from 'vitest';

import {
  generateAgentToken,
  generateInboundToken,
  generateTemporaryPassword,
  tenantLoginUrl,
} from './credentials';

describe('generateTemporaryPassword', () => {
  it('returns a 12-character string', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(12);
  });

  it('contains at least one of each required class', () => {
    // Run 50 trials; on every trial the password must have at least one
    // uppercase, lowercase, digit, and symbol.
    for (let i = 0; i < 50; i++) {
      const pw = generateTemporaryPassword();
      expect(/[A-Z]/.test(pw)).toBe(true);
      expect(/[a-z]/.test(pw)).toBe(true);
      expect(/[0-9]/.test(pw)).toBe(true);
      expect(/[!@#$%&*]/.test(pw)).toBe(true);
    }
  });

  it('does not produce the same password twice in a row', () => {
    // Crude entropy sanity-check: 20 generations, all distinct.
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      seen.add(generateTemporaryPassword());
    }
    expect(seen.size).toBe(20);
  });
});

describe('generateInboundToken', () => {
  it('returns 32 hex characters', () => {
    const tok = generateInboundToken();
    expect(tok).toMatch(/^[0-9a-f]{32}$/);
  });
  it('is unique across calls', () => {
    const a = generateInboundToken();
    const b = generateInboundToken();
    expect(a).not.toBe(b);
  });
});

describe('tenantLoginUrl', () => {
  it('returns localhost URL with tenant query in dev', () => {
    const url = tenantLoginUrl('acme');
    // In test environment NODE_ENV is "test", so dev branch fires.
    expect(url).toContain('/login?tenant=acme');
  });
});

describe('generateAgentToken (F.148)', () => {
  it('is 43 base64url characters — 32 bytes, no padding', () => {
    const t = generateAgentToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // NO `+`, `/` or `=`: this value is pasted into a config file on someone
    // else's VPS and read back by a shell and a config parser. base64url is
    // chosen so neither can mangle it.
    expect(t).not.toMatch(/[+/=]/);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateAgentToken()));
    expect(seen.size).toBe(200);
  });

  it('is longer than the inbound email token, and the asymmetry is deliberate', () => {
    // The inbound token is a routing label that appears in an address a human
    // types, so it trades entropy for typeability. This one is never typed and
    // never shown twice, so there is nothing to trade.
    expect(generateAgentToken().length).toBeGreaterThan(generateInboundToken().length);
  });
});
