import { DispatchError, type DispatchErrorCode } from '@dealerlink/db';

import { AppError, type AppErrorCode } from '@/lib/errors';

/**
 * Map a db-layer `DispatchError` to the right `AppError` code. Without this
 * the wrap helper would flatten every dispatch failure to a generic
 * `INTERNAL` — the operator needs to know *why* a dispatch was rejected
 * (a stale serial, a wrong-order pick, an over-dispatch).
 */
const CODE_MAP: Record<DispatchErrorCode, AppErrorCode> = {
  ORDER_NOT_FOUND: 'NOT_FOUND',
  ORDER_LINE_NOT_FOUND: 'NOT_FOUND',
  SERIAL_NOT_FOUND: 'NOT_FOUND',
  ORDER_NOT_DISPATCHABLE: 'VALIDATION',
  DUPLICATE_LINE: 'VALIDATION',
  SERIAL_NOT_RESERVED: 'VALIDATION',
  SERIAL_DUPLICATED: 'VALIDATION',
  EXCEEDS_REMAINING: 'VALIDATION',
  SERIAL_ALREADY_DISPATCHED: 'CONFLICT',
  SERIAL_WRONG_ORDER: 'CONFLICT',
  SERIAL_WRONG_PRODUCT: 'CONFLICT',
  CROSS_TENANT: 'FORBIDDEN',
};

/** Re-throw a `DispatchError` as an `AppError`; pass anything else through. */
export function rethrowDispatchError(err: unknown): never {
  if (err instanceof DispatchError) {
    throw new AppError(CODE_MAP[err.code], err.message, { meta: { dispatchCode: err.code } });
  }
  throw err;
}
