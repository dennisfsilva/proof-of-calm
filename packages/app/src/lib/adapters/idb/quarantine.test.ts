// @vitest-environment node
// The set-aside rows the screens' lines read (ADR-0019 Readings, 2026-11-26): the live plan and entry rows of
// the list, each with the time it was set aside; nothing else in the list is one.
import { instant } from '@proofofcalm/core/testing';
import { describe, expect, it } from 'vitest';
import { CORRUPT_KEY, quarantineRecord, setAsideRows } from './quarantine';

const AT = instant('2026-10-17T09:00:00.000Z');
const LATER = instant('2026-10-18T09:00:00.000Z');

describe('setAsideRows', () => {
  it('lists the live plan and entry rows with their time, in the order of the list', () => {
    const list = [
      quarantineRecord('entries', 'e-2', { id: 'e-2', payload: {}, deletedAt: null }, ['payload: invalid_type'], LATER),
      quarantineRecord('plans', 'p-1', { id: 'p-1', payload: {} }, ['payload.split: split-sum'], AT),
      quarantineRecord('entries', 'e-1', 'not a row', ['invalid_type'], AT),
    ];
    expect(setAsideRows(list)).toStrictEqual({
      plans: [{ id: 'p-1', at: AT, currency: null }],
      entries: [
        { id: 'e-2', at: LATER },
        { id: 'e-1', at: AT },
      ],
    });
  });

  it('leaves out tombstones, the prefs row, a list kept whole and keys that are not strings', () => {
    const list = [
      quarantineRecord('entries', 'gone', { id: 'gone', deletedAt: AT }, ['payload: invalid_type'], AT),
      quarantineRecord('plans', 'gone-plan', { id: 'gone-plan', deletedAt: AT }, ['payload: invalid_type'], AT),
      quarantineRecord('prefs', 'device', { theme: 7 }, ['theme: invalid_value'], AT),
      quarantineRecord('meta', CORRUPT_KEY, [{ store: 'entries' }], ['0.id: invalid_type'], AT),
      quarantineRecord('entries', 42, { id: 42 }, ['id: invalid_type'], AT),
    ];
    expect(setAsideRows(list)).toStrictEqual({ plans: [], entries: [] });
  });

  it('counts a row whose deletedAt is not an instant as live, as storedLive does', () => {
    const list = [
      quarantineRecord('entries', 'e-1', { id: 'e-1', deletedAt: 'soon' }, ['deletedAt: invalid_type'], AT),
    ];
    expect(setAsideRows(list).entries).toStrictEqual([{ id: 'e-1', at: AT }]);
  });
});

describe('setAsideRows: the currency of a set-aside plan row (ADR-0019 Readings, 2026-11-26)', () => {
  const planRow = (id: string, payload: unknown, issue: string) =>
    quarantineRecord('plans', id, { id, deviceId: 'device', payload }, [issue], AT);

  it('reads the pay currency of a row whose payload parses that far', () => {
    const list = [
      planRow('split', { payCurrency: 'EUR', split: { BTC: '70', ETH: '20' } }, 'payload.split: split-sum'),
      quarantineRecord('plans', 'device', { id: 'device', deviceId: 7, payload: { payCurrency: 'EUR' } }, [
        'deviceId: invalid_type',
      ], AT),
    ];
    expect(setAsideRows(list).plans).toStrictEqual([
      { id: 'split', at: AT, currency: 'EUR' },
      { id: 'device', at: AT, currency: 'EUR' },
    ]);
  });

  it('gives null for an unreadable payload and a currency outside the set', () => {
    const list = [
      planRow('text', 'ciphertext', 'payload: invalid_type'),
      planRow('none', null, 'payload: invalid_type'),
      planRow('number', { payCurrency: 7 }, 'payload.payCurrency: invalid_type'),
      planRow('sek', { payCurrency: 'SEK' }, 'payload.payCurrency: invalid_value'),
    ];
    expect(setAsideRows(list).plans.map((row) => row.currency)).toStrictEqual([null, null, null, null]);
  });

  it('names no plan row for a list kept whole, whatever it holds', () => {
    const whole = [{ store: 'plans', id: 'p-1', raw: { payload: { payCurrency: 'EUR' } } }];
    const list = [quarantineRecord('meta', CORRUPT_KEY, whole, ['0.issues: invalid_type'], AT)];
    expect(setAsideRows(list).plans).toStrictEqual([]);
  });
});
