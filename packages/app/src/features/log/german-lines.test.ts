import { createTranslator } from 'use-intl/core';
import { describe, expect, it } from 'vitest';
import log from '../../messages/de/log.json';

// Three German Log lines in brand's wording (CONTENT-STYLE §1 and §10): a move or an edit is what makes the other
// move short ("Mit dieser Übertragung", not "Nach"), the later move is named as later, and the restored sale's
// branch names the sale before its entries.
const t = createTranslator({ locale: 'de', messages: { log }, namespace: 'log' });

describe('the German Log lines', () => {
  it('a move that leaves a later move short names the later move', () => {
    expect(t('move.laterShort', { to: 'Ledger', date: '1. März 2026', short: '0,01 BTC' })).toMatch(
      /^Mit dieser Übertragung sendet die spätere Übertragung nach Ledger am 1\. März 2026 0,01 BTC mehr, als /u,
    );
  });

  it('an edit that leaves a move short says the edit does it', () => {
    expect(t('form.movesShort', { to: 'Ledger', date: '1. März 2026', short: '0,01 BTC' })).toMatch(
      /^Mit dieser Änderung sendet die Übertragung nach Ledger am 1\. März 2026 0,01 BTC mehr, als /u,
    );
  });

  it('a restore that would leave a sale among several entries short names the sale first', () => {
    expect(t('row.notRestoredOwnSale', { count: 3, figure: '3', coin: 'BTC' })).toBe(
      'Nach dem Wiederherstellen würden dem Verkauf von BTC unter diesen 3 Einträgen Einheiten fehlen, daher bleiben sie gelöscht.',
    );
    expect(t('row.notRestoredOwnSale', { count: 1, figure: '1', coin: 'BTC' })).toBe(
      'Nach dem Wiederherstellen würden diesem Verkauf Einheiten fehlen, daher bleibt er gelöscht.',
    );
  });
});
