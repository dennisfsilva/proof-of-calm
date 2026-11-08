import { describe, expect, it } from 'vitest';
import { localesFor } from './locale';

const profile = (locales: string[], numberFormatLocale: string, dateFormatLocale = numberFormatLocale) => ({
  locales,
  numberFormatLocale,
  dateFormatLocale,
});

describe('localesFor (ADR-0023)', () => {
  it('formats numbers and dates as the country does, whatever the UI language', () => {
    expect(localesFor('en', profile(['pt-PT'], 'pt-PT'))).toEqual({ ui: 'en-GB', numbers: 'pt-PT', dates: 'pt-PT' });
    expect(localesFor('de', profile(['en-US'], 'en-US'))).toEqual({ ui: 'de-DE', numbers: 'en-US', dates: 'en-US' });
  });

  it('takes the country’s own locale in the UI language where it has one (Belgium)', () => {
    const belgium = profile(['nl-BE', 'fr-BE', 'de-BE'], 'nl-BE');
    expect(localesFor('en', belgium).numbers).toBe('nl-BE');
    expect(localesFor('de', belgium).numbers).toBe('de-BE');
    expect(localesFor('en', profile(['en-IE', 'ga-IE'], 'en-IE', 'en-GB'))).toEqual({
      ui: 'en-GB',
      numbers: 'en-IE',
      dates: 'en-IE',
    });
    expect(localesFor('pt-PT', profile(['de-DE'], 'de-DE', 'de-AT')).dates).toBe('de-AT');
  });

  it('falls back to the UI locale before a country is chosen', () => {
    expect(localesFor('pt-PT', null)).toEqual({ ui: 'pt-PT', numbers: 'pt-PT', dates: 'pt-PT' });
  });
});
