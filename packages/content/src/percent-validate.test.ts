import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { languagePercentProblems, localeProblems } from './percent-validate.ts';
import { type CountryProfile, CountryProfileSchema } from './schema/jurisdiction.ts';

const load = (code: string): CountryProfile =>
  CountryProfileSchema.parse(
    JSON.parse(readFileSync(new URL(`../jurisdictions/${code}.json`, import.meta.url), 'utf8')),
  );
const [pt, gb, de] = [load('pt'), load('gb'), load('de')];
const path = 'packages/content/jurisdictions/pt.json';
const decimals = (problems: readonly { code: string; detail: string }[]) =>
  problems.filter(({ code }) => code === 'decimal-separator').map(({ detail }) => detail);
const english = (profile: CountryProfile, text: string) =>
  decimals(localeProblems(path, profile, [['card.caveats.0', text]]));

// The grouped figures (decided 2026-11-16, docs/CONTENT-STYLE.md §4): where the page writes a comma decimal, a figure of
// 10 000 or more groups its digits in threes with a no-break space and a smaller one takes none, in every language.
describe('a profile’s money figures group as its comma-decimal page does (docs/CONTENT-STYLE.md §4)', () => {
  const [nbsp, narrow] = [String.fromCodePoint(0xa0), String.fromCodePoint(0x202f)];
  const groups = (problems: readonly { code: string; detail: string }[]) =>
    problems.filter(({ code }) => code === 'number-group').map(({ detail }) => detail);
  const german = (text: string) => groups(localeProblems(path, de, [['card.rates.1.note', text]]));

  it('refuses another grouping of a figure after a currency on a de-DE page', () => {
    expect(german('Where the income tax exceeds EUR 20,350.')).toEqual([
      `card.rates.1.note: "EUR 20,350" expected "EUR 20${nbsp}350" (de-DE)`,
    ]);
    const flagged = [
      'EUR 20.350',
      'EUR 1,000',
      'EUR 1.000',
      'EUR 20350',
      `EUR 1${nbsp}000`,
      'EUR 20 350',
      `EUR 20${narrow}350`,
    ];
    for (const figure of flagged) expect(german(`Up to ${figure} a year.`)).toHaveLength(1);
    expect(german('EUR 1.000 and €20 350')).toEqual([
      'card.rates.1.note: "EUR 1.000" expected "EUR 1000" (de-DE)',
      `card.rates.1.note: "€20 350" expected "€20${nbsp}350" (de-DE)`,
    ]);
  });

  it('passes the page’s grouping, a decimal comma, an identifier and a citation, and a point-decimal page’s commas', () => {
    const passed = [
      `EUR 20${nbsp}350`,
      `EUR 277${nbsp}826`,
      'EUR 1000',
      'EUR 600',
      'EUR 12,50',
      'PIV 28969',
      'Modelo 721',
      'art. 33.1',
      '§3.2.1',
    ];
    for (const figure of passed) expect(german(`Up to ${figure} a year.`)).toEqual([]);
    expect(groups(localeProblems(path, gb, [['card.allowances.0', 'A £37,700 band and GBP 3,000.']]))).toEqual([]);
  });

  it('holds a translation to the grouping of its own page', () => {
    const translated = (profile: CountryProfile, text: string) =>
      groups(languagePercentProblems(path, 'pt-PT', profile, [['card.allowances.0', text]]));
    expect(translated(de, 'Acima de EUR 20.350.')).toEqual([
      `card.allowances.0: "EUR 20.350" expected "EUR 20${nbsp}350" (de-DE)`,
    ]);
    expect(translated(de, `Acima de EUR 20${nbsp}350.`)).toEqual([]);
    expect(translated(gb, 'Acima de £37,700.')).toEqual([]);
  });
});

// D8 (2026-11-16): a literal decimal in a profile's prose takes the separator of the number locale the page uses for
// that profile, numberLocaleFor(language, profile), so English text for Portugal writes 12,2% (ADR-0023).
describe('a profile’s literal decimals follow its page’s number locale (docs/CONTENT-STYLE.md §4)', () => {
  it('refuses a point in Portugal’s English text and passes the comma', () => {
    expect(english(pt, 'The first bracket is 12.2%.')).toEqual([
      'card.caveats.0: "12.2%" writes ".", expected "," (pt-PT)',
    ]);
    expect(localeProblems(path, pt, [['card.caveats.0', 'The first bracket is 12,2%.']])).toEqual([]);
    // The joiner is the percent-joiner check's: an ordinary space is its finding, not this one's.
    expect(english(pt, 'The first bracket is 12,2 %.')).toEqual([]);
  });

  it('passes a point in Britain’s English text and refuses the comma there', () => {
    expect(english(gb, 'A rate of 12.2 % applies.')).toEqual([]);
    expect(english(gb, 'A rate of 12.2% applies.')).toEqual([]);
    expect(english(gb, 'A rate of 12,2% applies.')).toEqual([
      'card.caveats.0: "12,2%" writes ",", expected "." (en-GB)',
    ]);
  });

  it('reads every separator of the figure, at the start and end of a text, beside a whole percentage', () => {
    expect(english(pt, '6.00% in 2026, 5.88% in 2025 and 36% on the yield')).toEqual([
      'card.caveats.0: "6.00%" writes ".", expected "," (pt-PT)',
      'card.caveats.0: "5.88%" writes ".", expected "," (pt-PT)',
    ]);
    expect(english(de, `Taxed at 26.375 %`)).toEqual(['card.caveats.0: "26.375 %" writes ".", expected "," (de-DE)']);
    expect(english(pt, 'Art. 33.1 and Quadro 9.4 hold no percentage; 28% is whole.')).toEqual([]);
  });

  it('reads every figure of a percentage range as a percentage, the left one without its sign too', () => {
    expect(english(pt, '12.2–48% by bracket')).toEqual(['card.caveats.0: "12.2–48%" writes ".", expected "," (pt-PT)']);
    expect(english(pt, '12–48.5% by bracket')).toEqual(['card.caveats.0: "12–48.5%" writes ".", expected "," (pt-PT)']);
    expect(english(pt, '12.2-48.5%')).toEqual(['card.caveats.0: "12.2-48.5%" writes ".", expected "," (pt-PT)']);
    expect(english(pt, '12,2–48% by bracket, 2,5% to 13,3%')).toEqual([]);
    expect(english(gb, '12.2–48% by bracket')).toEqual([]);
    expect(english(gb, '12,2–48%')).toEqual(['card.caveats.0: "12,2–48%" writes ",", expected "." (en-GB)']);
  });

  it('keeps the point of a law citation beside a percentage, a spaced dash between them', () => {
    expect(english(pt, 'Art. 33.1 – 28% flat; Quadro 9.4 lists 12,2–48%.')).toEqual([]);
    expect(english(pt, 'Under art. 72.1, 28%.')).toEqual([]);
  });

  // #290, round 2: only an unspaced dash or hyphen joins a range, of two figures; a `to` range writes its sign on each
  // figure, which the single-percentage reading covers.
  it('reads `to` and a spaced dash as prose, and a range as two figures at most', () => {
    expect(english(pt, 'Art. 33.1 to 28% applies.')).toEqual([]);
    expect(english(gb, 'GBP 3,000 to 20% applies.')).toEqual([]);
    expect(english(pt, 'Quadro 9.4-12-28%')).toEqual([]);
    expect(english(pt, '2,5% to 13,3%')).toEqual([]);
    expect(english(pt, 'Art. 33.1 – 28%')).toEqual([]);
    // A citation joined to a percentage by an unspaced hyphen reads as a range, so the copy writes them apart.
    expect(english(pt, 'Art. 33.1-28%')).toEqual(['card.caveats.0: "33.1-28%" writes ".", expected "," (pt-PT)']);
    // A gap the copy review owns (docs/BUILD-PROMPT.md): the left figure of a `to` range without its sign is prose.
    expect(english(pt, 'from 2.5 to 13,3%')).toEqual([]);
  });

  it('refuses a point in a pt-PT overlay’s text for Portugal, and holds a German overlay to de-DE', () => {
    const translated = (language: string, profile: CountryProfile, text: string) =>
      decimals(languagePercentProblems(path, language, profile, [['card.summary60', text]]));
    expect(translated('pt-PT', pt, 'O primeiro escalão é 12.2%.')).toEqual([
      'card.summary60: "12.2%" writes ".", expected "," (pt-PT)',
    ]);
    expect(translated('pt-PT', pt, 'O primeiro escalão é 12,2%.')).toEqual([]);
    expect(translated('pt-PT', gb, 'Uma taxa de 12,2% aplica-se.')).toEqual([
      'card.summary60: "12,2%" writes ",", expected "." (en-GB)',
    ]);
    expect(translated('pt-PT', pt, 'De 12.2–48% por escalão.')).toEqual([
      'card.summary60: "12.2–48%" writes ".", expected "," (pt-PT)',
    ]);
    expect(translated('pt-PT', pt, 'De 12,2–48% por escalão.')).toEqual([]);
    expect(translated('de', de, `Ein Satz von 26,375 %.`)).toEqual([]);
  });
});
