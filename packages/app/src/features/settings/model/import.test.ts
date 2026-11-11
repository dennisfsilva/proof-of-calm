import { applyImport, exportBackup, type Instant, type Plan } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { importedPrefs, readImport } from './import';

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

  it('refuses a backup from a newer schema version, whatever else it holds', () => {
    const newer = JSON.stringify({ format: 'proof-of-calm', schemaVersion: 6, plan: {}, entries: [] });
    expect(readImport(newer)).toEqual({ ok: false, error: { code: 'newer-version', schemaVersion: 6 } });
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
