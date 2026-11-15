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
const codes = (overlay: unknown) => overlayProblems('jurisdiction', path, english, overlay).map((p) => p.code);

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

  it('reads 31.4 and 31,4, 1,000 and 1 000 as the same number, in any order', () => {
    expect(numbersIn('31.4 % of 1,000 in 2026')).toEqual(numbersIn('2026: 1 000, 31,4 %'));
    expect(numbersIn('1 000 and 2 500')).toEqual(numbersIn('1.000 e 2.500'));
    expect(numbersIn('−94.0 % from $31.91')).toEqual(['3191', '940']);
    expect(numbersIn('31.4')).not.toEqual(numbersIn('31.5'));
  });
});
