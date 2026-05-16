import { Decimal } from '@dealerlink/tax';

import type { OrderPaymentStatus } from '../schema/order';

/**
 * Pure helper: derive an order's `paymentStatus` from its total and the sum
 * of allocations against it (counting only payments in `verified`/`cleared`
 * status — `pending_verification`, `bounced` and `refunded` do not count).
 *
 * Over-allocation clamps to `paid` rather than erroring — the allocation
 * action already rejects over-allocation, so a slight overshoot from rounding
 * or a manual fix should still read as fully paid.
 */
export function deriveOrderPaymentStatus(
  orderTotal: Decimal,
  allocatedAmount: Decimal,
): OrderPaymentStatus {
  if (allocatedAmount.lessThanOrEqualTo(0)) return 'unpaid';
  if (allocatedAmount.greaterThanOrEqualTo(orderTotal)) return 'paid';
  return 'partially_paid';
}
