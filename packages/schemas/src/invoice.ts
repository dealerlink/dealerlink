import { z } from 'zod';

/**
 * Schemas for the tax invoice, credit note and debit note write paths.
 *
 * Shared between the client form and the server action, per CLAUDE.md §3.
 */

/** Issue a tax invoice from a CONFIRMED order. */
export const createInvoiceFromOrderSchema = z.object({
  orderId: z.string().uuid(),
  /** Optional override; defaults to today at the server. */
  invoiceDate: z.string().date().optional(),
  termsAndConditions: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateInvoiceFromOrderInput = z.infer<typeof createInvoiceFromOrderSchema>;

/**
 * Issue a credit or debit note against an issued invoice.
 *
 * **The lines are POSITIVE and the DOCUMENT TYPE supplies the direction** (D-8,
 * `docs/STAGE_F_BUILD_v3.md` §11). There is no sign field and none is accepted: a
 * credit note reduces what the dealer owes, a debit note increases it, and which
 * one it is is the document, not a column.
 *
 * **A fully-reversed line is OMITTED, not sent with quantity 0.** `computeTax`'s
 * bounds were executed, not read: `quantity > 0` throws `NEGATIVE_QUANTITY` at
 * zero, while `unitPrice >= 0` accepts a zero PRICE and returns a valid zero-tax
 * document. So the asymmetry is real — a free line is expressible, a nil-quantity
 * line is not — and the error a zero quantity produces is misleadingly named
 * (F.159).
 */
const noteLineSchema = z.object({
  productId: z.string().uuid(),
  /** Positive. See above — this is the direction-free quantity, not a signed delta. */
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  description: z.string().max(500).optional(),
});

const noteBaseSchema = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().min(3).max(1000),
  lines: z.array(noteLineSchema).min(1),
  notes: z.string().max(2000).optional(),
});

export const createCreditNoteSchema = noteBaseSchema;
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;

export const createDebitNoteSchema = noteBaseSchema;
export type CreateDebitNoteInput = z.infer<typeof createDebitNoteSchema>;

/** Cancel an issued document. The reason is REQUIRED — see below. */
export const cancelInvoiceDocumentSchema = z.object({
  id: z.string().uuid(),
  /**
   * **Cancellation is NOT the correction mechanism, and the reason is mandatory
   * because of that.** A cancelled invoice is one that should never have existed —
   * a mis-keyed number, a duplicate issue. A wrong AMOUNT is corrected by a credit
   * note. The schema cannot stop someone cancelling for the wrong reason, but it
   * can refuse to let them do it without stating one.
   */
  reason: z.string().min(3).max(1000),
});
export type CancelInvoiceDocumentInput = z.infer<typeof cancelInvoiceDocumentSchema>;
