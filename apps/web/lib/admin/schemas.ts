import { z } from 'zod';

import { isValidGSTIN, isValidIFSC, isValidPAN, isValidPincode } from '@/lib/format';

import { INDIAN_STATES } from './constants';

/**
 * Slug rule: 3..32 chars; starts/ends with alphanumeric; lowercase alpha-
 * numerics and hyphens between. Tighter than the DB CHECK constraint
 * (which allows up to 64) because product policy caps tenant slugs at 32.
 */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Slug must be at least 3 characters')
  .max(32, 'Slug must be 32 characters or fewer')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/,
    'Use lowercase letters, digits, and hyphens — not starting or ending with a hyphen',
  );

export const stateSchema = z.enum(INDIAN_STATES, {
  errorMap: () => ({ message: 'Pick a state from the list' }),
});

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(15, 'GSTIN must be 15 characters')
  .refine(isValidGSTIN, 'GSTIN format or check digit is invalid');

export const panSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(10, 'PAN must be 10 characters')
  .refine(isValidPAN, 'PAN format is invalid');

export const pincodeSchema = z
  .string()
  .trim()
  .length(6, 'Pincode must be 6 digits')
  .refine(isValidPincode, 'Pincode must be 6 digits and not start with 0');

export const ifscSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(11, 'IFSC must be 11 characters')
  .refine(isValidIFSC, 'IFSC format is invalid');

export const docPrefixesSchema = z.object({
  quotation: z.string().trim().min(1).max(8),
  proforma: z.string().trim().min(1).max(8),
  order: z.string().trim().min(1).max(8),
  invoice: z.string().trim().min(1).max(8),
  payment: z.string().trim().min(1).max(8),
  dispatch: z.string().trim().min(1).max(8),
});
export type DocPrefixes = z.infer<typeof docPrefixesSchema>;

/**
 * Inputs for creating a tenant. Mirrored on the form + server action.
 * Branding (logo) is deferred to the settings page per the Day 4 plan,
 * which keeps this form focused on the values needed to ship a working
 * tenant + admin login.
 */
export const createTenantSchema = z.object({
  // Identity
  slug: slugSchema,
  legalName: z.string().trim().min(2, 'Legal name is required').max(255),
  displayName: z.string().trim().min(2, 'Display name is required').max(100),

  // Compliance
  gstin: gstinSchema,
  pan: panSchema,
  state: stateSchema,

  // Registered address
  addressLine1: z.string().trim().min(2, 'Address line 1 is required').max(255),
  addressLine2: z.string().trim().max(255).optional().or(z.literal('')),
  addressCity: z.string().trim().min(2, 'City is required').max(100),
  addressPincode: pincodeSchema,
  addressState: stateSchema,

  // Bank
  bankAccountName: z.string().trim().min(2, 'Account name is required').max(255),
  bankAccountNumber: z
    .string()
    .trim()
    .min(6, 'Account number is too short')
    .max(20, 'Account number is too long')
    .regex(/^\d+$/, 'Account number must be digits only'),
  bankIfsc: ifscSchema,
  bankBranch: z.string().trim().min(2, 'Branch is required').max(200),

  // Initial admin
  adminEmail: z.string().trim().toLowerCase().email('Enter a valid email'),
  adminFullName: z.string().trim().min(2, 'Full name is required').max(100),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const checkSlugSchema = z.object({ slug: slugSchema });

// ---------------------------------------------------------------------------
// Settings-edit schemas (one per section so the inline-edit forms can use
// the smallest viable schema).
// ---------------------------------------------------------------------------

export const updateIdentitySchema = z.object({
  id: z.string().uuid(),
  slug: slugSchema,
  legalName: z.string().trim().min(2).max(255),
  displayName: z.string().trim().min(2).max(100),
});

export const updateComplianceSchema = z.object({
  id: z.string().uuid(),
  gstin: gstinSchema,
  pan: panSchema,
  state: stateSchema,
});

export const updateAddressSchema = z.object({
  id: z.string().uuid(),
  addressLine1: z.string().trim().min(2).max(255),
  addressLine2: z.string().trim().max(255).optional().or(z.literal('')),
  addressCity: z.string().trim().min(2).max(100),
  addressState: stateSchema,
  addressPincode: pincodeSchema,
});

export const updateBankSchema = z.object({
  id: z.string().uuid(),
  bankAccountName: z.string().trim().min(2).max(255),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,20}$/),
  bankIfsc: ifscSchema,
  bankBranch: z.string().trim().min(2).max(200),
});

export const updateDocPrefixesSchema = z.object({
  id: z.string().uuid(),
  docPrefixes: docPrefixesSchema,
});

export const updateDefaultsSchema = z.object({
  id: z.string().uuid(),
  defaultQuoteValidity: z.coerce.number().int().min(1).max(365),
  defaultCreditPeriod: z.coerce.number().int().min(0).max(365),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000),
  defaultTerms: z.string().trim().max(4000).optional().or(z.literal('')),
});

export const updateBrandingSchema = z.object({
  id: z.string().uuid(),
  logoUrl: z.string().trim().max(100_000).optional().or(z.literal('')),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a #RRGGBB color')
    .optional()
    .or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Tenant user management
// ---------------------------------------------------------------------------

const tenantUserRole = z.enum(['admin', 'sales', 'accounts', 'dispatch']);

export const createTenantUserSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(100),
  role: tenantUserRole,
});

export const updateTenantUserSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(100),
  role: tenantUserRole,
  status: z.enum(['active', 'suspended']),
});

export const tenantIdAndUserSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const regenerateInboundTokenSchema = z.object({
  tenantId: z.string().uuid(),
});

export const deleteTenantSchema = z.object({
  tenantId: z.string().uuid(),
  confirmSlug: z.string().trim().toLowerCase(),
});
