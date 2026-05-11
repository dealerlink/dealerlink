/**
 * Indian states + UTs as a fixed list for the operator console.
 * Used for: tenant compliance state (drives CGST/SGST vs IGST), registered
 * address state, future dealer master.
 *
 * Source: GSTN state codes — order matches the state-code sequence so the
 * code can be derived from the GSTIN by humans reading the dropdown.
 */
export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  // Union territories
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

export const DEFAULT_DOC_PREFIXES = {
  quotation: 'QT',
  proforma: 'PI',
  order: 'ORD',
  invoice: 'INV',
  payment: 'PAY',
  dispatch: 'DSP',
} as const;
