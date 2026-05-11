import { describe, expect, it } from 'vitest';

import { displayNameFrom, initialsFrom } from './initials';

describe('initialsFrom', () => {
  it('uses the first two name initials when a full name is present', () => {
    expect(initialsFrom('John Doe')).toBe('JD');
    expect(initialsFrom('Akshay Mittal', 'a@x.com')).toBe('AM');
  });

  it('returns the single letter of a one-word name', () => {
    expect(initialsFrom('John')).toBe('J');
  });

  it('handles middle names by keeping the first two initials', () => {
    expect(initialsFrom('Mary Jane Watson')).toBe('MJ');
  });

  it('falls back to the email when name is missing', () => {
    expect(initialsFrom(null, 'john.doe@example.com')).toBe('JD');
    // Email with no separator in local-part: takes first letters of local
    // and then domain, since both are useful identity material.
    expect(initialsFrom(undefined, 'admin@demo.test')).toBe('AD');
    expect(initialsFrom('', 'pat@example.com')).toBe('PE');
  });

  it('splits on underscores, dots, dashes, and whitespace', () => {
    expect(initialsFrom(null, 'first_last@example.com')).toBe('FL');
    expect(initialsFrom(null, 'jane-doe@x.com')).toBe('JD');
  });

  it('returns "?" when nothing is available', () => {
    expect(initialsFrom(null, null)).toBe('?');
    expect(initialsFrom(undefined, undefined)).toBe('?');
    expect(initialsFrom('', '')).toBe('?');
    expect(initialsFrom('   ', '   ')).toBe('?');
  });

  it('never throws', () => {
    expect(() => initialsFrom('@@@', '@@@')).not.toThrow();
    expect(initialsFrom('@@@', '@@@')).toBe('?');
  });
});

describe('displayNameFrom', () => {
  it('returns the trimmed full name when present', () => {
    expect(displayNameFrom('  John Doe ')).toBe('John Doe');
  });

  it('falls back to email local-part when name is empty', () => {
    expect(displayNameFrom(null, 'john@example.com')).toBe('john');
    expect(displayNameFrom('', 'admin@demo.test')).toBe('admin');
  });

  it('returns "Unknown" when nothing is provided', () => {
    expect(displayNameFrom(null, null)).toBe('Unknown');
    expect(displayNameFrom(undefined, undefined)).toBe('Unknown');
  });
});
