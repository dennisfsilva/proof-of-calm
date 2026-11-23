import { describe, expect, it } from 'vitest';
import { findBanned } from './banned.ts';

// The German line rule (directive-de.ts, docs/CONTENT-STYLE.md §2) beyond the D1 judge's corpora: every start of a
// split verb is tested.

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
