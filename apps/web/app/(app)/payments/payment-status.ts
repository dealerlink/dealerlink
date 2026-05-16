import type { StatusTone } from '@/components/ui/status-pill';
import type { PaymentMethod, PaymentStatus } from '@dealerlink/schemas';

/** Status-pill tone for a payment's lifecycle status. */
export function paymentStatusTone(s: PaymentStatus): StatusTone {
  switch (s) {
    case 'pending_verification':
      return 'mu';
    case 'verified':
      return 'in';
    case 'cleared':
      return 'em';
    case 'bounced':
      return 'ro';
    case 'refunded':
      return 'am';
    default:
      return 'mu';
  }
}

/** Human-readable payment status label. */
export function paymentStatusLabel(s: PaymentStatus): string {
  return s.replace(/_/g, ' ');
}

/** Human-readable payment method label. */
export function paymentMethodLabel(m: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    other: 'Other',
  };
  return labels[m] ?? m;
}
