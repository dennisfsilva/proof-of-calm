import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyOverlay } from './i18n/overlay.ts';
import { joinProblems } from './join-validate.ts';
import { languagePercentProblems, localeProblems } from './percent-validate.ts';
import { profileTexts } from './profile-texts.ts';
import { type CountryProfile, CountryProfileSchema } from './schema/jurisdiction.ts';

// D3 of #328 (docs/CONTENT-STYLE.md §4): a currency code and its figure, and a form's name and its number, are joined
// by U+00A0, so that a narrow screen never leaves "EUR" or "Modelo" alone at a line's end.
const root = new URL('../', import.meta.url);
const load = (file: string): CountryProfile =>
  CountryProfileSchema.parse(JSON.parse(readFileSync(new URL(file, root), 'utf8')));
const jsonIn = (folder: string) => readdirSync(new URL(folder, root)).filter((name) => name.endsWith('.json'));
const path = 'packages/content/jurisdictions/es.json';
const nbsp = String.fromCodePoint(0xa0);
const joins = (text: string) => joinProblems(path, [['card.caveats.0', text]]).map(({ detail }) => detail);
const refused = (pair: string, figure: string) =>
  `card.caveats.0: ${pair} ${figure} are joined by U+0020, not U+00A0 (docs/CONTENT-STYLE.md §4)`;

describe('a currency code or a form name joined to its figure (docs/CONTENT-STYLE.md §4)', () => {
  it('refuses an ordinary space between a code and its figure, before or after it, and after a form name', () => {
    expect(joins(`Up to EUR 20${nbsp}350 a year.`)).toEqual([
      refused('"EUR" and its figure', `"20${String.fromCodePoint(0x5c)}u00a0350"`),
    ]);
    expect(joins('Each plan buys 100 USD a month.')).toEqual([refused('"USD" and its figure', '"100"')]);
    expect(joins('Declare it on Modelo 721.')).toEqual([refused('the name "Modelo" and its number', '"721"')]);
  });

  it('passes the same three joined by U+00A0', () => {
    expect(joins(`Up to EUR${nbsp}20${nbsp}350 a year.`)).toEqual([]);
    expect(joins(`Each plan buys 100${nbsp}USD a month.`)).toEqual([]);
    expect(joins(`Declare it on Modelo${nbsp}721.`)).toEqual([]);
  });

  it('passes the neighbours: a pair, a hyphenated word, a code with no figure, a citation and an identifier', () => {
    const neighbours = [
      'BTC/USD daily closes',
      'EUR-denominated savings',
      'The USD/EUR rate.',
      'Prices in EUR and USD.',
      'Under art. 33.1 the gain is taxed.',
      'The ruling PIV 28969 says so.',
      'Filed with the Modello Redditi.',
      'A platform 3 days late.',
    ];
    expect(neighbours.flatMap(joins)).toEqual([]);
  });

  it('passes a code joined to a letter by a hyphen or to another code by a slash, on either side of a figure', () => {
    const neighbours = [
      'From 2024 EUR-denominated accounts.',
      'In 2024 USD-pegged coins.',
      'Some non-EUR 100 holdings.',
      'The USD/EUR 1.08 rate.',
      'The 1.08 USD/EUR rate.',
      'A BTC/USD 100 close.',
      'Sold at 100 EUR/USD.',
      'Sold at 100 USD/BTC.',
    ];
    expect(neighbours.flatMap(joins)).toEqual([]);
  });

  it('refuses a code followed by a slash and a unit word, and a code beside its punctuation', () => {
    expect(joins('About 5 EUR/month.')).toEqual([refused('"EUR" and its figure', '"5"')]);
    expect(joins('Pay EUR 5/month.')).toEqual([refused('"EUR" and its figure', '"5"')]);
    expect(joins('(EUR 5), 100 GBP, 7 USD.')).toEqual([
      refused('"EUR" and its figure', '"5"'),
      refused('"GBP" and its figure', '"100"'),
      refused('"USD" and its figure', '"7"'),
    ]);
  });

  it('reads a form number of capitals, points or a hyphen, and every form-name word', () => {
    expect(joins('Anexo G, Quadro 9.4, Form 1099-DA, box 3AN and Modelo D-100.')).toEqual([
      refused('the name "Anexo" and its number', '"G"'),
      refused('the name "Quadro" and its number', '"9.4"'),
      refused('the name "Form" and its number', '"1099-DA"'),
      refused('the name "box" and its number', '"3AN"'),
      refused('the name "Modelo" and its number', '"D-100"'),
    ]);
    const words = ['Box', 'boxes', 'annex', 'Annexe', 'campo', 'fields', 'Modello', 'Schedule'];
    expect(words.map((word) => joins(`${word} 1`).length)).toEqual(words.map(() => 1));
    expect(joins('A section, boxes 13.1 to 13.8, then Annexe 2086 and annex C.')).toEqual([
      refused('the name "boxes" and its number', '"13.1"'),
      refused('the name "Annexe" and its number', '"2086"'),
      refused('the name "annex" and its number', '"C"'),
    ]);
  });

  it('leaves a capital after a form number to the text, since it can be the next word', () => {
    // `Form 2042 C` joins its letter in the data; a check cannot tell it from an article or a pronoun.
    const neighbours = [`File Form${nbsp}1040 A copy stays with you.`, `In box${nbsp}3 I list them.`];
    expect(neighbours.flatMap(joins)).toEqual([]);
  });

  it('gives a code between two figures to the figure after it, as the grouping check does', () => {
    expect(joins('Under art. 33.1 EUR 1000 is exempt.')).toEqual([refused('"EUR" and its figure', '"1000"')]);
  });

  it('names a line break as the space it is, as in a module', () => {
    expect(joins('100\nUSD')).toEqual([
      'card.caveats.0: "USD" and its figure "100" are joined by U+000A, not U+00A0 (docs/CONTENT-STYLE.md §4)',
    ]);
  });

  it('skips the file-only lotRuleNote, as the no-break hyphen does: a file does not wrap', () => {
    expect(joinProblems(path, [['lotRuleNote', 'No sale is matched: box 3 taxes 100 EUR held.']])).toEqual([]);
  });

  it('runs on a profile in English and on a translated profile', () => {
    const profile = load('jurisdictions/es.json');
    const codes = (problems: readonly { code: string }[]) => problems.map(({ code }) => code);
    expect(codes(localeProblems(path, profile, [['card.caveats.0', 'Modelo 721']]))).toEqual(['figure-join']);
    expect(codes(languagePercentProblems(path, 'pt-PT', profile, [['card.caveats.0', '100 USD']]))).toEqual([
      'figure-join',
    ]);
  });
});

describe('the real profiles and their overlays', () => {
  it('join every currency code and form name to its figure with U+00A0', () => {
    const english = jsonIn('jurisdictions/').map((name) => `jurisdictions/${name}`);
    const overlays = readdirSync(new URL('i18n/', root), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap(({ name: language }) => jsonIn(`i18n/${language}/jurisdictions/`).map((name) => ({ language, name })));
    expect(english).toHaveLength(10);
    expect(overlays.length).toBeGreaterThan(0);
    const problems = [
      ...english.flatMap((file) => joinProblems(file, profileTexts(load(file)))),
      ...overlays.flatMap(({ language, name }) => {
        const file = `i18n/${language}/jurisdictions/${name}`;
        const overlay: unknown = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
        const translated = applyOverlay(load(`jurisdictions/${name}`), overlay, 'jurisdiction');
        return joinProblems(file, profileTexts(translated));
      }),
    ];
    expect(problems).toEqual([]);
  });
});
