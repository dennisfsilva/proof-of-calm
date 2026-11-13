import {
  applyExchangeImport,
  type Entry,
  type ExchangeImportPlan,
  type ImportChoices,
  type Instant,
  planExchangeImport,
  readExchangeFile,
  sameImport,
} from '@proofofcalm/core';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryPlanStore } from '../../lib/adapters/memory-store';
import type { Snapshot } from '../../lib/ports';
import { fixtureSnapshot } from '../../lib/services/fixtures';
import { KRAKEN_OCTOBER, krakenLedger, ONE_TAP_OCTOBER } from '../../lib/services/kraken.testing';
import { createTestServices, TEST_TODAY } from '../../lib/services/testing';
import { exchangeImportActions } from './exchange-actions';
import { exchangeContext } from './model/import';

// The exchange import's write (docs/DOMAIN.md §3.13): the plan is computed again inside the write on the entries as
// stored, and anything another tab changed since the preview refuses it (D7). Another tab writes through the stored
// plan (`planStore.write`), so this tab's snapshot does not see it before the write reads the store.

const read = readExchangeFile(KRAKEN_OCTOBER);
if (!read.ok) throw new Error('the synthetic ledger reads');
const FILE = read.value;
const CHOICES: ImportChoices = { venue: 'Kraken', addHeld: false };
const LATER = '2026-10-20T10:30:00.000Z' as Instant;
let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

/** One tab over a memory store holding the fixture's plan and `extra`, with the preview of `file` it shows. */
async function opened(extra: readonly Entry[] = [], snapshot: Partial<Snapshot> = {}, file = FILE) {
  const base = fixtureSnapshot();
  const planStore = memoryPlanStore({ ...base, entries: [...base.entries, ...extra], ...snapshot });
  const services = createTestServices({ planStore });
  dispose = services.dispose;
  await services.start();
  const planOn = (stored: Snapshot) => {
    if (stored.plan === null) throw new Error('a plan is stored');
    const context = exchangeContext(TEST_TODAY, services.clock.now(), services.clock.timeZone);
    return planExchangeImport(file, { plan: stored.plan, entries: stored.entries }, CHOICES, context);
  };
  const shown = planOn(planStore.current());
  const importFile = (plan: ExchangeImportPlan = shown) =>
    exchangeImportActions(services).importFile(file, plan, CHOICES);
  return { planStore, shown, planOn, importFile };
}

describe('exchangeImportActions.importFile', () => {
  it('tombstones the estimates the plan replaces and adds its entries, in one write', async () => {
    const { planStore, shown, importFile } = await opened([ONE_TAP_OCTOBER]);
    expect(await importFile()).toEqual({ kind: 'imported', added: 5, replaced: 1, imported: 0, deleted: 0 });
    const stored = planStore.current().entries;
    const tombstone = stored.find((entry) => entry.id === ONE_TAP_OCTOBER.id);
    const { updatedAt: _, ...fields } = ONE_TAP_OCTOBER;
    expect(tombstone).toMatchObject({ ...fields, deletedAt: expect.any(String) });
    expect(tombstone?.updatedAt).toBe(tombstone?.deletedAt);
    expect((tombstone?.updatedAt ?? '') > ONE_TAP_OCTOBER.updatedAt).toBe(true);
    const ids = new Set(stored.map((entry) => entry.id));
    expect(shown.entries.every((entry) => ids.has(entry.id))).toBe(true);
  });

  it('writes nothing when the plan adds nothing, and counts the rows imported earlier', async () => {
    const { planStore, planOn, importFile } = await opened();
    await importFile();
    const before = planStore.current();
    const again = planOn(before);
    expect(await importFile(again)).toEqual({ kind: 'imported', added: 0, replaced: 0, imported: 5, deleted: 0 });
    expect(planStore.current()).toStrictEqual(before);
  });

  describe('after another tab changed the Log since the preview', () => {
    /**
     * Refuses `changed` with the plan the stored entries give now (stamped at the write's instant, so compared with
     * `sameImport`, which ignores only `updatedAt`), and writes nothing.
     */
    async function refusesChanged(tab: Awaited<ReturnType<typeof opened>>) {
      const before = tab.planStore.current();
      const outcome = await tab.importFile();
      if (outcome.kind !== 'refused' || outcome.refusal.code !== 'changed')
        throw new Error(`not refused: ${JSON.stringify(outcome)}`);
      expect(sameImport(outcome.refusal.plan, tab.planOn(before))).toBe(true);
      expect(sameImport(outcome.refusal.plan, tab.shown)).toBe(false);
      expect(tab.planStore.current()).toStrictEqual(before);
    }

    it('refuses `changed` after a one tap of a month the plan fills', async () => {
      const tab = await opened();
      expect(tab.shown.replaced).toEqual([]);
      await tab.planStore.write({ entries: [ONE_TAP_OCTOBER] });
      await refusesChanged(tab);
    });

    it('refuses `changed` after a delete of an estimate the plan replaces', async () => {
      const tab = await opened([ONE_TAP_OCTOBER]);
      expect(tab.shown.replaced).toHaveLength(1);
      await tab.planStore.write({ entries: [{ ...ONE_TAP_OCTOBER, deletedAt: LATER, updatedAt: LATER }] });
      await refusesChanged(tab);
    });

    it('refuses `changed` after an edit of the amount of an estimate the plan replaces', async () => {
      const tab = await opened([ONE_TAP_OCTOBER]);
      expect(tab.shown.replaced.flatMap((item) => item.estimates.map((each) => each.amount))).toEqual([
        ONE_TAP_OCTOBER.amount,
      ]);
      const edited = { ...ONE_TAP_OCTOBER, amount: '80' as Entry['amount'], updatedAt: LATER };
      await tab.planStore.write({ entries: [edited] });
      await refusesChanged(tab);
      const outcome = await tab.importFile();
      if (outcome.kind !== 'refused' || outcome.refusal.code !== 'changed') throw new Error('not refused');
      const replaced = outcome.refusal.plan.replaced.flatMap((item) => item.estimates);
      expect(replaced.map(({ id, amount }) => ({ id, amount }))).toEqual([{ id: ONE_TAP_OCTOBER.id, amount: '80' }]);
    });

    it('refuses `changed` after the same import, so nothing is added twice', async () => {
      const tab = await opened([ONE_TAP_OCTOBER]);
      const other = applyExchangeImport(tab.planStore.current().entries, tab.shown, LATER);
      await tab.planStore.write({ entries: other.entries });
      await refusesChanged(tab);
      expect(tab.planOn(tab.planStore.current()).entries).toEqual([]);
    });
  });

  it('refuses `newer-rows` while rows from a newer version are stored, and writes nothing', async () => {
    const { planStore, importFile } = await opened([], { newerTombstones: 1 });
    const before = planStore.current();
    expect(await importFile()).toEqual({ kind: 'refused', refusal: { code: 'newer-rows' } });
    expect(planStore.current()).toStrictEqual(before);
  });

  // The reader keys a movement by refid, coin and direction, so these ledgers give two entries one id; the store puts
  // rows by id, so writing both would keep one and count two.
  it.each([
    [
      'two invite bonus rows of one coin under one refid',
      [
        ['BQ9ZZZ-SYNTH-000005', '2026-10-16 00:00:00', 'invite bonus', 'BTC', '0.0000500000', '0.0000000000'],
        ['BQ9ZZZ-SYNTH-000005', '2026-10-17 00:00:00', 'invite bonus', 'BTC', '0.0000300000', '0.0000000000'],
      ],
    ],
    [
      'an invite bonus row under the refid of a trade that bought its coin',
      [
        ['TQ9ZZZ-SYNTH-000003', '2026-10-12 12:00:00', 'trade', 'EUR', '-50.0000', '0.1300'],
        ['TQ9ZZZ-SYNTH-000003', '2026-10-12 12:00:00', 'trade', 'BTC', '0.0008000000', '0.0000000000'],
        ['TQ9ZZZ-SYNTH-000003', '2026-10-12 12:00:00', 'invite bonus', 'BTC', '0.0000500000', '0.0000000000'],
      ],
    ],
  ] as const)('refuses `invalid-entries` for %s, and writes nothing', async (_, rows) => {
    const file = readExchangeFile(krakenLedger(rows));
    if (!file.ok) throw new Error('the synthetic ledger reads');
    const { planStore, shown, importFile } = await opened([], {}, file.value);
    const [first] = shown.entries;
    expect(shown.entries.map((entry) => entry.id)).toEqual([first?.id, first?.id]);
    const before = planStore.current();
    expect(await importFile()).toEqual({
      kind: 'refused',
      refusal: { code: 'invalid-entries', ids: [first?.id] },
    });
    expect(planStore.current()).toStrictEqual(before);
  });

  it('refuses `no-plan` when another tab deleted the plan, and writes nothing', async () => {
    const { planStore, importFile } = await opened();
    await planStore.write({ plan: null });
    const before = planStore.current();
    expect(await importFile()).toEqual({ kind: 'refused', refusal: { code: 'no-plan' } });
    expect(planStore.current()).toStrictEqual(before);
  });
});
