import type { StatusTone } from '@/components/ui/status-pill';
import type { OrderPaymentStatus, OrderStatus } from '@dealerlink/schemas';

/** Status-pill tone for an order's fulfilment status. */
export function orderStatusTone(s: OrderStatus): StatusTone {
  switch (s) {
    case 'pending':
      return 'mu';
    case 'confirmed':
      return 'in';
    case 'partially_dispatched':
    case 'fully_dispatched':
      return 'am';
    case 'delivered':
    case 'closed':
      return 'em';
    case 'cancelled':
      return 'ro';
    default:
      return 'mu';
  }
}

/** Status-pill tone for an order's payment status. */
export function paymentStatusTone(s: OrderPaymentStatus): StatusTone {
  switch (s) {
    case 'unpaid':
      return 'ro';
    case 'partially_paid':
      return 'am';
    case 'paid':
      return 'em';
    default:
      return 'mu';
  }
}
