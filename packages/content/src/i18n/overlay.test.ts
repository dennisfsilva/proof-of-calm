import { describe, expect, it } from 'vitest';
import { applyOverlay, CONTENT_LANGUAGES, TRANSLATABLE } from './overlay.ts';
import { numbersIn, overlayProblems } from './overlay-validate.ts';

// Translated content as sparse overlays on the English files (ADR-0057): the merge, and what an overlay may hold.

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

  it('holds values, not word order, nor which noun each belongs to', () => {
    expect(same('28 % after 365 days', 'Após 365 dias, 28 %')).toBe(true);
    expect(same('5 % on gains, 10 % on income', '10 % sobre os ganhos, 5 % sobre o rendimento')).toBe(true);
  });

  // D8 (2026-11-16): an English profile writes a percentage's decimal as its page's number locale does, `12,2%` for
  // Portugal, and its other figures as English does, `1,000`.
  it('reads an English profile’s percentages with its page’s number locale and its other figures with English', () => {
    expect(numbersIn('12,2% of 1,000 and 6,00%', 'en', 'pt-PT')).toEqual(['1000', '12.2', '6']);
    expect(numbersIn(`12.2 % of 1,000`, 'en', 'en-GB')).toEqual(['1000', '12.2']);
    expect(numbersIn('12,2% of 1,000', 'en')).toEqual(['1000', '12', '2']);
    const summary = (locales: readonly [string, string, string?]) =>
      overlayProblems(
        'jurisdiction',
        path,
        { card: { summary60: 'The first bracket is 12,2% above 1,000 euros.' } },
        { card: { summary60: 'O primeiro escalão é 12,2% acima de 1000 euros.' } },
        locales,
      ).map((problem) => problem.code);
    expect(summary(['en', 'pt-PT', 'pt-PT'])).toEqual([]);
    expect(summary(['en', 'pt-PT'])).toEqual(['overlay-number-mismatch']);
  });

  it('reads every figure of a percentage range with the percentage’s locale, and a law citation beside one with English', () => {
    expect(numbersIn('12,2–48% by bracket', 'en', 'pt-PT')).toEqual(['12.2', '48']);
    expect(numbersIn('12–48,5% by bracket', 'en', 'pt-PT')).toEqual(['12', '48.5']);
    expect(numbersIn('12,2-48,5%', 'en', 'pt-PT')).toEqual(['12.2', '48.5']);
    expect(numbersIn('2,5 to 13,3%', 'en', 'pt-PT')).toEqual(['13.3', '2.5']);
    expect(numbersIn('12.2–48% by bracket', 'en', 'en-GB')).toEqual(['12.2', '48']);
    expect(numbersIn('Art. 33.1 – 28% flat', 'en', 'pt-PT')).toEqual(['28', '33.1']);
    const rate = (en: string, translated: string) =>
      overlayProblems(
        'jurisdiction',
        path,
        { card: { rates: [{ value: en }] } },
        { card: { rates: [{ value: translated }] } },
        ['en', 'pt-PT', 'pt-PT'],
      ).map((problem) => problem.code);
    expect(rate('12,2–48% by bracket', '12,2–48% por escalão')).toEqual([]);
    expect(rate('12,2–48% by bracket', '12–48% por escalão')).toEqual(['overlay-number-mismatch']);
  });

  it('reads each value once, its sign and trailing zeros aside', () => {
    expect(numbersIn('−94.0 % from $31.91', 'en')).toEqual(['31.91', '94']);
    expect(numbersIn('31.4', 'en')).not.toEqual(numbersIn('31.5', 'en'));
    expect(numbersIn('365 28%', 'en')).toEqual(['28', '365']);
    expect(numbersIn('6.00 and 06', 'en')).toEqual(['6', '6']);
  });
});
