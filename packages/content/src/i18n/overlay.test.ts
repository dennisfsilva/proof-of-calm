import { afterAll, describe, expect, it } from 'vitest';
import type { Problem } from '../problem.ts';
import { applyOverlay, CONTENT_LANGUAGES, TRANSLATABLE } from './overlay.ts';
import { numbersIn, overlayProblems as overlayProblemsOf } from './overlay-validate.ts';

// Translated content as sparse overlays on the English files (ADR-0057): the merge, and what an overlay may hold.

// D16 of #318: the overlay check names no computed fix for a translated figure. Every problem a case in this file
// raises is kept, and after the last case no number mismatch's detail holds a `; write …` clause.
const raised: Problem[] = [];
const overlayProblems = (...args: Parameters<typeof overlayProblemsOf>) => {
  const problems = overlayProblemsOf(...args);
  raised.push(...problems);
  return problems;
};
afterAll(() => {
  const mismatches = raised.filter(({ code }) => code === 'overlay-number-mismatch');
  expect(mismatches.length).toBeGreaterThan(20);
  expect(mismatches.filter(({ detail }) => detail.includes('; write'))).toEqual([]);
});

const english = {
  name: 'Portugal',
  filingNote: 'Gains go in the annual return.',
  holdingRule: { kind: 'days', days: 365, effect: 'exempt' },
  holdingRuleConditions: ['The counterparty is in the EU.', 'The coin is not a security.'],
  card: {
    summary60: 'A purchase held for 365 days is tax-free.',
    rates: [{ label: 'Flat rate', value: '28 %', validFrom: '2023-01-01', validTo: null }],
  },
  sources: [{ key: 'pt-cirs', title: 'CIRS', url: 'https://example.pt/cirs', accessed: '2026-10-16' }],
  status: { version: 3, changeNotice: null, lastReviewed: '2026-10-16' },
};
const path = 'packages/content/i18n/pt-PT/jurisdictions/pt.json';
const codes = (overlay: unknown, base: unknown = english) =>
  overlayProblems('jurisdiction', path, base, overlay, ['en', 'pt-PT']).map((p) => p.code);
// The same values, as the number check reads each text: English with `en`, the translation with its own locale.
const same = (en: string, translated: string, locale = 'pt-PT') =>
  numbersIn(en, 'en').join(' ') === numbersIn(translated, locale).join(' ');

describe('CONTENT_LANGUAGES and TRANSLATABLE', () => {
  it('names English first and the two launch languages', () => {
    expect(CONTENT_LANGUAGES).toEqual(['en', 'pt-PT', 'de']);
  });

  it('allows prose only: no source, date, number or code', () => {
    const all = Object.values(TRANSLATABLE).flat();
    for (const field of ['sources.*.url', 'sources.*.title', 'card.rates.*.validFrom', 'holdingRule.days', 'code']) {
      expect(all).not.toContain(field);
    }
    expect(TRANSLATABLE.fact).toEqual(['value', 'unit']);
    expect(TRANSLATABLE.template).toEqual(['name', 'oneLine', 'riskLabel', 'explanation']);
  });
});

describe('applyOverlay', () => {
  it('replaces the overlaid prose and keeps everything else, in the English key order', () => {
    const overlay = {
      filingNote: 'Os ganhos vão na declaração anual.',
      holdingRuleConditions: [null, 'A moeda não é um valor mobiliário.'],
      card: { rates: [{ label: 'Taxa fixa' }] },
    };
    const merged = applyOverlay(english, overlay, 'jurisdiction');
    expect(merged.filingNote).toBe(overlay.filingNote);
    expect(merged.holdingRuleConditions).toEqual([
      'The counterparty is in the EU.',
      'A moeda não é um valor mobiliário.',
    ]);
    expect(merged.card.rates).toEqual([{ ...english.card.rates[0], label: 'Taxa fixa' }]);
    expect(Object.keys(merged)).toEqual(Object.keys(english));
    expect({ ...merged, filingNote: english.filingNote, holdingRuleConditions: english.holdingRuleConditions }).toEqual(
      { ...english, card: { ...english.card, rates: [{ ...english.card.rates[0], label: 'Taxa fixa' }] } },
    );
  });

  it('answers the English value itself for an absent or empty overlay', () => {
    expect(applyOverlay(english, undefined, 'jurisdiction')).toEqual(english);
    expect(applyOverlay(english, {}, 'jurisdiction')).toEqual(english);
  });

  it('never touches a source, a date, a number or an unknown key, and never changes an array length', () => {
    const overlay = {
      sources: [{ url: 'https://elsewhere.example/', accessed: '2030-01-01' }],
      card: { rates: [{ validFrom: '2030-01-01', value: 99 }] },
      holdingRule: { days: 1 },
      holdingRuleConditions: ['Only one.'],
      extra: 'x',
    };
    expect(applyOverlay(english, overlay, 'jurisdiction')).toEqual(english);
  });
});

describe('overlayProblems', () => {
  it('passes a sparse overlay of translatable prose', () => {
    expect(codes({ name: 'Portugal', card: { summary60: 'Uma compra detida 365 dias está isenta.' } })).toEqual([]);
    expect(codes({ holdingRuleConditions: [null, 'A moeda não é um valor mobiliário.'] })).toEqual([]);
  });

  it('refuses a path that does not exist in English', () => {
    expect(codes({ nickname: 'PT' })).toEqual(['overlay-unknown-path']);
    expect(codes({ card: { losses: 'Perdas.' } })).toEqual(['overlay-unknown-path']);
    expect(codes({ status: { changeNotice: 'Nada.' } })).toEqual(['overlay-unknown-path']);
    expect(codes({ toString: 'x' })).toEqual(['overlay-unknown-path']);
  });

  it('refuses a field that is not prose: a source, a date, a number', () => {
    expect(codes({ sources: [{ url: 'https://elsewhere.example/' }] })).toEqual(['overlay-not-translatable']);
    expect(codes({ card: { rates: [{ validFrom: '2030-01-01' }] } })).toEqual(['overlay-not-translatable']);
    expect(codes({ holdingRule: { days: 30 } })).toEqual(['overlay-not-translatable']);
    expect(codes({ status: { version: 4 } })).toEqual(['overlay-not-translatable']);
    expect(codes({ card: 'Um cartão.' })).toEqual(['overlay-not-translatable']);
  });

  it('refuses an array of another length than its English one', () => {
    expect(codes({ holdingRuleConditions: ['Só uma.'] })).toEqual(['overlay-array-length']);
    expect(codes({ card: { rates: [{ label: 'a' }, { label: 'b' }] } })).toEqual(['overlay-array-length']);
  });

  it('refuses a translated value whose numbers differ from the English value', () => {
    const summary = (text: string) => codes({ card: { summary60: text } });
    expect(summary('Uma compra detida 366 dias está isenta.')).toEqual(['overlay-number-mismatch']);
    expect(summary('Uma compra detida um ano está isenta.')).toEqual(['overlay-number-mismatch']);
    expect(codes({ card: { rates: [{ value: '28 % e 5 %' }] } })).toEqual(['overlay-number-mismatch']);
  });

  it('compares values read with each text’s separators, not digit runs', () => {
    const summary = (en: string, translated: string) =>
      codes({ card: { summary60: translated } }, { card: { summary60: en } });
    expect(summary('A fee of 1.5 % applies.', 'Aplica-se uma taxa de 15 %.')).toEqual(['overlay-number-mismatch']);
    expect(summary('A fee of 1.5 % applies.', 'Aplica-se uma taxa de 1,5 %.')).toEqual([]);
    expect(same('31.4 %', '3,14 %')).toBe(false);
    expect(same('31.4 %', '31,4 %')).toBe(true);
    expect(same('1.5 %', '15 %')).toBe(false);
  });

  it('reads 1,000 as 1 000 and 1.000 in pt-PT, and as one thousand only where the separator groups', () => {
    expect(same('1,000 euros', '1 000 euros')).toBe(true);
    expect(same('1,000 euros', `1${String.fromCodePoint(0xa0)}000 euros`)).toBe(true);
    expect(same('1,000 euros', '1.000 euros')).toBe(true);
    expect(same('1,000 euros', '1,000 euros')).toBe(false);
    expect(same('5.5 % of 1,000', '5,5 % de 1.000', 'de')).toBe(true);
    expect(same('1,000.5', '1 000,5')).toBe(true);
  });

  // ADR-0057 'What validation holds': a template or a fact has no page, so its English reads with `en` and its
  // translation with its language's own grouping; only a profile's texts compare a point as written.
  it('reads a template’s and a fact’s translation with its language’s own grouping and citation points', () => {
    const problems = (kind: 'template' | 'fact', field: string, en: string, translated: string, language: string) =>
      overlayProblems(kind, 'p', { [field]: en }, { [field]: translated }, ['en', language]).map((p) => p.detail);
    const german = ['Each coin fell 31.4 % from 1,000 euros.', 'Jede Münze fiel 31,4 % von 1.000 Euro.'] as const;
    expect(problems('template', 'explanation', ...german, 'de')).toEqual([]);
    expect(problems('template', 'explanation', 'BIP 32.1 wallets.', 'Carteiras BIP 32.1.', 'pt-PT')).toEqual([]);
    expect(problems('fact', 'value', 'BIP 32.1 wallets.', 'Carteiras BIP 32.1.', 'pt-PT')).toEqual([]);
  });

  it('holds values, not word order, nor which noun each belongs to', () => {
    expect(same('28 % after 365 days', 'Após 365 dias, 28 %')).toBe(true);
    expect(same('5 % on gains, 10 % on income', '10 % sobre os ganhos, 5 % sobre o rendimento')).toBe(true);
  });

  // D8 and the grouped figures (2026-11-16): both texts of a profile are read with its page's number locale,
  // `12,2%` and `EUR 59 357` for Portugal and the Netherlands, `12.2%` and `£37,700` for Britain.
  it('reads both texts of a profile with its page’s number locale', () => {
    const nbsp = String.fromCodePoint(0xa0);
    expect(numbersIn(`12,2% of EUR 1000 and 6,00% above EUR 59${nbsp}357`, 'pt-PT', true)).toEqual([
      '1000',
      '12.2',
      '59357',
      '6',
    ]);
    expect(numbersIn('12.2 % of £37,700', 'en-GB', true)).toEqual(['12.2', '37700']);
    const summary = (english: string, translated: string, locale = 'nl-NL') =>
      overlayProblems('jurisdiction', path, { card: { summary60: english } }, { card: { summary60: translated } }, [
        locale,
        locale,
      ]).map((problem) => problem.code);
    const en = `A deemed 6,00% of assets above EUR 59${nbsp}357 per person.`;
    expect(summary(en, `Um rendimento de 6,00% acima de EUR 59${nbsp}357 por pessoa.`)).toEqual([]);
    expect(summary(en, 'Um rendimento de 6,00% acima de EUR 59.357 por pessoa.')).toEqual(['overlay-number-mismatch']);
    expect(summary('A £37,700 band.', 'Um escalão de £37,700.', 'en-GB')).toEqual([]);
  });

  // D16 of #318: where a cited point is in play, the detail names each side's figures as its text writes them and no
  // fix; the translator copies English's figure (ADR-0057). `cited` names no figure, since the writer of `0.125` cited
  // nothing.
  it('names the mismatch and English’s figures as written where a profile’s translation writes a point', () => {
    const detail = (english: string, translated: string, locale = 'de-DE') =>
      overlayProblems('jurisdiction', path, { card: { caveats: [english] } }, { card: { caveats: [translated] } }, [
        locale,
        locale,
      ]).map((problem) => problem.detail);
    const typedNbsp = `${String.fromCodePoint(0x5c)}u00a0`;
    expect(detail('0,125 BTC', '0.125 BTC')).toEqual(['card.caveats.0: 0.125, English 0,125']);
    expect(detail('EUR 1000', 'EUR 1.000')).toEqual(['card.caveats.0: 1.000, English 1000']);
    expect(detail(`EUR 20${String.fromCodePoint(0xa0)}350`, 'EUR 20.350')).toEqual([
      `card.caveats.0: 20.350, English 20${typedNbsp}350`,
    ]);
    expect(detail('art. 33.1', 'art. 33.10')).toEqual(['card.caveats.0: 33.10, English 33.1']);
    expect(detail('Up to EUR 1,1250 a year.', 'Até EUR 1.125 por ano.')).toEqual([
      'card.caveats.0: 1.125, English 1,1250',
    ]);
    expect(detail('Up to EUR 2,5 a year.', 'Até EUR 2.500 por ano.')).toEqual(['card.caveats.0: 2.500, English 2,5']);
    expect(detail('Up to EUR 1,125 a year.', 'Até EUR 1.125 por ano.')).toEqual([
      'card.caveats.0: 1.125, English 1,125',
    ]);
    for (const locale of ['pt-PT', 'nl-NL']) {
      expect(detail('EUR 1000', 'EUR 1.000', locale)).toEqual(['card.caveats.0: 1.000, English 1000']);
      expect(detail('0,125 BTC', '0.125 BTC', locale)).toEqual(['card.caveats.0: 0.125, English 0,125']);
    }
  });

  // Round 2 of #318's fix (25m): a fix picked from every English figure by value named one the translation already
  // holds (`write 1`, refused again) and withheld the right one. The detail names the figures and no fix.
  it('names no fix beside a figure the translation already holds', () => {
    const detail = (english: string, translated: string) =>
      overlayProblems('jurisdiction', path, { card: { caveats: [english] } }, { card: { caveats: [translated] } }, [
        'de-DE',
        'de-DE',
      ]).map((problem) => problem.detail);
    expect(detail('Up to EUR 1500 a year, for 1 person.', 'Até EUR 1.000 por ano, para 1 pessoa.')).toEqual([
      'card.caveats.0: 1.000 1, English 1500 1',
    ]);
    expect(detail('Up to EUR 1,1250 and EUR 1125.', 'Até EUR 1.125 e EUR 1125.')).toEqual([
      'card.caveats.0: 1.125 1125, English 1,1250 1125',
    ]);
  });

  // #318's design check (D10 of #316): each page form number-group suggests reads as its value in both texts.
  it('passes a translation that writes the page form number-group suggests, and names one that differs', () => {
    const detail = (english: string, translated: string, locale = 'de-DE') =>
      overlayProblems('jurisdiction', path, { card: { caveats: [english] } }, { card: { caveats: [translated] } }, [
        locale,
        locale,
      ]).map((problem) => problem.detail);
    const nbsp = String.fromCodePoint(0xa0);
    const unchanged: readonly [english: string, translated: string, locale?: string][] = [
      ['EUR 12,50', 'EUR 12,50'],
      ['EUR 1234,56', 'EUR 1234,56'],
      [`EUR 20${nbsp}350,5`, `EUR 20${nbsp}350,5`],
      [`EUR 1${nbsp}234${nbsp}567`, `EUR 1${nbsp}234${nbsp}567`],
      ['EUR 0,125', 'EUR 0,125', 'nl-NL'],
      ['EUR 1250,125', 'EUR 1250,125'],
      ['EUR 20 350', `EUR 20${nbsp}350`],
      ['EUR 1000,125', 'EUR 1000,125', 'pt-PT'],
      // number-group refuses the range; the overlay check compares the same figures.
      ['0.125–1.125 EUR', '0.125–1.125 EUR'],
    ];
    for (const [english, translated, locale] of unchanged) {
      expect(detail(english, translated, locale), english).toEqual([]);
    }
    expect(detail('EUR 12.50', 'EUR 12,50')).toEqual(['card.caveats.0: 12,50, English 12.50']);
    expect(detail('EUR 20,350', `EUR 20${nbsp}350`)).toEqual(['card.caveats.0: 20350, English 20.35']);
    expect(detail('EUR 1.5 million', 'EUR 1,5 milhões')).toEqual(['card.caveats.0: 1,5, English 1.5']);
  });

  // D5 of #316: the carry-over "A cited point with three digits", as literal pt-PT and nl-NL profile overlays.
  it.each(['pt-PT', 'nl-NL'])('reads a %s profile’s point as a citation’s and its comma as the decimal', (locale) => {
    const codes = (english: string, translated: string) =>
      overlayProblems('jurisdiction', path, { card: { caveats: [english] } }, { card: { caveats: [translated] } }, [
        locale,
        locale,
      ]).map((problem) => problem.code);
    const mismatch = ['overlay-number-mismatch'];
    expect(codes('EUR 1000', 'EUR 1.000')).toEqual(mismatch);
    expect(codes('art. 33.100', 'art. 33.100')).toEqual([]);
    expect(codes('0,125 BTC', '0.125 BTC')).toEqual(mismatch);
    expect(codes('Quadro 9.4', 'Quadro 9.4')).toEqual([]);
    expect(codes('2,5 %', '2,5 %')).toEqual([]);
    expect(codes('EUR 1000 to EUR 2000', 'EUR 1000 a EUR 2000')).toEqual([]);
  });

  // A comma is the decimal, a no-break space the only group, and a point a citation's, compared as written.
  it('compares a comma-decimal profile’s figure holding a point as written, a citation’s', () => {
    const value = (english: string, translated: string) =>
      overlayProblems(
        'jurisdiction',
        path,
        { card: { rates: [{ value: english }] } },
        { card: { rates: [{ value: translated }] } },
        ['de-DE', 'de-DE'],
      ).map((problem) => problem.code);
    const mismatch = ['overlay-number-mismatch'];
    expect(value('EUR 1000', 'EUR 1.000')).toEqual(mismatch);
    expect(value('art. 33.1', 'art. 33.10')).toEqual(mismatch);
    expect(value('Quadro 9.4', 'Quadro 9,4')).toEqual(mismatch);
    expect(value('0,125 BTC', '0.125 BTC')).toEqual(mismatch);
    expect(value('art. 33.100', 'art. 33.100')).toEqual([]);
    expect(value('12,2–48 %', '12,2–48 %')).toEqual([]);
    expect(value('EUR 1000 to EUR 2000', 'EUR 1000 a EUR 2000')).toEqual([]);
    expect(numbersIn('art. 33.1 and §3.2.1 above EUR 1000', 'de-DE', true)).toEqual([
      '1000',
      'cited 3.2.1',
      'cited 33.1',
    ]);
  });

  it('reads every figure of a percentage range as a percentage, and a law citation beside one as written', () => {
    expect(numbersIn('12,2–48% by bracket', 'pt-PT', true)).toEqual(['12.2', '48']);
    expect(numbersIn('12–48,5% by bracket', 'pt-PT', true)).toEqual(['12', '48.5']);
    expect(numbersIn('12,2-48,5%', 'pt-PT', true)).toEqual(['12.2', '48.5']);
    // Only an unspaced dash or hyphen joins a range (#290): a `to` range writes its sign on each figure.
    expect(numbersIn('2,5% to 13,3%', 'pt-PT', true)).toEqual(['13.3', '2.5']);
    expect(numbersIn('2,5 to 13,3%', 'pt-PT', true)).toEqual(['13.3', '2.5']);
    expect(numbersIn('Art. 33.1 to 28% applies.', 'pt-PT', true)).toEqual(['28', 'cited 33.1']);
    expect(numbersIn('Quadro 9.4-12-28%', 'pt-PT', true)).toEqual(['12', '28', 'cited 9.4']);
    expect(numbersIn('12.2–48% by bracket', 'en-GB', true)).toEqual(['12.2', '48']);
    expect(numbersIn('Art. 33.1 – 28% flat', 'pt-PT', true)).toEqual(['28', 'cited 33.1']);
    const rate = (en: string, translated: string) =>
      overlayProblems(
        'jurisdiction',
        path,
        { card: { rates: [{ value: en }] } },
        { card: { rates: [{ value: translated }] } },
        ['pt-PT', 'pt-PT'],
      ).map((problem) => problem.code);
    expect(rate('12,2–48% by bracket', '12,2–48% por escalão')).toEqual([]);
    expect(rate('12,2–48% by bracket', '12–48% por escalão')).toEqual(['overlay-number-mismatch']);
  });

  // A template's explanation writes `N %`, which the app formats with `format.percent` (CONTENT-STYLE §4, ADR-0023).
  const template = (en: string, translated: string) =>
    overlayProblems(
      'template',
      'packages/content/i18n/pt-PT/templates/cycle-plan.json',
      { explanation: en },
      { explanation: translated },
      ['en', 'pt-PT'],
    ).map((problem) => problem.code);

  it('refuses a template percentage not written `N %` as English writes it, in English’s order', () => {
    const en = 'It splits each amount 40 % Bitcoin and 30 % Ethereum.';
    expect(template(en, 'Divide cada montante: 40 % Bitcoin e 30 % Ethereum.')).toEqual([]);
    expect(template(en, 'Divide cada montante: 40% Bitcoin e 30 % Ethereum.')).toEqual(['overlay-percent-mismatch']);
    expect(template(en, 'Divide cada montante: 40,5 % Bitcoin e 30 % Ethereum.')).toEqual(['overlay-number-mismatch']);
    expect(template(en, 'Divide cada montante: 30 % Ethereum e 40 % Bitcoin.')).toEqual(['overlay-percent-mismatch']);
    expect(template(en, `Divide cada montante: 40${String.fromCodePoint(0xa0)}% Bitcoin e 30 % Ethereum.`)).toEqual([
      'overlay-percent-mismatch',
    ]);
    // A decimal takes the translation's separator, and keeps the ordinary space before the sign.
    expect(template('Each coin fell 31.4 %.', 'Cada moeda caiu 31,4 %.')).toEqual([]);
    expect(template('Each coin fell 31.4 %.', 'Cada moeda caiu 31,4%.')).toEqual(['overlay-percent-mismatch']);
  });

  // The check reads every sign and every gap of nothing, white space, hyphens and hidden characters, so a form the
  // app does not format is named in the detail rather than missing from it (ADR-0057's Corrections, 2026-11-18).
  it.each(['40٪', '40‰', '40\t\t%', '40-%', '40⁠ %'])(
    'refuses %j in a template overlay against English `40 %`',
    (form) => {
      expect(template('Bitcoin: 40 % of each amount.', `Bitcoin: ${form} de cada montante.`)).toEqual([
        'overlay-percent-mismatch',
      ]);
    },
  );

  it("names the gap's code points and the sign, so the translator sees what differs", () => {
    const details = (translated: string) =>
      overlayProblems(
        'template',
        'packages/content/i18n/pt-PT/templates/cycle-plan.json',
        { explanation: 'Bitcoin fell 40 % and Ether 31.4 %.' },
        { explanation: translated },
        ['en', 'pt-PT'],
      ).map(({ detail }) => detail);
    expect(details('A bitcoin caiu 40 % e o ether 31,4 %.')).toEqual([]);
    expect(details('A bitcoin caiu 40\t\t% e o ether 31,4-٪.')).toEqual([
      'explanation: 40U+0009 U+0009 %, 31.4U+002D ٪, English 40 %, 31.4 %',
    ]);
    // Brand's round 2 on #365: a gap that holds anything but one ordinary space names every character, the ordinary
    // space as U+0020, so no space reads as the separator; one ordinary space alone stays a space.
    expect(details('A bitcoin caiu 40  % e o ether 31,4 ‰.')).toEqual([
      'explanation: 40U+0020 U+0020 %, 31.4 ‰, English 40 %, 31.4 %',
    ]);
    expect(details('A bitcoin caiu 40⁠ ‰ e o ether 31,4 %.')).toEqual([
      'explanation: 40U+2060 U+0020 ‰, 31.4U+00A0 %, English 40 %, 31.4 %',
    ]);
  });

  it('keeps a template’s `{date:<field>}` placeholder intact, never translated (#274)', () => {
    const en = 'Bitcoin fell 78 % from its high on {date:drawdowns.BTC.high}.';
    expect(template(en, 'A bitcoin caiu 78 % desde o máximo de {date:drawdowns.BTC.high}.')).toEqual([]);
    expect(template(en, 'A bitcoin caiu 78 % desde o máximo de {data:drawdowns.BTC.high}.')).toEqual([
      'overlay-date-mismatch',
    ]);
    expect(template(en, 'A bitcoin caiu 78 % desde o máximo de {date:drawdowns.BTC.alto}.')).toEqual([
      'overlay-date-mismatch',
    ]);
  });

  it('reads each value once, its sign and trailing zeros aside', () => {
    expect(numbersIn('−94.0 % from $31.91', 'en')).toEqual(['31.91', '94']);
    expect(numbersIn('31.4', 'en')).not.toEqual(numbersIn('31.5', 'en'));
    expect(numbersIn('365 28%', 'en')).toEqual(['28', '365']);
    expect(numbersIn('6.00 and 06', 'en')).toEqual(['6', '6']);
  });

  it('reads a cited point in a comma-decimal translation as English does, a group of three as a group', () => {
    // CONTENT-STYLE §4: a figure that is not a percentage keeps its point, as a law citation does.
    expect(same('Anexo J Quadro 9.4 and art. 33.1', 'Anexo J, Quadro 9.4, e art. 33.1')).toBe(true);
    expect(numbersIn('Quadro 9.4', 'pt-PT')).toEqual(['9.4']);
    expect(numbersIn('1.000 e 9.40', 'pt-PT')).toEqual(['1000', '9.4']);
    expect(numbersIn('3,14 and 9.4', 'en')).toEqual(['14', '3', '9.4']);
  });

  it('reads a point in a comma-decimal profile’s text as a citation’s, kept as written', () => {
    expect(numbersIn('Anexo J, Quadro 9.4, e art. 33.1', 'pt-PT', true)).toEqual(
      numbersIn('Anexo J Quadro 9.4 and art. 33.1', 'pt-PT', true),
    );
    expect(numbersIn('Quadro 9.4', 'pt-PT', true)).toEqual(['cited 9.4']);
    expect(numbersIn('1.000 e 9.40', 'pt-PT', true)).toEqual(['cited 1.000', 'cited 9.40']);
  });
});
