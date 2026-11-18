// A profile field's length limit counts what a reader sees (docs/JURISDICTIONS.md §2).
import { describe, expect, it } from 'vitest';
import { TaxableEventSchema } from './jurisdiction.ts';

const fits = (note: string) => TaxableEventSchema.safeParse({ event: 'spending', taxable: 'yes', note }).success;
const JOINER = '⁠';

describe('a profile field length limit (docs/JURISDICTIONS.md §2)', () => {
  it('passes 240 characters with two word joiners added', () => {
    expect(fits(`${'a'.repeat(119)}${JOINER}${'a'.repeat(121)}${JOINER}`)).toBe(true);
  });

  it('refuses 241 characters without a joiner', () => {
    expect(fits('a'.repeat(240))).toBe(true);
    expect(fits('a'.repeat(241))).toBe(false);
  });

  it('counts a no-break space as one character', () => {
    expect(fits(`${'a'.repeat(239)} `)).toBe(true);
    expect(fits(`${'a'.repeat(240)} `)).toBe(false);
  });

  it('passes a field over the limit only through its word joiners', () => {
    const joined = `${'a'.repeat(238)}${JOINER}${JOINER}${JOINER}`;
    expect(joined.length).toBe(241);
    expect(fits(joined)).toBe(true);
    expect(fits(`${'a'.repeat(241)}${JOINER}`)).toBe(false);
  });
});
