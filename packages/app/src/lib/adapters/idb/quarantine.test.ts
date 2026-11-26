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
      plans: [{ id: 'p-1', at: AT }],
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
