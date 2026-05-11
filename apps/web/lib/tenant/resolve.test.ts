import { describe, expect, it } from 'vitest';

import { isValidSlug, resolveRequestScope } from './resolve';

describe('resolveRequestScope', () => {
  it('production: <slug>.dealerlink.in → tenant', () => {
    expect(resolveRequestScope('demo.dealerlink.in', null)).toEqual({
      kind: 'tenant',
      slug: 'demo',
    });
    expect(resolveRequestScope('sample.dealerlink.in:443', null)).toEqual({
      kind: 'tenant',
      slug: 'sample',
    });
  });

  it('production: admin/app/www and apex → operator', () => {
    expect(resolveRequestScope('admin.dealerlink.in', null)).toEqual({ kind: 'operator' });
    expect(resolveRequestScope('app.dealerlink.in', null)).toEqual({ kind: 'operator' });
    expect(resolveRequestScope('www.dealerlink.in', null)).toEqual({ kind: 'operator' });
    expect(resolveRequestScope('dealerlink.in', null)).toEqual({ kind: 'operator' });
  });

  it('localhost with ?tenant=<slug> → tenant', () => {
    expect(resolveRequestScope('localhost:3000', 'demo')).toEqual({
      kind: 'tenant',
      slug: 'demo',
    });
    expect(resolveRequestScope('127.0.0.1', 'sample')).toEqual({
      kind: 'tenant',
      slug: 'sample',
    });
  });

  it('localhost with no tenant param → operator', () => {
    expect(resolveRequestScope('localhost:3000', null)).toEqual({ kind: 'operator' });
  });

  it('localhost with ?admin=1 overrides tenant param', () => {
    expect(resolveRequestScope('localhost:3000', 'demo', true)).toEqual({
      kind: 'operator',
    });
  });

  it('invalid slug → operator (fail-closed)', () => {
    expect(resolveRequestScope('localhost', 'NOT-A-VALID-SLUG!')).toEqual({
      kind: 'operator',
    });
    expect(resolveRequestScope('localhost', '')).toEqual({ kind: 'operator' });
  });

  it('unknown host → operator', () => {
    expect(resolveRequestScope('weird.example.com', null)).toEqual({ kind: 'operator' });
  });
});

describe('isValidSlug', () => {
  it('accepts standard slugs', () => {
    expect(isValidSlug('demo')).toBe(true);
    expect(isValidSlug('sample-co')).toBe(true);
    expect(isValidSlug('acme123')).toBe(true);
  });
  it('rejects malformed slugs', () => {
    expect(isValidSlug('-demo')).toBe(false);
    expect(isValidSlug('demo-')).toBe(false);
    expect(isValidSlug('De')).toBe(false); // uppercase
    expect(isValidSlug('a')).toBe(false); // too short
    expect(isValidSlug('demo.tenant')).toBe(false); // dot
  });
});
