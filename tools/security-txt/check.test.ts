import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSecurityTxt } from './check.ts';

const now = new Date('2026-10-17T12:00:00Z');
const file = (expires: string, extra = '') =>
  `Contact: mailto:security@proofofcalm.com\nExpires: ${expires}\nPreferred-Languages: en, pt, de\n${extra}`;

describe('checkSecurityTxt (RFC 9116)', () => {
  it('accepts the repository’s file today', () => {
    const text = readFileSync(new URL('../../apps/web/public/.well-known/security.txt', import.meta.url), 'utf8');
    expect(checkSecurityTxt(text, now)).toEqual([]);
  });

  it('fails 30 days before Expires, and once it has passed', () => {
    expect(checkSecurityTxt(file('2026-11-17T12:00:00Z'), now)).toEqual([]);
    expect(checkSecurityTxt(file('2026-11-16T11:00:00Z'), now)).toEqual([
      'Expires 2026-11-16T11:00:00Z is 29 days away; set a new date less than a year ahead.',
    ]);
    expect(checkSecurityTxt(file('2026-10-01T00:00:00Z'), now)[0]).toMatch(/is -17 days away/);
  });

  it('refuses a date more than a year ahead, or one that is not RFC 3339', () => {
    expect(checkSecurityTxt(file('2027-12-01T00:00:00Z'), now)).toEqual([
      'Expires 2027-12-01T00:00:00Z is more than a year away (RFC 9116 §2.5.5).',
    ]);
    expect(checkSecurityTxt(file('1 October 2027'), now)).toEqual([
      'Expires "1 October 2027" is not an RFC 3339 date and time.',
    ]);
  });

  it('wants one Expires and a Contact URI, and a Canonical that is this file', () => {
    expect(checkSecurityTxt('Contact: mailto:security@proofofcalm.com\n', now)).toEqual([
      'Expires appears 0 times; it must appear once.',
    ]);
    expect(
      checkSecurityTxt(
        'Expires: 2027-10-01T00:00:00Z\nContact: security@proofofcalm.com\nCanonical: https://proofofcalm.com/security.txt\n',
        now,
      ),
    ).toEqual([
      'Contact "security@proofofcalm.com" is not a mailto:, https: or tel: URI.',
      'Canonical "https://proofofcalm.com/security.txt" is not this file\'s https URL.',
    ]);
    expect(checkSecurityTxt('# a comment\n\nExpires: 2027-10-01T00:00:00Z\nOops\n', now)).toEqual([
      'Contact is missing.',
    ]);
  });
});
