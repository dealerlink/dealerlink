/**
 * Canonical Indian state vocabulary — ISO 3166-2:IN 2-letter codes.
 *
 * This is the single source of truth for state representation across
 * Dealerlink (DEV.33, closed Stage C Day C.2). Every state value — in the
 * database, in Zod input schemas, in UI dropdowns, and on PDFs — is one of
 * these 36 codes (28 states + 8 union territories). The full names here are
 * for DISPLAY only; storage and comparison always use the code.
 *
 * The tax engine (`@dealerlink/tax`) still treats state as an opaque string
 * (it only needs `tenantState !== placeOfSupply`). Canonicalising to codes
 * just guarantees both sides of that comparison share one format — see
 * CLAUDE.md §5.
 */
import { z } from 'zod';

export const INDIAN_STATES = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CH: 'Chandigarh',
  CT: 'Chhattisgarh', // some sources use CG; ISO 3166-2:IN uses CT
  DH: 'Dadra and Nagar Haveli and Daman and Diu', // merged UT
  DL: 'Delhi',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JK: 'Jammu and Kashmir',
  JH: 'Jharkhand',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MP: 'Madhya Pradesh',
  MH: 'Maharashtra',
  MN: 'Manipur',
  ML: 'Meghalaya',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  PY: 'Puducherry',
  PB: 'Punjab',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UT: 'Uttarakhand',
  WB: 'West Bengal',
} as const;

export type IndianStateCode = keyof typeof INDIAN_STATES;
export type IndianStateName = (typeof INDIAN_STATES)[IndianStateCode];

/** All codes, in declaration order. */
export const INDIAN_STATE_CODES = Object.keys(INDIAN_STATES) as IndianStateCode[];

/** `{ code, name }` pairs sorted by display name — for UI dropdowns. */
export const INDIAN_STATE_OPTIONS: ReadonlyArray<{ code: IndianStateCode; name: IndianStateName }> =
  INDIAN_STATE_CODES.map((code) => ({ code, name: INDIAN_STATES[code] })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

/** Reverse lookup: UPPER(name) → code, built once. */
const NAME_TO_CODE: ReadonlyMap<string, IndianStateCode> = new Map(
  INDIAN_STATE_CODES.map((code) => [INDIAN_STATES[code].toUpperCase(), code] as const),
);

/**
 * Former / alternate full names we still want to resolve when migrating or
 * importing legacy data. Keyed by UPPER(name).
 */
const NAME_ALIASES: Readonly<Record<string, IndianStateCode>> = {
  ORISSA: 'OD', // Odisha's former name
  PONDICHERRY: 'PY', // Puducherry's former name
  UTTARANCHAL: 'UT', // Uttarakhand's former name
  CHHATTISHGARH: 'CT', // common misspelling
  'NCT OF DELHI': 'DL',
  'DELHI (NCT)': 'DL',
};

/**
 * Former / alternate CODES (e.g. older ISO revisions, GSTN variants) mapped
 * to the canonical code. Keyed by the upper-cased alternate code.
 */
const CODE_ALIASES: Readonly<Record<string, IndianStateCode>> = {
  OR: 'OD', // Odisha — old ISO code
  CG: 'CT', // Chhattisgarh — common variant
  UL: 'UT', // Uttarakhand — old ISO code
  UA: 'UT', // Uttarakhand — GSTN variant
  TS: 'TG', // Telangana — common variant
};

/** Type guard: is `code` one of the canonical 2-letter codes? */
export function isValidStateCode(code: string): code is IndianStateCode {
  return Object.prototype.hasOwnProperty.call(INDIAN_STATES, code);
}

/** Canonical display name for a code. */
export function getStateName(code: IndianStateCode): IndianStateName {
  return INDIAN_STATES[code];
}

/** Resolve a full state name (case-insensitive, trimmed, with aliases) to its code. */
export function getStateCodeFromName(name: string): IndianStateCode | null {
  const key = name.trim().toUpperCase();
  return NAME_TO_CODE.get(key) ?? NAME_ALIASES[key] ?? null;
}

/**
 * Accept a code OR a name (or a known alternate of either) and return the
 * canonical code. Returns null for blank / unrecognised input. This is the
 * backwards-compat boundary handler for cached browser sessions, CSV imports,
 * and integration partners — internal storage is always the canonical code.
 */
export function normalizeStateInput(input: string): IndianStateCode | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const upper = trimmed.toUpperCase();
  if (isValidStateCode(upper)) return upper;
  if (CODE_ALIASES[upper]) return CODE_ALIASES[upper];
  return getStateCodeFromName(trimmed);
}

/**
 * Tolerant display formatter: a valid code → its full name; a recognisable
 * name/alias → the canonical name; anything else returned verbatim (so any
 * pre-migration straggler still renders rather than vanishing). Blank → ''.
 */
export function formatStateLabel(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (isValidStateCode(trimmed)) return INDIAN_STATES[trimmed];
  const code = normalizeStateInput(trimmed);
  return code ? INDIAN_STATES[code] : trimmed;
}

/**
 * Strict Zod enum of canonical codes. Use where the input is guaranteed to
 * already be a code (forms backed by the state dropdown, which submits codes).
 */
export const indianStateCodeSchema = z.enum(
  INDIAN_STATE_CODES as [IndianStateCode, ...IndianStateCode[]],
  { errorMap: () => ({ message: 'Pick a state from the list' }) },
);

/**
 * Lenient Zod input: accepts a code OR a full name (or a known alternate) and
 * transforms to the canonical code. Use at boundaries that may receive names —
 * CSV import, the optional place-of-supply override. Rejects unknown values.
 */
export const stateCodeInputSchema = z
  .string()
  .trim()
  .min(2, 'State is required')
  .transform((v, ctx) => {
    const code = normalizeStateInput(v);
    if (!code) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown state: ${v}` });
      return z.NEVER;
    }
    return code;
  });

/** Optional variant: '' / undefined pass through as undefined; otherwise normalised. */
export const optionalStateCodeInputSchema = z
  .union([z.literal(''), stateCodeInputSchema])
  .optional()
  .transform((v) => (v === '' ? undefined : v));
