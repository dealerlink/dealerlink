/**
 * HTML-level tests for the payment-receipt template (Day 12, chunk 12c).
 *
 * No Puppeteer, no DB — asserts the rendered HTML string. Receipts are
 * tax-neutral, so the key checks are: the amount + amount-in-words, the
 * allocation breakdown, the advance balance, and the absence of any GST.
 */
import { describe, expect, it } from 'vitest';

import { renderPaymentReceiptHtml } from '../src/templates/payment-receipt';
import type { PaymentReceiptPdfData } from '../src/templates/types';

function makeData(over: Partial<PaymentReceiptPdfData> = {}): PaymentReceiptPdfData {
  return {
    billFrom: {
      name: 'SunDistro',
      legalName: 'SunDistro Energy Pvt Ltd',
      addressLines: ['12 Industrial Estate', 'Pune, Maharashtra, 411001'],
      gstin: '27ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      logoUrl: null,
    },
    receiptNumber: 'PAY-2026-0001',
    receiptDate: '2026-05-15',
    status: 'cleared',
    currency: 'INR',
    receivedFrom: {
      name: 'Bright Solar',
      legalName: 'Bright Solar Solutions LLP',
      addressLines: ['44 MG Road', 'Bengaluru, Karnataka, 560001'],
      gstin: '29PQRST5678U1Z2',
      contact: 'Ravi Kumar',
    },
    amount: 118_000,
    amountInWords: 'Rupees One Lakh Eighteen Thousand Only',
    method: 'Bank Transfer',
    reference: 'UTR-99887766',
    depositedToBank: 'HDFC Bank',
    depositedDate: '2026-05-16',
    allocations: [{ documentLabel: 'Order', documentNumber: 'ORD-2026-0007', amount: 118_000 }],
    unallocatedAmount: 0,
    bank: {
      name: 'HDFC Bank',
      accountNumber: '50200012345678',
      ifsc: 'HDFC0001234',
      branch: 'Pune Camp',
    },
    generatedAt: new Date('2026-05-16T09:00:00Z'),
    ...over,
  };
}

describe('renderPaymentReceiptHtml', () => {
  it('renders a complete HTML document titled PAYMENT RECEIPT', () => {
    const html = renderPaymentReceiptHtml(makeData());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('PAYMENT RECEIPT');
    expect(html).toContain('PAY-2026-0001');
  });

  it('shows the amount, amount-in-words and the paying dealer', () => {
    const html = renderPaymentReceiptHtml(makeData());
    expect(html).toContain('Rupees One Lakh Eighteen Thousand Only');
    expect(html).toContain('Bright Solar');
    expect(html).toContain('UTR-99887766');
  });

  it('renders the allocation breakdown with order numbers', () => {
    const html = renderPaymentReceiptHtml(makeData());
    expect(html).toContain('ORD-2026-0007');
    expect(html).toContain('Total Allocated');
  });

  it('shows an advance-balance note when money is unallocated', () => {
    const html = renderPaymentReceiptHtml(makeData({ allocations: [], unallocatedAmount: 50_000 }));
    expect(html).toContain('Advance balance');
    expect(html).toContain('not been allocated');
  });

  it('is tax-neutral — no GST anywhere on the receipt', () => {
    const html = renderPaymentReceiptHtml(makeData());
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).not.toContain('IGST');
    expect(html).not.toContain('Place of Supply');
  });

  it('omits the bank block when no bank details are configured', () => {
    expect(renderPaymentReceiptHtml(makeData({ bank: null }))).not.toContain('Bank Details');
    expect(renderPaymentReceiptHtml(makeData())).toContain('Bank Details');
  });
});
