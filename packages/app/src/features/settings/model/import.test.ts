import {
  applyImport,
  type CalendarDate,
  exportBackup,
  importId,
  type Instant,
  type Plan,
  readExchangeFile,
} from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { KRAKEN_OCTOBER, krakenLedger } from '../../../lib/services/kraken.testing';
import { exchangeContext, importedPrefs, readImport } from './import';

const NOW = '2026-10-20T10:00:00.000Z' as Instant;

describe('readImport', () => {
  it('reads back what exportBackup wrote, so Replace into an empty store gives the same plan and entries', () => {
    const { plan, entries } = fixtureSnapshot();
    if (plan === null) throw new Error('the fixture has a plan');
    const exported = exportBackup(plan, entries, NOW);
    const read = readImport(JSON.stringify(exported, null, 2));
    expect(read).toEqual({ ok: true, value: { kind: 'backup', file: exported } });
    if (!read.ok || read.value.kind !== 'backup') return;
    const imported = applyImport({ plan: null, entries: [] }, read.value.file, 'replace', NOW);
    expect(imported.plan).toEqual({ ...plan, updatedAt: NOW });
    expect(imported.entries).toEqual(entries.map((entry) => ({ ...entry, updatedAt: NOW })));
  });

  it('reads an export of the DCA plan page as a prototype file, with its purchase count', () => {
    const json = { version: 4, settings: {}, purchases: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] };
    expect(readImport(JSON.stringify(json))).toEqual({ ok: true, value: { kind: 'prototype', json, count: 3 } });
  });

  it('does not recognise text that is not JSON, or JSON that is no backup', () => {
    for (const text of ['date,coin,amount\n2026-10-01,BTC,100', '', '{"format":', '[1, 2]']) {
      expect(readImport(text)).toEqual({ ok: false, error: { code: 'not-recognised' } });
    }
  });

  it('reads a Kraken ledger as an exchange file, and names a ZIP, Kraken’s trades file and a header alone', () => {
    const file = readExchangeFile(KRAKEN_OCTOBER);
    expect(file.ok).toBe(true);
    if (!file.ok) return;
    expect(readImport(KRAKEN_OCTOBER)).toEqual({ ok: true, value: { kind: 'exchange', file: file.value } });
    expect(file.value.movements).toHaveLength(5);
    expect(readImport('PK\u0003\u0004\u0014\u0000ledgers.csv')).toEqual({ ok: false, error: { code: 'zip' } });
    const trades = '"txid","ordertxid","pair","time","type","ordertype","price","cost","fee","vol"\n"T1","O1","XBTEUR"';
    expect(readImport(trades)).toEqual({ ok: false, error: { code: 'kraken-trades' } });
    expect(readImport(krakenLedger([]))).toEqual({ ok: false, error: { code: 'no-rows' } });
  });

  it('refuses a backup from a newer schema version, whatever else it holds', () => {
    const newer = JSON.stringify({ format: 'proof-of-calm', schemaVersion: 6, plan: {}, entries: [] });
    expect(readImport(newer)).toEqual({ ok: false, error: { code: 'newer-version', schemaVersion: 6 } });
  });
});

describe('exchangeContext', () => {
  it('dates an instant in the device zone and derives ids with importId', () => {
    const at = '2026-11-04T23:30:00Z' as Instant;
    const lisbon = exchangeContext('2026-11-13' as CalendarDate, NOW, 'Europe/Lisbon');
    expect([lisbon.today, lisbon.now, lisbon.dateOf(at)]).toEqual(['2026-11-13', NOW, '2026-11-04']);
    expect(exchangeContext('2026-11-13' as CalendarDate, NOW, 'Europe/Berlin').dateOf(at)).toBe('2026-11-05');
    expect(lisbon.idOf('abc')).toBe(importId('abc'));
  });
});

// A review recorded on this device belongs to the plan stored when it was recorded (docs/DOMAIN.md §3.12).
describe('importedPrefs', () => {
  const REVIEWED = '2027-04-10T09:00:00.000Z' as Instant;
  const here = () => {
    const snapshot = fixtureSnapshot();
    if (snapshot.plan === null) throw new Error('the fixture has a plan');
    return { plan: snapshot.plan, entries: snapshot.entries, prefs: { ...snapshot.prefs, reviewedAt: REVIEWED } };
  };
  const another = (plan: Plan) =>
    exportBackup({ ...plan, id: '00000000-0000-4000-8000-000000009999' as Plan['id'] }, [], NOW);

  it('a replace with another plan clears the review', () => {
    const stored = here();
    const result = applyImport(stored, another(stored.plan), 'replace', NOW);
    expect(importedPrefs(stored, result.plan)).toEqual({ ...stored.prefs, reviewedAt: null });
  });

  it('an import with no plan stored clears the review', () => {
    const stored = { ...here(), plan: null, entries: [] };
    const result = applyImport(stored, another(here().plan), 'replace', NOW);
    expect(importedPrefs(stored, result.plan).reviewedAt).toBeNull();
  });

  it('a replace with the same plan keeps it', () => {
    const stored = here();
    const result = applyImport(stored, exportBackup(stored.plan, stored.entries, NOW), 'replace', NOW);
    expect(importedPrefs(stored, result.plan)).toEqual(stored.prefs);
  });

  it('Add missing keeps it, whatever plan the file holds', () => {
    const stored = here();
    const result = applyImport(stored, another(stored.plan), 'add-missing', NOW);
    expect(importedPrefs(stored, result.plan)).toEqual(stored.prefs);
  });

  it('takes the device preferences a prototype file brings, and still clears the review of another plan', () => {
    const stored = { ...here(), plan: null, entries: [] };
    const taken = { theme: 'dark' as const };
    expect(importedPrefs(stored, here().plan, taken)).toEqual({ ...stored.prefs, theme: 'dark', reviewedAt: null });
  });
});
