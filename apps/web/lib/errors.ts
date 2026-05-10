export type AppErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  override readonly cause?: unknown;
  readonly meta?: Record<string, unknown>;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { cause?: unknown; meta?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    if (options?.cause !== undefined) this.cause = options.cause;
    if (options?.meta !== undefined) this.meta = options.meta;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function userMessage(code: AppErrorCode): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'You need to sign in to continue.';
    case 'FORBIDDEN':
      return 'You do not have permission to do that.';
    case 'NOT_FOUND':
      return 'We could not find what you were looking for.';
    case 'VALIDATION':
      return 'Some of the information looks wrong. Please review and try again.';
    case 'CONFLICT':
      return 'That action conflicts with the current state. Refresh and try again.';
    case 'RATE_LIMITED':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'INTERNAL':
    default:
      return 'Something went wrong on our side. Please try again.';
  }
}
