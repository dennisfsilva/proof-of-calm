import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import allowList from '../sources.allow.json' with { type: 'json' };
import { applyOverlay } from './i18n/overlay.ts';
import { joinProblems, titleJoinProblems } from './join-validate.ts';
import { languagePercentProblems, localeProblems } from './percent-validate.ts';
import { profileTexts } from './profile-texts.ts';
import { type CountryProfile, CountryProfileSchema } from './schema/jurisdiction.ts';
import { validateContent } from './validate.ts';

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
const refusedBy = (gap: string) =>
  `card.caveats.0: "EUR" and its figure "20" are joined by ${gap}, not U+00A0 (docs/CONTENT-STYLE.md §4)`;

describe('a currency code or a form name joined to its figure (docs/CONTENT-STYLE.md §4)', () => {
  it('refuses an ordinary space between a code and its figure, before or after it, and after a form name', () => {
    expect(joins(`Up to EUR 20${nbsp}350 a year.`)).toEqual([refused('"EUR" and its figure', '"20U+00A0 350"')]);
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
      `Under art.${nbsp}33.1 the gain is taxed.`,
      'The docket IX R 3/22 says so.',
      'Filed with the Modello Redditi.',
      `A platform 3${nbsp}days late.`,
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
    expect(joins(`Under art.${nbsp}33.1 EUR 1000 is exempt.`)).toEqual([refused('"EUR" and its figure', '"1000"')]);
  });

  it('names a line break as the space it is, as in a module', () => {
    expect(joins('100\nUSD')).toEqual([
      'card.caveats.0: "USD" and its figure "100" are joined by U+000A, not U+00A0 (docs/CONTENT-STYLE.md §4)',
    ]);
  });

  // Carry-over 6 of #377: a line still breaks at the ordinary space beside the U+00A0.
  it('refuses U+00A0 beside an ordinary space, on either side, and names each space in order', () => {
    const mixed = (pair: string, figure: string, gap: string) =>
      `card.caveats.0: ${pair} ${figure} are joined by ${gap}, not U+00A0 (docs/CONTENT-STYLE.md §4)`;
    const code = '"EUR" and its figure';
    expect(joins('Up to EUR\u00a0\u002020 a year.')).toEqual([mixed(code, '"20"', 'U+00A0 U+0020')]);
    expect(joins('Up to EUR\u0020\u00a020 a year.')).toEqual([mixed(code, '"20"', 'U+0020 U+00A0')]);
    expect(joins('Up to 20\u00a0\u0020EUR a year.')).toEqual([mixed(code, '"20"', 'U+00A0 U+0020')]);
    expect(joins('Declare it on Modelo\u0020\u00a0721.')).toEqual([
      mixed('the name "Modelo" and its number', '"721"', 'U+0020 U+00A0'),
    ]);
    expect(joins('Held for 365\u00a0\u0020days.')).toEqual([
      mixed('the figure "365" and its unit', '"days"', 'U+00A0 U+0020'),
    ]);
  });

  it('reads a format or control character in the gap as part of it, and a lone U+00A0 as no gap', () => {
    const gaps = ['\u2060', '\u0600', '\u0085', '\u0007', '\u2060\u0020'];
    expect(gaps.flatMap((gap) => joins(`Up to EUR${gap}20 a year.`))).toEqual([
      refusedBy('U+2060'),
      refusedBy('U+0600'),
      refusedBy('U+0085'),
      refusedBy('U+0007'),
      refusedBy('U+2060 U+0020'),
    ]);
    // The joined `EUR 100` is no match, so the `100 USD` after it is still read.
    expect(joins('Swap EUR\u00a0100 USD.')).toEqual([refused('"USD" and its figure', '"100"')]);
  });

  // Round 1 of fix/join-gap-title-words: a refused run after a code took the figure the next pair needed.
  it('leaves the figure to the next pair after a code or a form name, joined or not, so both gaps are read', () => {
    const by = (pair: string, figure: string, gap: string) =>
      `card.caveats.0: ${pair} "${figure}" are joined by ${gap}, not U+00A0 (docs/CONTENT-STYLE.md \u00a74)`;
    const eur = (gap: string) => by('"EUR" and its figure', '100', gap);
    const usd = by('"USD" and its figure', '100', 'U+0020');
    expect(joins('Swap EUR\u00a0\u2060100 USD.')).toEqual([eur('U+00A0 U+2060'), usd]);
    expect(joins('Swap EUR\u00a0 100 USD.')).toEqual([eur('U+00A0 U+0020'), usd]);
    expect(joins('Swap EUR\u2060100 USD.')).toEqual([eur('U+2060'), usd]);
    expect(joins('Swap EUR 100 USD.')).toEqual([eur('U+0020'), usd]);
    const box = (gap: string) => by('the name "Box" and its number', '100', gap);
    expect(joins('Box\u00a0 100 USD.')).toEqual([box('U+00A0 U+0020'), usd]);
    expect(joins('Box 100 USD.')).toEqual([box('U+0020'), usd]);
    expect(joins('Box\u00a0100 USD.')).toEqual([usd]);
  });

  it('gives a code to the figure after it across any run, and reads that pair', () => {
    expect(joins('Under art.\u00a033.1 EUR\u00a0 1000 is exempt.')).toEqual([
      'card.caveats.0: "EUR" and its figure "1000" are joined by U+00A0 U+0020, not U+00A0 (docs/CONTENT-STYLE.md \u00a74)',
    ]);
    expect(joins('Under art.\u00a033.1 EUR\u20601000 is exempt.')).toEqual([
      'card.caveats.0: "EUR" and its figure "1000" are joined by U+2060, not U+00A0 (docs/CONTENT-STYLE.md \u00a74)',
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

// Carry-overs 5 and 6 of #377: a law name's, a date's and a unit's gap read the same run as a code's, so a format or
// control character there, or U+00A0 beside another space, is refused as the gap it is.
describe('the gap of every prose join, read as a code join reads it (docs/CONTENT-STYLE.md §4)', () => {
  const read = (language: string, text: string) =>
    joinProblems(path, [['card.caveats.0', text]], language).map(({ detail }) => detail);
  const by = (pair: string, figure: string, gap: string) =>
    `card.caveats.0: ${pair} "${figure}" are joined by ${gap}, not U+00A0 (docs/CONTENT-STYLE.md §4)`;
  // Each pair's language, its words as the detail prints them, and a text with `{gap}` where its gap goes.
  const pairs = [
    ['en', 'the name "art." and its number', '46', 'Under art.{gap}46 it is.'],
    ['en', 'the day "31" and its month', 'July', 'On 31{gap}July\u00a02027.'],
    ['en', 'the month "July" and its year', '2027', 'On 31\u00a0July{gap}2027.'],
    ['en', 'the figure "365" and its unit', 'days', 'Held for 365{gap}days.'],
    ['pt-PT', 'the name "artigo" and its number', '10', 'Nos termos do artigo{gap}10.'],
    ['pt-PT', 'the day "1" and its linker', 'de', 'Desde 1{gap}de\u00a0janeiro\u00a0de\u00a02023.'],
    ['pt-PT', 'the linker "de" and its month', 'janeiro', 'Desde 1\u00a0de{gap}janeiro\u00a0de\u00a02023.'],
    ['pt-PT', 'the month "janeiro" and its linker', 'de', 'Desde 1\u00a0de\u00a0janeiro{gap}de\u00a02023.'],
    ['pt-PT', 'the linker "de" and its year', '2023', 'Desde 1\u00a0de\u00a0janeiro\u00a0de{gap}2023.'],
    ['pt-PT', 'the figure "2.º" and its unit', 'Suplemento', 'No 2.º{gap}Suplemento.'],
  ] as const;
  const gaps = [
    ['\u2060', 'U+2060'],
    ['\u0600', 'U+0600'],
    ['\u0085', 'U+0085'],
    ['\u0007', 'U+0007'],
    ['\u00a0\u0020', 'U+00A0 U+0020'],
    ['\u0020\u00a0', 'U+0020 U+00A0'],
    ['\u2060\u00a0', 'U+2060 U+00A0'],
  ] as const;
  const cases = pairs.flatMap((pair) => gaps.map(([gap, printed]) => [printed, ...pair, gap] as const));

  it.each(cases)('refuses %s in %s, between %s %s', (printed, language, pair, figure, text, gap) => {
    expect(read(language, text.replace('{gap}', gap))).toEqual([by(pair, figure, printed)]);
  });

  it.each(pairs)('in %s, passes a lone U+00A0 and refuses U+0020 between %s %s', (language, pair, figure, text) => {
    expect(read(language, text.replace('{gap}', '\u00a0'))).toEqual([]);
    expect(read(language, text.replace('{gap}', '\u0020'))).toEqual([by(pair, figure, 'U+0020')]);
  });

  it('still reads the gap after a joined one, and a joined law number', () => {
    expect(read('pt-PT', 'Desde 1\u00a0de janeiro.')).toEqual([
      by('the linker "de" and its month', 'janeiro', 'U+0020'),
    ]);
    expect(read('en', 'Under art.\u00a046-bis, 365\u2060days.')).toEqual([
      'card.caveats.0: the range or number "46-bis" can break after its hyphen (docs/CONTENT-STYLE.md §4)',
      by('the figure "365" and its unit', 'days', 'U+2060'),
    ]);
  });

  // Round 1 of fix/join-gap-title-words: each kind of prose pair is its own search, and a date reads its two gaps in
  // one match, so a refused run takes no part another pair needs.
  it('reads every pair beside a refused run, of its own kind or another', () => {
    expect(read('en', 'Under art.\u00a0\u002046\u2060days.')).toEqual([
      by('the name "art." and its number', '46', 'U+00A0 U+0020'),
      by('the figure "46" and its unit', 'days', 'U+2060'),
    ]);
    expect(read('en', 'On 31\u00a0\u0020July\u2060\u00202027 days.')).toEqual([
      by('the day "31" and its month', 'July', 'U+00A0 U+0020'),
      by('the month "July" and its year', '2027', 'U+2060 U+0020'),
      by('the figure "2027" and its unit', 'days', 'U+0020'),
    ]);
    expect(read('en', 'Pay EUR\u00a0\u0020365\u2060days.')).toEqual([
      by('"EUR" and its figure', '365', 'U+00A0 U+0020'),
      by('the figure "365" and its unit', 'days', 'U+2060'),
    ]);
  });
});

// D5 to D7 and S4 of #358 (docs/CONTENT-STYLE.md §4): in English prose a law's name and its number and a date's parts
// are joined by U+00A0, and an en dash or a hyphen-minus between two digits takes U+2060 after it, so that a narrow
// screen never splits them.
const wj = String.fromCodePoint(0x2060);
const nb = String.fromCodePoint(0x2011);
const codes = (problems: readonly { code: string }[]) => problems.map(({ code }) => code);
const ranged = (range: string) =>
  `card.caveats.0: the range "${range}" can break after its dash (docs/CONTENT-STYLE.md §4)`;
// The figure as the detail prints it, a hidden character by its code point (`02-U+2060 01-03`).
const hyphened = (figure: string) =>
  `card.caveats.0: the range or number "${figure}" can break after its hyphen (docs/CONTENT-STYLE.md §4)`;
const named = (name: string, number: string) =>
  refused(`the name ${JSON.stringify(name)} and its number`, `"${number}"`);
const dayed = (day: string, month: string) => refused(`the day "${day}" and its month`, `"${month}"`);
const yeared = (month: string, year: string) => refused(`the month "${month}" and its year`, `"${year}"`);

describe('a law name, a date and a range in English prose (docs/CONTENT-STYLE.md §4)', () => {
  it('refuses an ordinary space after each listed law name, and passes U+00A0', () => {
    const cases: [string, string, string][] = [
      ['See § 23 EStG.', '§', '23'],
      ['Under art. 46 CIRS.', 'art.', '46'],
      ['Article 6(5) applies.', 'Article', '6'],
      ['The section 104 pool.', 'section', '104'],
      ['Rule no. 3 applies.', 'no.', '3'],
      [`Under Lei 24${nb}D/2022.`, 'Lei', '24U+2011 D/2022'],
    ];
    for (const [text, name, number] of cases) {
      expect(joins(text), text).toEqual([named(name, number)]);
      expect(joins(text.replace(`${name} `, `${name}${nbsp}`)), text).toEqual([]);
    }
  });

  it('passes a law name before a word and a name the list leaves out', () => {
    expect(['Article six applies.', 'Chapter 5 applies.', 'The docket IX R 3/22 says so.'].flatMap(joins)).toEqual([]);
  });

  it('joins n°, (EU) before a regulation’s number and Orden, and leaves lett. before its letter (round 2)', () => {
    expect(joins('Loi n° 2026-534 of 2026.')).toEqual([named('n°', '2026-534'), hyphened('2026-534')]);
    expect(joins('Under Regulation (EU) 2023/1114 (MiCA).')).toEqual([named('(EU)', '2023/1114')]);
    expect(joins('Filed by June (Orden HAC/277/2026).')).toEqual([named('Orden', 'HAC/277/2026')]);
    const joined = [
      `Loi n°${nbsp}2026-${wj}534 of 2026.`,
      `Under Regulation (EU)${nbsp}2023/1114 (MiCA).`,
      `Filed by June (Orden${nbsp}HAC/277/2026).`,
      `Taxed under art.${nbsp}67 c.${nbsp}1 lett. c${nb}sexies TUIR.`,
      'See lett. c of the article.',
    ];
    expect(joined.flatMap(joins)).toEqual([]);
  });

  it('refuses a hyphen-minus between two digits without U+2060 after it (S4), and passes one beside a letter', () => {
    expect(joins('The 2026-27 tax year.')).toEqual([hyphened('2026-27')]);
    expect(joins(`Under Notice${nbsp}2023-27.`)).toEqual([hyphened('2023-27')]);
    expect(joins(`Manual Part${nbsp}02-01-03.`)).toEqual([hyphened('02-01-03')]);
    expect(joins(`Manual Part${nbsp}02-${wj}01-03.`)).toEqual([hyphened('02-U+2060 01-03')]);
    const joined = [`The 2026-${wj}27 tax year.`, `Under Notice${nbsp}2023-${wj}27.`, `Part${nbsp}02-${wj}01-${wj}03.`];
    expect(joined.flatMap(joins)).toEqual([]);
    const letters = [
      'COVID-19 relief.',
      'An e-money token.',
      `Form${nbsp}1099-DA.`,
      `art.${nbsp}10 c.${nbsp}1‑bis`,
      `c.${nbsp}1-${wj}bis`,
    ];
    expect(letters.flatMap(joins)).toEqual([]);
    expect(joins(`art.${nbsp}10 c.${nbsp}1-bis`)).toEqual([hyphened('1-bis')]);
  });

  it('reads no figure inside a URL, as the percent and grouping checks do (J1, J2)', () => {
    const url = 'https://www.irs.gov/pub/irs-drop/n-23-27.pdf';
    expect(joins(`See ${url}`)).toEqual([]);
    expect(joins(`Notice${nbsp}2023-27, ${url}`)).toEqual([hyphened('2023-27')]);
    expect(joins(`See Notice${nbsp}2023-${wj}27 at ${url} for 2023–2025.`)).toEqual([ranged('2023–2025')]);
  });

  it('reads no join across a URL: the words on either side of it are not adjacent (J5 round 2)', () => {
    expect(joins('Paid in EUR https://x.example/a 20 times')).toEqual([]);
    expect(joins('Notice https://www.irs.gov/n.pdf 2023-27')).toEqual([hyphened('2023-27')]);
    expect(joins('Paid in EUR https://a.example/1 https://b.example/2 20 times')).toEqual([]);
    expect(joins('See https://a.example/1 Notice 2023-27 at https://b.example/2-3')).toEqual([
      named('Notice', '2023-27'),
      hyphened('2023-27'),
    ]);
    expect(joins('https://x.example/2023-27 EUR 20 a month')).toEqual([refused('"EUR" and its figure', '"20"')]);
    expect(joins('Paid EUR 20 at https://x.example/2023-27')).toEqual([refused('"EUR" and its figure', '"20"')]);
    expect(joins(`https://x.example/2023-27 EUR${nbsp}20 at https://y.example/n-23-27.pdf`)).toEqual([]);
  });

  it('starts a figure at a point after a letter, never at one inside a figure (J3, J4)', () => {
    expect(joins('Under s.104-105 TCGA.')).toEqual([hyphened('104-105')]);
    expect(joins('Under Rev.Proc.2025-32.')).toEqual([hyphened('2025-32')]);
    expect(joins('Under s.104–105 TCGA.')).toEqual([ranged('104–105')]);
    expect(joins('A rate of 1.5-2 points.')).toEqual([hyphened('1.5-2')]);
    expect(joins('A rate of 1,5–2 points.')).toEqual([ranged('1,5–2')]);
    const joined = [`Under s.104-${wj}105 TCGA.`, `Under Rev.Proc.2025-${wj}32.`, `Under s.104–${wj}105 TCGA.`];
    expect(joined.flatMap(joins)).toEqual([]);
  });

  it('refuses each ordinary gap of a date, naming its pair, and passes the joined forms', () => {
    expect(joins('From 1 Jan 2023.')).toEqual([dayed('1', 'Jan'), yeared('Jan', '2023')]);
    expect(joins('From Sept 2029.')).toEqual([yeared('Sept', '2029')]);
    expect(joins('Due by 31 January.')).toEqual([dayed('31', 'January')]);
    expect(joins('It may 2025 be so.')).toEqual([]);
    expect(
      [`From 1${nbsp}Jan${nbsp}2023.`, `From Sept${nbsp}2029.`, `Due by 31${nbsp}January.`].flatMap(joins),
    ).toEqual([]);
  });

  it('skips a date, a name and a range in the file-only lotRuleNote', () => {
    expect(joinProblems(path, [['lotRuleNote', 'From 1 January 2023 (§ 23, 2023–2025).']])).toEqual([]);
  });

  it('refuses an en-dash range without U+2060 after its dash, and passes one with it', () => {
    expect(joins('In 2023–2025 documents.')).toEqual([ranged('2023–2025')]);
    expect(joins('Rates of 40–45 %.')).toEqual([ranged('40–45')]);
    expect(joins('See §§ 187–188 BGB.')).toEqual([named('§§', '187'), ranged('187–188')]);
    expect([`In 2023–${wj}2025 documents.`, `Rates of 40–${wj}45 %.`].flatMap(joins)).toEqual([]);
  });

  it('passes every refusal once its fix is applied: U+00A0 in the gap, U+2060 after the dash or hyphen', () => {
    const fixed = [
      `See §§${nbsp}187–${wj}188 BGB, from 1${nbsp}Jan${nbsp}2023.`,
      `Under Lei${nbsp}24${nb}D/2022 of 29${nbsp}December${nbsp}2022, art.${nbsp}10 n.º${nbsp}23.`,
      `Rates of 12,2–${wj}48% (Topic${nbsp}409), Notice${nbsp}2026-${wj}20 §3.03.`,
      `Loi n°${nbsp}2026-${wj}534, Regulation (EU)${nbsp}2023/1114, Orden${nbsp}HAC/277/2026, Part${nbsp}02-${wj}01-${wj}03.`,
    ];
    expect(fixed.flatMap(joins)).toEqual([]);
    expect(fixed.map((text) => joins(text.replaceAll(nbsp, ' ').replaceAll(wj, '')).length)).toEqual([4, 5, 4, 6]);
  });

  it('gives a translation no law, date or range join until its language has lists', () => {
    const es = '§ 23, el 1 de enero de 2023, art. 10, 2023–2025.';
    expect(joinProblems(path, [['card.caveats.0', es]], 'es-ES')).toEqual([]);
    expect(
      codes(languagePercentProblems(path, 'es-ES', load('jurisdictions/es.json'), [['card.caveats.0', es]])),
    ).toEqual([]);
  });

  it('runs through localeProblems and the content gate on an English profile', () => {
    const profile = load('jurisdictions/es.json');
    expect(codes(localeProblems(path, profile, [['card.caveats.0', 'In 2023–2025 documents.']]))).toEqual([
      'range-join',
    ]);
    const { $comment: _, ...allow } = allowList;
    const json = { ...JSON.parse(readFileSync(new URL('jurisdictions/es.json', root), 'utf8')) };
    json.filingNote = 'Filed by 30 June (art. 46).';
    const gate = validateContent([{ path, json }], { today: '2026-10-17', allow });
    expect(codes(gate.filter(({ detail }) => detail.startsWith('filingNote:')))).toEqual([
      'figure-join',
      'figure-join',
    ]);
  });

  it('keeps a range with U+2060 whole for the decimal check', () => {
    const profile = load('jurisdictions/pt.json');
    const decimals = codes(localeProblems(path, profile, [['card.caveats.0', `From 12.2–${wj}48%.`]]));
    expect(decimals).toEqual(['decimal-separator']);
  });
});

// D6 of #358 (docs/CONTENT-STYLE.md §9): pt-PT's law names from the census of its overlays, and its dates `D de M de
// YYYY`, `D de M` and `M de YYYY` with U+00A0 in each gap, as lib/format writes a pt-PT date.
describe('a law name, a date and a range in pt-PT prose (docs/CONTENT-STYLE.md §9)', () => {
  const pt = (text: string) => joinProblems(path, [['card.caveats.0', text]], 'pt-PT').map(({ detail }) => detail);
  const dayDe = (day: string) => refused(`the day "${day}" and its linker`, '"de"');
  const deMonth = (month: string) => refused('the linker "de" and its month', `"${month}"`);
  const monthDe = (month: string) => refused(`the month "${month}" and its linker`, '"de"');
  const deYear = (year: string) => refused('the linker "de" and its year', `"${year}"`);

  it('refuses each of the four gaps of a full date, and passes it joined (P1)', () => {
    const date = [dayDe('1'), deMonth('janeiro'), monthDe('janeiro'), deYear('2023')];
    expect(pt('Desde 1 de janeiro de 2023.')).toEqual(date);
    expect(pt(`Desde 1${nbsp}de${nbsp}janeiro${nbsp}de${nbsp}2023.`)).toEqual([]);
  });

  it('refuses the two gaps of a month and its year and of a day and its month (P2)', () => {
    expect(pt('Em janeiro de 2026.')).toEqual([monthDe('janeiro'), deYear('2026')]);
    expect(pt('Até 31 de outubro.')).toEqual([dayDe('31'), deMonth('outubro')]);
    expect([`Em janeiro${nbsp}de${nbsp}2026.`, `Até 31${nbsp}de${nbsp}outubro.`].flatMap(pt)).toEqual([]);
  });

  it('refuses an ordinary space after each listed law name, and a range after one (P3)', () => {
    const names = ['§', '§§', 'art.', 'arts.', 'artigo', 'artigos', 'n.º', 'n.ºs', 'Lei', 'Decreto-Lei', 'secção'];
    for (const name of [...names, 'frase', 'parágrafo', 'exemplo', 'código']) {
      expect(pt(`Ver ${name} 12.`), name).toEqual([named(name, '12')]);
      expect(pt(`Ver ${name}${nbsp}12.`), name).toEqual([]);
    }
    expect(pt('Pela Lei n.º 3.')).toEqual([named('n.º', '3')]);
    expect(pt('Nos termos do art. 10.º do CIRS.')).toEqual([named('art.', '10.º')]);
    expect(pt('Os n.ºs 23–24 do artigo.')).toEqual([named('n.ºs', '23'), ranged('23–24')]);
  });

  it('refuses a law name the translation keeps in its source language, as English joins it (P3, lesson 579)', () => {
    const kept: [string, string, string][] = [
      ['Ver Topic 409.', 'Topic', '409'],
      ['Pela Circolare 30/E.', 'Circolare', '30/E'],
      ['No art. 67 c. 1.', 'c.', '1'],
      ['Pela TCGA 1992.', 'TCGA', '1992'],
    ];
    for (const [text, name, number] of kept) {
      expect(
        pt(text).filter((detail) => !detail.includes('"art."')),
        text,
      ).toEqual([named(name, number)]);
      expect(pt(text.replaceAll(' ', nbsp)), text).toEqual([]);
    }
  });

  it('refuses an ordinary space after (UE), pt-PT’s form of English’s (EU) (P3)', () => {
    const regulation = 'os criptoativos do Regulamento (UE) 2023/1114 (MiCA)';
    expect(pt(regulation)).toEqual([named('(UE)', '2023/1114')]);
    expect(pt(regulation.replace('(UE) ', `(UE)${nbsp}`))).toEqual([]);
  });

  it('refuses a hyphen-minus between two figures without U+2060 after it (P4)', () => {
    expect(pt('O ano fiscal 2026-27.')).toEqual([hyphened('2026-27')]);
    expect(pt(`O ano fiscal 2026-${wj}27.`)).toEqual([]);
  });

  it('leaves English’s results as they were, and reads no month of the other language (P5)', () => {
    const english = [named('§', '23'), dayed('1', 'January'), yeared('January', '2023')];
    expect(joins('From 1 January 2023, § 23.')).toEqual(english);
    expect(joins('Desde 1 de janeiro de 2023.')).toEqual([]);
    expect(pt('From 1 January 2023.')).toEqual([]);
  });

  it('leaves de before a bare year, and a name before a word, unchecked (P6)', () => {
    expect(pt('Desde 2023, o regime de 2026 e a Lei de 2025, em maio.')).toEqual([]);
  });

  it('runs through the translated call of the content gate with pt-PT, and fails without it (P7)', () => {
    const portugal = load('jurisdictions/pt.json');
    const outubro = [['card.caveats.0', 'Até 31 de outubro.']] as [string, string][];
    expect(codes(languagePercentProblems(path, 'pt-PT', portugal, outubro))).toEqual(['figure-join', 'figure-join']);
    const english = {
      path: 'packages/content/jurisdictions/pt.json',
      json: JSON.parse(readFileSync(new URL('jurisdictions/pt.json', root), 'utf8')),
    };
    const overlayPath = 'packages/content/i18n/pt-PT/jurisdictions/pt.json';
    const note = (gap: string) =>
      `Ano fiscal igual ao ano civil. A declaração (Modelo${nbsp}3) é entregue de 1${gap}de${gap}abril a 30${gap}de${gap}junho do ano seguinte.`;
    const { $comment: _, ...allow } = allowList;
    const gate = (gap: string) =>
      validateContent([english, { path: overlayPath, json: { filingNote: note(gap) } }], { today: '2026-10-17', allow })
        .filter((problem) => problem.path === overlayPath)
        .map(({ code }) => code);
    expect(gate(' ')).toEqual(['figure-join', 'figure-join', 'figure-join', 'figure-join']);
    expect(gate(nbsp)).toEqual([]);
  });

  it('passes every refusal once its fix is applied (P8)', () => {
    const fixed = [
      `Lei n.º${nbsp}212/2026, de 4${nbsp}de${nbsp}novembro${nbsp}de${nbsp}2026, art.${nbsp}10.º.`,
      `Os n.ºs${nbsp}23–${wj}24, o ano 2026-${wj}27 e até 31${nbsp}de${nbsp}maio.`,
    ];
    expect(fixed.flatMap(pt)).toEqual([]);
    expect(fixed.map((text) => pt(text.replaceAll(nbsp, ' ').replaceAll(wj, '')).length)).toEqual([6, 5]);
  });
});

// #368 A (docs/CONTENT-STYLE.md §4 and §9): a figure and its unit word, a citation's brackets, an identifier, a law
// number's hyphen and pt-PT's form name, each of which a narrow screen split in the probe of #368.
describe('a figure and its unit, a citation and an identifier (docs/CONTENT-STYLE.md §4)', () => {
  const pt = (text: string) => joinProblems(path, [['card.caveats.0', text]], 'pt-PT').map(({ detail }) => detail);
  const unit = (figure: string, word: string) => refused(`the figure "${figure}" and its unit`, `"${word}"`);
  const cited = (citation: string) =>
    `card.caveats.0: the citation "${citation}" can break between its brackets (docs/CONTENT-STYLE.md §4)`;

  it('refuses an ordinary space between a figure and its English unit word, and passes U+00A0 (U1)', () => {
    expect(joins('Held under 365 days.')).toEqual([unit('365', 'days')]);
    expect(joins('Exempt after 5 years.')).toEqual([unit('5', 'years')]);
    expect(joins('After 1 day, 2 weeks, 1 month, 12 months or 1 year.')).toEqual([
      unit('1', 'day'),
      unit('2', 'weeks'),
      unit('1', 'month'),
      unit('12', 'months'),
      unit('1', 'year'),
    ]);
    expect(joins(`Held under 365${nbsp}days, exempt after 5${nbsp}years.`)).toEqual([]);
  });

  it('refuses the same in pt-PT, an ordinal before Suplemento included, and passes U+00A0 (U2)', () => {
    expect(pt('Detidas há menos de 365 dias.')).toEqual([unit('365', 'dias')]);
    expect(pt('No 2.º Suplemento.')).toEqual([unit('2.º', 'Suplemento')]);
    expect(pt('Em 1 dia, 2 semanas, 1 mês, 3 meses, 1 ano ou 5 anos.')).toHaveLength(6);
    expect(pt(`Detidas há menos de 365${nbsp}dias, no 2.º${nbsp}Suplemento.`)).toEqual([]);
  });

  it('leaves a unit word after a word, inside a word, and in a language without lists (U3)', () => {
    expect(joins('For many days, a 365-day rule, 5 yearsago.')).toEqual([]);
    expect(joinProblems(path, [['card.caveats.0', 'Held under 365 days.']], 'de')).toEqual([]);
  });

  it('refuses a citation whose brackets meet with no U+2060, and passes one with it (C1)', () => {
    expect(codes(joinProblems(path, [['card.caveats.0', `Under art.${nbsp}55(1)(d).`]]))).toEqual(['citation-join']);
    expect(joins(`Under art.${nbsp}55(1)(d).`)).toEqual([cited('55(1)(d)')]);
    expect(joins(`Under art.${nbsp}55(1)${wj}(d) and 6(5).`)).toEqual([]);
    expect(pt(`Nos termos do artigo${nbsp}55(1)(d).`)).toEqual([cited('55(1)(d)')]);
  });

  it('reads nothing inside a URL or in the file-only lotRuleNote (U4)', () => {
    expect(joins('See https://example.org/55(1)(d)/365 days ago.')).toEqual([]);
    const note = 'Held 365 days, art. 55(1)(d), processo 28969.';
    expect(joinProblems(path, [['lotRuleNote', note]], 'pt-PT')).toEqual([]);
  });

  it('refuses an ordinary space after PIV, processo and Série, and leaves a docket unchecked (N1)', () => {
    expect(joins('The ruling PIV 28969 says so.')).toEqual([named('PIV', '28969')]);
    expect(pt('Informação vinculativa, processo 28969')).toEqual([named('processo', '28969')]);
    expect(pt('Processo 28969 e PIV 29052')).toEqual([named('Processo', '28969'), named('PIV', '29052')]);
    expect(pt('Diário da República, Série I, 2.º Suplemento')).toHaveLength(2);
    expect(pt('Diário da República, Série I')).toEqual([named('Série', 'I')]);
    expect(pt(`Série${nbsp}I, Série${nbsp}II, processo${nbsp}28969, IX R 3/22`)).toEqual([]);
  });

  it('refuses a hyphen-minus inside a law number without U+2060 after it (N2)', () => {
    expect(pt(`Lei n.º${nbsp}24-D/2022`)).toEqual([hyphened('24-D/2022')]);
    expect(pt(`Lei n.º${nbsp}24-${wj}D/2022 e Lei n.º${nbsp}24${nb}D/2022`)).toEqual([]);
  });

  it('refuses an ordinary space after Formulário, pt-PT’s form name (#367)', () => {
    expect(pt('No Formulário 3.')).toEqual([named('Formulário', '3')]);
    expect(joins(`No Formulário${nbsp}3.`)).toEqual([]);
  });

  it('reads every language’s unit words in every text: an English card quotes its country’s law (U5)', () => {
    const quote = (gap: string) => `Held "por um período igual ou superior a 365${gap}dias" are exempt.`;
    expect(joins(quote(' '))).toEqual([unit('365', 'dias')]);
    expect(codes(joinProblems(path, [['card.holdingRuleText', quote(' ')]]))).toEqual(['figure-join']);
    expect(joins(quote(nbsp))).toEqual([]);
    expect(joins('Six brackets (6 escalões) in 3 states, for many dias.')).toEqual([]);
    expect(pt('Detidas há menos de 365 days.')).toEqual([unit('365', 'days')]);
  });

  it('reads Suplemento as a unit only after an ordinal figure (U6)', () => {
    expect(pt('No 2.º Suplemento.')).toEqual([unit('2.º', 'Suplemento')]);
    expect(joins('In the 2.º Suplemento.')).toEqual([unit('2.º', 'Suplemento')]);
    expect(pt('No 2 Suplemento, 2. Suplemento.')).toEqual([]);
    expect(pt(`No 2.º${nbsp}Suplemento.`)).toEqual([]);
  });

  it('refuses a hyphen-minus before a Latin ordinal suffix after a number or a letter (L1)', () => {
    const suffixes = ['bis', 'ter', 'quater', 'quinquies', 'sexies', 'septies', 'octies', 'novies', 'decies'];
    expect(joins(suffixes.map((suffix) => `9-${suffix}`).join(', '))).toEqual(
      suffixes.map((suffix) => hyphened(`9-${suffix}`)),
    );
    expect(joins('Under lett. c-sexies TUIR.')).toEqual([hyphened('c-sexies')]);
    expect(pt(`No Formulário${nbsp}3916-bis.`)).toEqual([hyphened('3916-bis')]);
    expect(joins(`art.${nbsp}10 c.${nbsp}1-bis`)).toEqual([hyphened('1-bis')]);
  });

  it('passes U+2011 before the suffix, and leaves a word, a longer prefix and another suffix (L2)', () => {
    const joined = [`lett. c${nb}sexies`, `Form${nbsp}3916${nb}bis`, `c.${nbsp}9${nb}bis`, `c.${nbsp}1-${wj}bis`];
    expect(joined.flatMap(joins)).toEqual([]);
    expect(['An e-money token.', 'The ab-bis case, 9-bisect, 9-terms.', 'COVID-19.'].flatMap(joins)).toEqual([]);
  });
});

// C9 and C10 of #370: a detail prints a quoted text and its gap by every code point they hold (printedText,
// printedGap), and a source's title never holds U+2011, in any language (docs/CONTENT-STYLE.md §4).
describe('one printing of a figure and its gap, and no U+2011 in a title', () => {
  it('names each space of a gap, and U+2011 in a quoted figure', () => {
    expect(joins('Up to EUR  20 a year.')).toEqual([
      'card.caveats.0: "EUR" and its figure "20" are joined by U+0020 U+0020, not U+00A0 (docs/CONTENT-STYLE.md §4)',
    ]);
    expect(joins(`Under Lei${nbsp}24${nb}D-A/2022.`)).toEqual([hyphened('24U+2011 D-A/2022')]);
  });

  const titled = (title: string, lang: string): CountryProfile => {
    const profile = load('jurisdictions/pt.json');
    const [first] = profile.sources;
    if (first === undefined) throw new Error('pt.json has no source');
    return { ...profile, sources: [{ ...first, title, lang }] };
  };
  it.each(['en', 'pt', 'de'])('refuses U+2011 in a title in lang %s, and passes U+002D with U+2060', (lang) => {
    expect(titleJoinProblems(path, titled(`The 9${nb}bis rule`, lang))).toEqual([
      {
        path,
        code: 'range-join',
        detail:
          'sources.0.title: the title "The 9U+2011 bis rule" holds U+2011; a source\'s title keeps the published U+002D, with U+2060 after it where range-join asks for one (docs/CONTENT-STYLE.md §4)',
      },
    ]);
    expect(titleJoinProblems(path, titled(`The 9-${wj}bis rule`, lang))).toEqual([]);
  });
});

describe('the real profiles and their overlays', () => {
  it('join every code, form name, law name and date part with U+00A0, and every English range after its dash', () => {
    const english = jsonIn('jurisdictions/').map((name) => `jurisdictions/${name}`);
    const overlays = readdirSync(new URL('i18n/', root), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap(({ name: language }) => jsonIn(`i18n/${language}/jurisdictions/`).map((name) => ({ language, name })));
    expect(english).toHaveLength(10);
    expect(overlays.length).toBeGreaterThan(0);
    const problems = [
      ...english.flatMap((file) => joinProblems(file, profileTexts(load(file)))),
      ...english.flatMap((file) => titleJoinProblems(file, load(file))),
      ...overlays.flatMap(({ language, name }) => {
        const file = `i18n/${language}/jurisdictions/${name}`;
        const overlay: unknown = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
        const translated = applyOverlay(load(`jurisdictions/${name}`), overlay, 'jurisdiction');
        return joinProblems(file, profileTexts(translated), language);
      }),
    ];
    expect(problems).toEqual([]);
  });
});
