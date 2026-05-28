import { describe, expect, it } from 'vitest';

import { createTenantSchema, slugSchema } from './schemas';

/**
 * Tests for the slug refinement added by DEV.73 (Stage D D.2). The slug
 * format rules (length, regex, casing) were already covered implicitly
 * by the operator-onboarding E2E spec; these focus on the new reserved-
 * name guard.
 */

const validTenantPayload = {
  // every value except `slug` is a valid baseline so any failure must be
  // attributable to the slug change.
  slug: 'acme',
  legalName: 'Acme Solar Pvt Ltd',
  displayName: 'Acme Solar',
  // Known checksum-valid fixture used by lib/format/gstin.test.ts. Embedded
  // PAN (chars 3..12) is AABCD1234E, so the `pan` field below mirrors it.
  gstin: '27AABCD1234E1Z8',
  pan: 'AABCD1234E',
  state: 'MH' as const,
  addressLine1: '12, Industrial Estate',
  addressLine2: '',
  addressCity: 'Mumbai',
  addressPincode: '400001',
  addressState: 'MH' as const,
  bankAccountName: 'Acme Solar Pvt Ltd',
  bankAccountNumber: '123456789012',
  bankIfsc: 'HDFC0000001',
  bankBranch: 'Mumbai Main',
  adminEmail: 'admin@acme.example',
  adminFullName: 'Acme Admin',
};

describe('slugSchema — reserved-name refinement (DEV.73)', () => {
  it('accepts ordinary tenant-looking slugs', () => {
    for (const slug of ['acme', 'demo-company', 'solar-1', 'green-energy']) {
      const result = slugSchema.safeParse(slug);
      expect(result.success, `expected '${slug}' to parse`).toBe(true);
    }
  });

  it('rejects every routing-reserved subdomain with a friendly error', () => {
    for (const slug of ['app', 'www', 'admin']) {
      const result = slugSchema.safeParse(slug);
      expect(result.success, `expected '${slug}' to be rejected`).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/reserved/i);
      }
    }
  });

  it('rejects infra-superset reservations (mail, staging, api, cdn, …)', () => {
    for (const slug of ['mail', 'staging', 'api', 'cdn', 'smtp', 'static']) {
      const result = slugSchema.safeParse(slug);
      expect(result.success, `expected '${slug}' to be rejected`).toBe(false);
    }
  });

  it('rejects case variations of reserved names (the schema lowercases first)', () => {
    for (const slug of ['App', 'APP', 'aPp', 'Admin', 'WWW', 'Mail']) {
      const result = slugSchema.safeParse(slug);
      expect(result.success, `expected '${slug}' to be rejected after lowercasing`).toBe(false);
    }
  });

  it('rejects whitespace-padded reserved names (the schema trims first)', () => {
    for (const slug of ['  app  ', '\tadmin\n', ' www ']) {
      const result = slugSchema.safeParse(slug);
      expect(result.success, `expected '${slug}' to be rejected after trim`).toBe(false);
    }
  });

  it('still rejects format-invalid slugs (length, characters) before the refinement', () => {
    // Length below 3 — caught by .min(3), not the reservation refinement.
    expect(slugSchema.safeParse('ab').success).toBe(false);
    // Uppercase + invalid characters — caught by .regex, not the refinement.
    expect(slugSchema.safeParse('AB CD').success).toBe(false);
    // Leading/trailing hyphen — caught by .regex.
    expect(slugSchema.safeParse('-acme').success).toBe(false);
    expect(slugSchema.safeParse('acme-').success).toBe(false);
  });

  it('does NOT reject compound slugs whose prefix or suffix is reserved', () => {
    // `app` is reserved at the subdomain level; `apprentice.dealerlink.in`
    // would not shadow routing, so the tenant slug is fine.
    expect(slugSchema.safeParse('apprentice').success).toBe(true);
    expect(slugSchema.safeParse('admin-console').success).toBe(true);
    expect(slugSchema.safeParse('mailbox').success).toBe(true);
  });
});

describe('createTenantSchema — reservation flows through', () => {
  it('accepts a payload with a non-reserved slug', () => {
    const result = createTenantSchema.safeParse(validTenantPayload);
    expect(result.success).toBe(true);
  });

  it('rejects a payload whose slug is reserved, with the slug-specific error', () => {
    const result = createTenantSchema.safeParse({ ...validTenantPayload, slug: 'app' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'slug');
      expect(issue, 'expected a slug-path issue').toBeDefined();
      expect(issue!.message).toMatch(/reserved/i);
    }
  });

  it('rejects mixed-case + whitespace reserved slugs in the create payload', () => {
    const result = createTenantSchema.safeParse({ ...validTenantPayload, slug: '  Admin ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'slug');
      expect(issue?.message).toMatch(/reserved/i);
    }
  });
});
