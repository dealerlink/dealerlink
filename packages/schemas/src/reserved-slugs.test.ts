import { describe, expect, it } from 'vitest';

import { isReservedSlug, RESERVED_SLUGS } from './reserved-slugs';

describe('RESERVED_SLUGS — canonical set', () => {
  it('includes the three routing-reserved subdomains (admin, app, www)', () => {
    // Mirrors apps/web/lib/tenant/resolve.ts `RESERVED_SUBDOMAINS`. This set
    // must always be a SUPERSET of that — drift would let an operator
    // create a tenant whose slug shadows a routing-reserved subdomain.
    expect(RESERVED_SLUGS.has('admin')).toBe(true);
    expect(RESERVED_SLUGS.has('app')).toBe(true);
    expect(RESERVED_SLUGS.has('www')).toBe(true);
  });

  it('includes the staging environment subdomain', () => {
    // staging.dealerlink.in / *.staging.dealerlink.in is live infrastructure.
    expect(RESERVED_SLUGS.has('staging')).toBe(true);
  });

  it('includes mail (the inbound-email domain per CLAUDE.md §2)', () => {
    expect(RESERVED_SLUGS.has('mail')).toBe(true);
  });

  it('includes the operator-confirmed protocol/CDN names', () => {
    for (const slug of ['api', 'smtp', 'pop', 'imap', 'ftp', 'cdn', 'media', 'static']) {
      expect(RESERVED_SLUGS.has(slug), `expected '${slug}' to be reserved`).toBe(true);
    }
  });

  it('does NOT reserve plausible real tenant slugs', () => {
    for (const slug of ['acme', 'demo', 'sample', 'solar-pro', 'acme1', 'green-energy']) {
      expect(RESERVED_SLUGS.has(slug), `unexpected reservation of '${slug}'`).toBe(false);
    }
  });
});

describe('isReservedSlug', () => {
  it('rejects every member of the canonical set', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it('is case-insensitive — App / APP / aPp all rejected like app', () => {
    expect(isReservedSlug('App')).toBe(true);
    expect(isReservedSlug('APP')).toBe(true);
    expect(isReservedSlug('aPp')).toBe(true);
    expect(isReservedSlug('Admin')).toBe(true);
    expect(isReservedSlug('WWW')).toBe(true);
  });

  it('trims surrounding whitespace before checking', () => {
    expect(isReservedSlug('  app  ')).toBe(true);
    expect(isReservedSlug('\tadmin\n')).toBe(true);
  });

  it('accepts ordinary tenant-looking slugs', () => {
    expect(isReservedSlug('acme')).toBe(false);
    expect(isReservedSlug('demo-company')).toBe(false);
    expect(isReservedSlug('solar-1')).toBe(false);
    expect(isReservedSlug('green-energy-co')).toBe(false);
  });

  it('does NOT match substrings or compound slugs', () => {
    // Subdomain reservation is per exact label — `apprentice` is fine even
    // though `app` is reserved; only the bare `app` would shadow routing.
    expect(isReservedSlug('apprentice')).toBe(false);
    expect(isReservedSlug('admin-console')).toBe(false);
    expect(isReservedSlug('mailbox')).toBe(false);
  });

  it('accepts the empty string — format validation handles that elsewhere', () => {
    // The slugSchema's .min(3) catches empty + too-short inputs before
    // this refinement ever runs, so isReservedSlug only needs to return
    // false here (an empty string isn't a reserved name).
    expect(isReservedSlug('')).toBe(false);
  });
});
