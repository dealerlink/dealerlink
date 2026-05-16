/**
 * Day 12 — pure unit tests for the order-paymentStatus propagation helper.
 * No DB: `deriveOrderPaymentStatus` is a pure function over two Decimals.
 */
import { Decimal } from '@dealerlink/tax';
import { describe, expect, it } from 'vitest';

import { deriveOrderPaymentStatus } from '../src/payments/propagation';

const d = (n: string | number) => new Decimal(n);

describe('deriveOrderPaymentStatus()', () => {
  it('zero allocation → unpaid', () => {
    expect(deriveOrderPaymentStatus(d('1180.00'), d('0'))).toBe('unpaid');
  });

  it('partial allocation → partially_paid', () => {
    expect(deriveOrderPaymentStatus(d('1180.00'), d('500.00'))).toBe('partially_paid');
  });

  it('exact-match allocation → paid', () => {
    expect(deriveOrderPaymentStatus(d('1180.00'), d('1180.00'))).toBe('paid');
  });

  it('over-allocation clamps to paid (not an error)', () => {
    expect(deriveOrderPaymentStatus(d('1180.00'), d('5000.00'))).toBe('paid');
  });

  it('a tiny allocation against a large order is partially_paid', () => {
    expect(deriveOrderPaymentStatus(d('999999.99'), d('0.01'))).toBe('partially_paid');
  });

  it('one paise short of total is still partially_paid', () => {
    expect(deriveOrderPaymentStatus(d('1180.00'), d('1179.99'))).toBe('partially_paid');
  });

  it('negative allocation (defensive) reads as unpaid', () => {
    expect(deriveOrderPaymentStatus(d('1180.00'), d('-10.00'))).toBe('unpaid');
  });

  it('zero-total order with any allocation reads as paid', () => {
    expect(deriveOrderPaymentStatus(d('0.00'), d('100.00'))).toBe('paid');
  });
});
