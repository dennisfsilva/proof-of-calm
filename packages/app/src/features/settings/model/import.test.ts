import { applyImport, exportBackup, type Instant } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { readImport } from './import';

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
    const newer = JSON.stringify({ format: 'proof-of-calm', schemaVersion: 5, plan: {}, entries: [] });
    expect(readImport(newer)).toEqual({ ok: false, error: { code: 'newer-version', schemaVersion: 5 } });
  });
});
