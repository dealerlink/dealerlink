/**
 * Canonical business-event taxonomy (Day 17, chunk 17c).
 *
 * This is a CLOSED contract: `trackEvent` only accepts a name that is a key
 * of `EventPropertyMap`, and the properties must match that key's shape. A
 * caller using an undefined event name — or the wrong property shape — is a
 * compile error. Adding an event is a deliberate, reviewed change here.
 *
 * These events feed Axiom for product analytics. They are NOT a replacement
 * for `audit_log` (who-did-what forensics, a legal requirement) — many actions
 * legitimately write both. Different audiences, different retention.
 *
 * A byte-for-byte mirror lives in `apps/web/lib/observability/event-types.ts`
 * (the workers process cannot import from `apps/web`); keep the two in sync.
 */

/** Every valid event name mapped to its typed properties shape. */
export interface EventPropertyMap {
  // --- Auth ---------------------------------------------------------------
  'user.logged_in': { method: 'password' };
  'user.password_changed': { forced: boolean };
  // --- Provisioning (operator) -------------------------------------------
  'tenant.created': { tenantId: string; slug: string };
  // --- Masters ------------------------------------------------------------
  'dealer.created': { dealerId: string; dealerName: string };
  'product.created': { productId: string; sku: string };
  'inventory.procurement_created': { procurementId: string; itemCount: number };
  // --- Pipeline -----------------------------------------------------------
  'deal.created': { dealId: string };
  'deal.stage_advanced': { dealId: string; fromStage: string; toStage: string };
  // --- Quotation ----------------------------------------------------------
  'quotation.created': { quotationId: string; totalAmount: number; dealerId: string };
  'quotation.sent': { quotationId: string };
  'quotation.accepted': { quotationId: string };
  // --- Proforma invoice ---------------------------------------------------
  'pi.created': { piId: string; totalAmount: number };
  'pi.confirmed': { piId: string };
  // --- Order --------------------------------------------------------------
  'order.confirmed': { orderId: string; totalAmount?: number };
  'order.cancelled': { orderId: string; reason?: string };
  // --- Payment ------------------------------------------------------------
  'payment.recorded': { paymentId: string; amount: number };
  'payment.allocated': { paymentId: string; allocatedAmount: number };
  'payment.bounced': { paymentId: string };
  // --- Dispatch -----------------------------------------------------------
  'dispatch.created': { dispatchId: string; serialCount: number };
  'dispatch.delivered': { dispatchId: string };
  // --- Email --------------------------------------------------------------
  'email.sent': { emailLogId: string; recipientHash?: string };
  'email.bounced': { emailLogId?: string; bounceType?: string };
  // --- PDF ----------------------------------------------------------------
  'pdf.generated': { documentId: string; documentType: string };
}

/** Union of every valid event name. */
export type EventName = keyof EventPropertyMap;
