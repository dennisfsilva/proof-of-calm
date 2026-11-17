import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { numbersIn } from './i18n/overlay-validate.ts';
import { escaped, groupProblems, languagePercentProblems, localeProblems } from './percent-validate.ts';
import { type CountryProfile, CountryProfileSchema } from './schema/jurisdiction.ts';

const load = (code: string): CountryProfile =>
  CountryProfileSchema.parse(
    JSON.parse(readFileSync(new URL(`../jurisdictions/${code}.json`, import.meta.url), 'utf8')),
  );
const [pt, gb, de] = [load('pt'), load('gb'), load('de')];
const [es, fr, italy, nl] = [load('es'), load('fr'), load('it'), load('nl')];
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
  const german = (text: string, profile = de) => groups(localeProblems(path, profile, [['card.rates.1.note', text]]));
  const translated = (profile: CountryProfile, text: string) =>
    groups(languagePercentProblems(path, 'pt-PT', profile, [['card.rates.1.note', text]]));
  const typed = (text: string) => escaped(JSON.stringify(text));
  const suggestion = (figure: string, expected: string, locale = 'de-DE') =>
    `card.rates.1.note: ${typed(figure)} expected ${typed(expected)} (${locale})`;
  // S3 of #318's design check (D10 of #316): a figure without one value under both readers, English's (a point before
  // the decimals) and the page's (a comma), gets §4's rule and no suggestion.
  const RULE = String.raw`so it has no suggestion: write it by hand as CONTENT-STYLE §4 does, groups of three joined by \u00a0 from 10 000, none below, a comma before the decimals, and a fourth decimal on an amount of 1 to 999 that has three (EUR 1,1250)`;
  const WHY = {
    comma: 'has a comma that is a group in English and a decimal on this page',
    point: 'has a point that is a decimal in English and a group on this page',
    none: 'has no reading in English or on this page',
    range: 'is a range',
  } as const;
  type Why = keyof typeof WHY;
  const refusal = (figure: string, why: Why, locale = 'de-DE') =>
    `card.rates.1.note: ${typed(figure)} ${WHY[why]} (${locale}), ${RULE}`;

  it('refuses another grouping of a figure after a currency on a de-DE page', () => {
    // The expected figure prints the escape the writer types in JSON, so it never looks like the refused one.
    expect(german('Where the income tax exceeds EUR 20,350.')).toEqual([
      String.raw`card.rates.1.note: "EUR 20,350" has a comma that is a group in English and a decimal on this page (de-DE), so it has no suggestion: write it by hand as CONTENT-STYLE §4 does, groups of three joined by \u00a0 from 10 000, none below, a comma before the decimals, and a fourth decimal on an amount of 1 to 999 that has three (EUR 1,1250)`,
    ]);
    expect(german('Where the income tax exceeds EUR 20 350.')).toEqual([
      String.raw`card.rates.1.note: "EUR 20 350" expected "EUR 20\u00a0350" (de-DE)`,
    ]);
    expect(german(`Where the income tax exceeds EUR 20${narrow}350.`)).toEqual([
      String.raw`card.rates.1.note: "EUR 20\u202f350" expected "EUR 20\u00a0350" (de-DE)`,
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
      String.raw`card.rates.1.note: "EUR 1.000" has a point that is a decimal in English and a group on this page (de-DE), so it has no suggestion: write it by hand as CONTENT-STYLE §4 does, groups of three joined by \u00a0 from 10 000, none below, a comma before the decimals, and a fourth decimal on an amount of 1 to 999 that has three (EUR 1,1250)`,
      String.raw`card.rates.1.note: "€20 350" expected "€20\u00a0350" (de-DE)`,
    ]);
  });

  it('refuses another grouping of a figure before a currency code, sign or word', () => {
    expect(german('Up to 20 350 EUR a year.')).toEqual([
      String.raw`card.rates.1.note: "20 350 EUR" expected "20\u00a0350 EUR" (de-DE)`,
    ]);
    expect(german('Up to 50.000 € a year.')).toEqual([refusal('50.000 €', 'point')]);
    expect(german('Up to 20,350 euros a year.')).toEqual([refusal('20,350 euros', 'comma')]);
    expect(german('Up to 20350 € a year.')).toEqual([
      String.raw`card.rates.1.note: "20350 €" expected "20\u00a0350 €" (de-DE)`,
    ]);
    expect(german('From 2026 EUR 20,350 a year.')).toEqual([refusal('EUR 20,350', 'comma')]);
    for (const figure of [`20${nbsp}350 EUR`, `50${nbsp}000${nbsp}€`, '1000 Euro', '600 dollars']) {
      expect(german(`Up to ${figure} a year.`)).toEqual([]);
    }
  });

  it('keeps the value of a point-decimal money figure, its cents after a comma', () => {
    expect(german('A fee of EUR 12.50.')).toEqual(['card.rates.1.note: "EUR 12.50" expected "EUR 12,50" (de-DE)']);
    expect(german('Up to €20,350.50 a year.')).toEqual([
      String.raw`card.rates.1.note: "€20,350.50" expected "€20\u00a0350,50" (de-DE)`,
    ]);
  });

  // S2: a figure with one value under both readers, in `Up to … a year.` unless a row gives the text; the excerpt the
  // check suggests; and the value numbersIn reads from that excerpt.
  const suggested: readonly [figure: string, expected: string, value: string, text?: string][] = [
    ['EUR 0.125', 'EUR 0,125', '0.125'],
    ['EUR 0.05', 'EUR 0,05', '0.05'],
    ['EUR 0.0125', 'EUR 0,0125', '0.0125'],
    ['0.125 EUR', '0,125 EUR', '0.125'],
    ['EUR 1.234,56', 'EUR 1234,56', '1234.56'],
    ['EUR 1,234.56', 'EUR 1234,56', '1234.56'],
    ['EUR 20.350,5', `EUR 20${nbsp}350,5`, '20350.5'],
    ['EUR 12.50', 'EUR 12,50', '12.5'],
    ['EUR 1.250,125', 'EUR 1250,125', '1250.125'],
    ['EUR 1,250.125', 'EUR 1250,125', '1250.125'],
    ['EUR 12.345,678', `EUR 12${nbsp}345,678`, '12345.678'],
    ['EUR 20 350,125', `EUR 20${nbsp}350,125`, '20350.125'],
    ['EUR 1.2345', 'EUR 1,2345', '1.2345'],
    ['EUR 1.1250', 'EUR 1,1250', '1.125'],
    ['EUR 1.23456', 'EUR 1,23456', '1.23456'],
    ['EUR 20 350', `EUR 20${nbsp}350`, '20350'],
    [`EUR 20${narrow}350`, `EUR 20${nbsp}350`, '20350'],
    ['EUR 20350', `EUR 20${nbsp}350`, '20350'],
    [`EUR 1${nbsp}000`, 'EUR 1000', '1000'],
    ['EUR 1 000', 'EUR 1000', '1000'],
    ['20 350 EUR', `20${nbsp}350 EUR`, '20350'],
    ['20350 €', `20${nbsp}350 €`, '20350'],
    ['€20,350.50', `€20${nbsp}350,50`, '20350.5'],
    ['EUR 1.234.567', `EUR 1${nbsp}234${nbsp}567`, '1234567'],
    ['EUR 1,234,567', `EUR 1${nbsp}234${nbsp}567`, '1234567'],
    ['EUR 1,000,000', `EUR 1${nbsp}000${nbsp}000`, '1000000'],
    ['EUR 1,234,567.89', `EUR 1${nbsp}234${nbsp}567,89`, '1234567.89'],
    ['EUR 1.234.567,5', `EUR 1${nbsp}234${nbsp}567,5`, '1234567.5'],
    ['EUR 1,234,567.125', `EUR 1${nbsp}234${nbsp}567,125`, '1234567.125'],
    ['EUR 1,234.567', 'EUR 1234,567', '1234.567'],
    ['EUR 1000.125', 'EUR 1000,125', '1000.125'],
    [`EUR 20${nbsp}350.125`, `EUR 20${nbsp}350,125`, '20350.125'],
    ['EUR 12345.5', `EUR 12${nbsp}345,5`, '12345.5'],
    ['EUR 1.000,50', 'EUR 1000,50', '1000.5'],
    ['EUR 1,000.50', 'EUR 1000,50', '1000.5'],
    ['EUR 0.000', 'EUR 0,000', '0'],
    ['EUR 1.5', 'EUR 1,5', '1.5', 'Up to EUR 1.5 million a year.'],
    ['12.50 EUR', '12,50 EUR', '12.5', 'Up to -12.50 EUR a year.'],
    ['EUR 12.50', 'EUR 12,50', '12.5', 'Up to EUR 12.50 to 13.50 a year.'],
  ];

  it('suggests the page’s form of a figure with one value, that value, and passes the text it suggests', () => {
    for (const [figure, expected, value, text = `Up to ${figure} a year.`] of suggested) {
      expect(german(text), text).toEqual([suggestion(figure, expected)]);
      expect(numbersIn(expected, 'de-DE', true), figure).toEqual([value]);
      expect(german(text.replace(figure, expected)), figure).toEqual([]);
    }
    expect([...(suggested[10]?.[1] ?? '')].map((char) => char.codePointAt(0))).toContain(0xa0);
    expect(german('EUR 1.000 and €20 350')[1]).toBe(suggestion('€20 350', `€20${nbsp}350`));
  });

  // D16 of #318: each printed form, applied where it stands and at the edges of a text, is passed and keeps its value.
  it('passes each suggested form put back into its sentence, at a text’s start and end, with its own value', () => {
    for (const [figure, expected, value, text = `Up to ${figure} a year.`] of suggested) {
      const applied = [text.replace(figure, expected), expected, `${expected} a year.`, `Up to ${expected}`];
      for (const sentence of applied) {
        expect(german(sentence), sentence).toEqual([]);
        expect(numbersIn(sentence, 'de-DE', true), sentence).toContain(value);
      }
    }
  });

  it('passes the rule’s own example, EUR 1,1250, as 1.125 on every comma-decimal page it names', () => {
    for (const [profile, locale] of [
      [de, 'de-DE'],
      [es, 'es-ES'],
      [italy, 'it-IT'],
      [nl, 'nl-NL'],
    ] as const) {
      expect(german('Up to EUR 1,1250 a year.', profile), locale).toEqual([]);
      expect(german('EUR 1,1250', profile), locale).toEqual([]);
      // number-group itself, by the page's locale alone, as the overlay of any language meets it.
      expect(groupProblems(path, locale, [['card.rates.1.note', 'Até EUR 1,1250 por ano.']]), locale).toEqual([]);
      expect(numbersIn('Up to EUR 1,1250 a year.', locale, true), locale).toEqual(['1.125']);
    }
  });

  it('passes the decimal-separator fix applied, 12,2% on a de-DE page, under both checks', () => {
    expect(english(de, 'The first bracket is 12.2%.')).toEqual([
      'card.caveats.0: "12.2%" writes ".", expected "," (de-DE)',
    ]);
    // Germany's page joins the sign with a no-break space, the percent joiner's own finding (CONTENT-STYLE §4).
    const fixed = `The first bracket is 12,2${nbsp}% up to EUR 1000.`;
    expect(localeProblems(path, de, [['card.caveats.0', fixed]])).toEqual([]);
    expect(german(fixed)).toEqual([]);
  });

  it('suggests the page’s form on Portugal’s and France’s English texts and in a pt-PT text for the Netherlands', () => {
    expect(german('Up to EUR 1.5 a year.', pt)).toEqual([suggestion('EUR 1.5', 'EUR 1,5', 'pt-PT')]);
    expect(german('Up to EUR 12.50 a year.', pt)).toEqual([suggestion('EUR 12.50', 'EUR 12,50', 'pt-PT')]);
    const million = `EUR 1${narrow}000${narrow}000,5`;
    expect(german(`Up to ${million} a year.`, fr)).toEqual([
      suggestion(million, `EUR 1${nbsp}000${nbsp}000,5`, 'fr-FR'),
    ]);
    expect(translated(nl, 'Até EUR 0.125 por ano.')).toEqual([suggestion('EUR 0.125', 'EUR 0,125', 'nl-NL')]);
    expect(translated(nl, 'Até EUR 20 350 por ano.')).toEqual([suggestion('EUR 20 350', `EUR 20${nbsp}350`, 'nl-NL')]);
  });

  // S3: a figure the two readers read as different values, one neither reads, and a range; the excerpt refused.
  const refused: readonly [figure: string, why: Why, text?: string][] = [
    ...(['EUR 20,350', 'EUR 12,348', 'EUR 277,826', 'EUR 1,000', 'EUR 1,125', 'EUR 2,000'] as const).map(
      (figure): [string, Why] => [figure, 'comma'],
    ),
    ['20,350 euros', 'comma'],
    ['EUR12,348', 'comma'],
    ['EUR 12,348', 'comma', 'Up to EUR 12,348/year.'],
    ['EUR 1,000', 'comma', 'Up to −EUR 1,000 a year.'],
    ['EUR 1,000', 'comma', 'Up to EUR 1,000 to 2,000 a year.'],
    ['EUR 1,000', 'comma', 'EUR 256 and EUR 1,000'],
    ...(['EUR 1.125', 'EUR 20.350', 'EUR 1.000', '50.000 €', '1.000 €', 'EUR 12.345', '€1.125'] as const).map(
      (figure): [string, Why] => [figure, 'point'],
    ),
    ...[`EUR 1.000,125${nbsp}000`, `EUR 0,125${nbsp}000`, `0,125${nbsp}000 EUR`, 'EUR 1,23.456', 'EUR 1.23,456'].map(
      (figure): [string, Why] => [figure, 'none'],
    ),
    ...['EUR 0125', 'EUR 01,000', 'EUR 00.50', 'EUR 012,348', 'EUR 012.125', 'EUR 12,34,567.50'].map(
      (figure): [string, Why] => [figure, 'none'],
    ),
    ...[`EUR 1,000${nbsp}000`, 'EUR 1,000,50', 'EUR 1.5,000,000'].map((figure): [string, Why] => [figure, 'none']),
    ...['0.125–1.125 EUR', '0,125–1,125 EUR', 'EUR 12.50–13.50', 'EUR 10-12.50', 'EUR 1,000–2,000'].map(
      (figure): [string, Why] => [figure, 'range'],
    ),
    ...['EUR 1.125–1.5', 'EUR 1.000–2.000', 'EUR 0.5–1.000', 'EUR 0,5–1,000', 'EUR 1,000.5–2,5'].map(
      (figure): [string, Why] => [figure, 'range'],
    ),
  ];

  it('refuses a figure read two ways, read no way or in a range with §4’s rule and no suggestion', () => {
    for (const [figure, why, text = `Up to ${figure} a year.`] of refused) {
      expect(german(text), text).toEqual([refusal(figure, why)]);
    }
    expect(german('Where the income tax exceeds EUR 20,350 (single) or EUR 40,700 (joint).')).toEqual([
      refusal('EUR 20,350', 'comma'),
      refusal('EUR 40,700', 'comma'),
    ]);
    const spain = '19 % up to EUR 6,000; 21 % up to EUR 50,000; 27 % up to EUR 300,000.';
    expect(german(spain, es)).toEqual(
      ['EUR 6,000', 'EUR 50,000', 'EUR 300,000'].map((figure) => refusal(figure, 'comma', 'es-ES')),
    );
    expect(german('Up to EUR 2,000 a year.', italy)).toEqual([refusal('EUR 2,000', 'comma', 'it-IT')]);
    expect(german('A deemed 6,00% of assets above EUR 59,357 per person.', nl)).toEqual([
      refusal('EUR 59,357', 'comma', 'nl-NL'),
    ]);
    expect(german('EUR 1,500 and EUR 12,348', fr)).toEqual([
      refusal('EUR 1,500', 'comma', 'fr-FR'),
      refusal('EUR 12,348', 'comma', 'fr-FR'),
    ]);
  });

  // Each figure the page writes as it should: its grouping, a decimal comma, an identifier, a citation.
  const passed = [
    ...[
      `EUR 20${nbsp}350`,
      `EUR 277${nbsp}826`,
      'EUR 1000',
      'EUR 600',
      'EUR 12,50',
      '12,50 €',
      'PIV 28969',
      'Modelo 721',
    ],
    ...['art. 33.1', '§3.2.1', 'EUR 0,125', 'EUR 0,05', 'EUR 0,0125', '0,125 EUR', `20${nbsp}350 EUR`],
    ...[`EUR 20${nbsp}350,125`, 'EUR 1000,125', '1000,125 EUR', 'EUR 1,2345', `EUR 12${nbsp}345,678`],
    ...[`50${nbsp}000${nbsp}€`, '1000 Euro', '600 dollars', 'EUR 1000 to EUR 2000', 'EUR 1000–2000'],
  ];

  it('raises no problem at all on any figure the page writes as it should', () => {
    for (const figure of passed) {
      expect(localeProblems(path, de, [['card.rates.1.note', `Up to ${figure} a year.`]]), figure).toEqual([]);
    }
    expect(german('Up to EUR 6000 a year.', es)).toEqual([]);
    expect(german(`Up to EUR 50${nbsp}000 a year.`, es)).toEqual([]);
  });

  it('reads a code after a figure only when no figure follows the code, and a range whole', () => {
    expect(german('Under art. 33.1 EUR 1000 is exempt.')).toEqual([]);
    expect(german('Circolare 30/E §3.2.1 EUR 2000 a year.', italy)).toEqual([]);
    expect(german('In 2025–2026 EUR 1000 a year.')).toEqual([]);
  });

  it('passes a point-decimal page’s commas', () => {
    const british = (text: string) => groups(localeProblems(path, gb, [['card.allowances.0', text]]));
    expect(british('A £37,700 band and GBP 3,000.')).toEqual([]);
    expect(british('GBP 1.125 and EUR 0,125')).toEqual([]);
    expect(british('EUR 12,50 and £37 700')).toEqual([]);
    expect(british('GBP 1.234.567,5, EUR 1,270 and USD 49,450')).toEqual([]);
  });

  it('holds a translation to the grouping of its own page', () => {
    expect(translated(de, 'Acima de EUR 20.350.')).toEqual([refusal('EUR 20.350', 'point')]);
    expect(translated(de, `Acima de EUR 20${nbsp}350.`)).toEqual([]);
    expect(translated(gb, 'Acima de £37,700.')).toEqual([]);
    expect(translated(pt, 'Acima de EUR 1.000.')).toEqual([refusal('EUR 1.000', 'point', 'pt-PT')]);
    expect(translated(de, 'Acima de EUR 1,125.')).toEqual([refusal('EUR 1,125', 'comma')]);
    expect(translated(de, 'Até 20,350 euros.')).toEqual([refusal('20,350 euros', 'comma')]);
    expect(translated(de, 'De EUR 0,125–1,125.')).toEqual([refusal('EUR 0,125–1,125', 'range')]);
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
