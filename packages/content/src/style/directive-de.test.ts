import { describe, expect, it } from 'vitest';
import { findBanned } from './banned.ts';
import { opensWithGermanForm } from './directive-de.ts';

// The German line rule (directive-de.ts, docs/CONTENT-STYLE.md §2) beyond the D1 judge's corpora: every start of a
// split verb is tested, and the rule's reach into English text is pinned.

describe('a split verb after a noun spelled like a separable base', () => {
  // Kauf, Tausch, Wechsel, Schlag and Stoß are nouns and bases of a split verb: the noun must not hide the
  // directive that follows it in the same line.
  const REFUSED = [
    'Legen Sie den Rest in ETH an.',
    'Nach dem Kauf von BTC legen Sie den Rest in ETH an.',
    'Beim Kauf von BTC: Legen Sie Ihr Geld in Bitcoin an.',
    'Nach dem Tausch schichten Sie Ihre BTC in ETH um.',
    'Nach dem Wechsel schichten Sie Ihre BTC um.',
    'Nach dem Schlag greifen Sie bei BTC zu.',
    'Nach dem Stoß stoßen Sie Ihre BTC ab.',
    'Das Setzen eines Limits ist leicht: setzen Sie auf BTC.',
    'Nach dem Kauf von BTC führen Sie den nächsten Kauf von ETH durch.',
  ];

  it.each(REFUSED)('refuses %j', (text) => {
    expect(findBanned(text).map(({ rule }) => rule)).toContain('imperative');
  });

  it('still passes the noun when no directive follows it', () => {
    expect(findBanned('Nach dem Kauf von BTC ist der Plan an.')).toEqual([]);
    expect(findBanned('Der Tausch von BTC in ETH ist ein Verkauf.')).toEqual([]);
  });
});

describe('the German line rule over English text', () => {
  // A deliberate cross-language over-refusal: every language's rows run over every text (docs/CONTENT-STYLE.md §2,
  // docs/LEGAL.md §6), and these English words are spelled as a German form of the list. English copy avoids them in a
  // line that names an asset.
  const REFUSED = [
    'Only put in money you can spare for Bitcoin.',
    'Keep a spare copy of your Bitcoin plan.',
    'Halt: Bitcoin prices fall too.',
    'A hole in a Bitcoin backup loses the coins.',
    'A staple keeps the Bitcoin printout together.',
    'The spar of a Bitcoin chart.',
  ];

  it.each(REFUSED)('refuses %j', (text) => {
    expect(findBanned(text).map(({ rule }) => rule)).toContain('imperative');
  });

  it('passes those words in a line that names no asset', () => {
    expect(findBanned('Only put in money you can spare.')).toEqual([]);
    expect(findBanned('Halt: prices fall too.')).toEqual([]);
  });
});

describe('a branch that opens with a placeholder', () => {
  // The German plurals write `{figure}`, the number in the country's format, where English writes `#`.
  it('opens with no listed form, as `#` does', () => {
    expect(opensWithGermanForm('{figure} Kauf')).toBe(false);
    expect(opensWithGermanForm('# Kauf')).toBe(false);
    expect(findBanned('{count, plural, one {{figure} Kauf} other {{figure} Käufe}}')).toEqual([]);
    expect(findBanned('{count, plural, one {# Kauf} other {# Käufe}}')).toEqual([]);
  });
});

describe('the German copy of §10 (docs/CONTENT-STYLE.md)', () => {
  it.each([
    'Proof of Calm ist bei keiner Finanzaufsicht registriert und unterliegt nicht deren Aufsicht',
    'Verkauf',
    'Investiert',
    'Monatskauf',
    'Startbetrag',
    'Zusatzkauf',
    'Ihr Bestand',
  ])('passes %j', (text) => {
    expect(findBanned(text)).toEqual([]);
  });
});
