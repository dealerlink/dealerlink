import type { StatusTone } from '@/components/ui/status-pill';
import type { PerformaInvoiceStatus } from '@dealerlink/schemas';

/** Status-pill tone for a performa invoice's status. */
export function piStatusTone(s: PerformaInvoiceStatus): StatusTone {
  switch (s) {
    case 'draft':
      return 'mu';
    case 'sent':
      return 'in';
    case 'confirmed':
      return 'em';
    case 'cancelled':
      return 'ro';
    default:
      return 'mu';
  }
}
