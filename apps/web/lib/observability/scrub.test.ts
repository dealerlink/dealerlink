import { describe, expect, it } from 'vitest';

import { scrubEvent, scrubText } from './scrub';

describe('scrubText — PII scrubbing', () => {
  it('1. replaces an email with a stable hashed token', () => {
    const out = scrubText('contact john.doe@acme.com please');
    expect(out).not.toContain('john.doe@acme.com');
    expect(out).toMatch(/contact email_[0-9a-f]{8}@redacted please/);
  });

  it('2. hashes the same email identically and different emails differently', () => {
    const a = scrubText('a@x.com');
    const b = scrubText('a@x.com');
    const c = scrubText('b@x.com');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('3. scrubs a GSTIN', () => {
    expect(scrubText('GSTIN 27AAPFU0939F1ZV on file')).toBe('GSTIN [redacted-gstin] on file');
  });

  it('4. scrubs a standalone PAN', () => {
    expect(scrubText('PAN AAPFU0939F verified')).toBe('PAN [redacted-pan] verified');
  });

  it('5. does not leak the PAN embedded inside a GSTIN', () => {
    const out = scrubText('27AAPFU0939F1ZV');
    expect(out).toBe('[redacted-gstin]');
    expect(out).not.toContain('AAPFU0939F');
  });

  it('6. scrubs a bare 10-digit Indian mobile number', () => {
    expect(scrubText('call 9876543210 today')).toBe('call [redacted-phone] today');
  });

  it('7. scrubs a +91-prefixed phone number', () => {
    expect(scrubText('reach +91 9123456780')).toBe('reach [redacted-phone]');
  });

  it('8. scrubs a 16-digit card-like number with spaces', () => {
    expect(scrubText('paid with 4111 1111 1111 1111')).toBe('paid with [redacted-card]');
  });

  it('9. leaves PII-free text (incl. document numbers) untouched', () => {
    const text = 'Order ORD-2026-0001 created for dealer Acme Solar';
    expect(scrubText(text)).toBe(text);
  });

  it('10. scrubEvent deep-walks message, extra, and user across the event', () => {
    const scrubbed = scrubEvent({
      message: 'failure for sarah@acme.com',
      user: { id: 'u1', email: 'sarah@acme.com' },
      extra: { gstin: '29ABCDE1234F1Z5', note: ['ping 9988776655'] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(JSON.stringify(scrubbed)).not.toContain('sarah@acme.com');
    expect(JSON.stringify(scrubbed)).not.toContain('29ABCDE1234F1Z5');
    expect(JSON.stringify(scrubbed)).not.toContain('9988776655');
    // The user id (not PII) is preserved for triage.
    expect(scrubbed.user?.id).toBe('u1');
  });
});
