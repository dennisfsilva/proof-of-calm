import { readFileSync } from 'node:fs';
import { DATABASE_NAME, epochMs, PREFS_KEY, prefsRecord, todayIn } from '@proofofcalm/app/lib/adapters';
import { entryRow, planRow } from '@proofofcalm/app/lib/adapters/idb/rows';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { type CalendarDate, DEFAULT_PREFS, type Instant, reviewDue } from '@proofofcalm/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEED_DEVICE_ID, type SeedBrowser, seed } from './seed';

/** The run's now: a day after the fixture plan (set up 2026-04-05) turns one, when the annual review falls due. */
const NOW = '2027-04-06T08:00:00.000Z' as Instant;
const day = (at: Instant) => todayIn(epochMs(at), 'Europe/Lisbon');

/**
 * A browser that records what the seed does to its one page, in order; with `runRows` it also runs the
 * step that writes the rows (the one with an argument), against whatever `indexedDB` the test provides.
 */
function recordingBrowser({ runRows = false } = {}) {
  const calls: [string, unknown][] = [];
  const browser: SeedBrowser = {
    newPage: async () => ({
      setExtraHTTPHeaders: async (headers) => void calls.push(['headers', headers]),
      goto: async (url) => void calls.push(['goto', url]),
      waitForSelector: async (selector) => void calls.push(['wait', selector]),
      evaluate: async (inPage, arg) => {
        calls.push(['evaluate', arg]);
        if (runRows && arg !== null) await inPage(arg);
      },
      close: async () => void calls.push(['close', null]),
    }),
  };
  return { browser, calls };
}

/** What the seed gives its first in-page step: the database's name and the rows. */
type Written = { name: string; rows: { prefs: { key: string; value: { reviewedAt: Instant | null } } } };

async function seededRows(now: Instant): Promise<Written> {
  const { browser, calls } = recordingBrowser();
  await seed(browser, { url: 'http://localhost:3000/today' }, now);
  return calls.filter(([kind]) => kind === 'evaluate').map(([, arg]) => arg)[0] as Written;
}

/**
 * The part of IndexedDB the seed's in-page step uses, recording every put by store; a store outside the
 * transaction throws, as IndexedDB's NotFoundError does.
 */
function recordingIndexedDb() {
  const puts: [string, unknown, IDBValidKey | undefined][] = [];
  const later = (fire: () => void) => void setTimeout(fire, 0);
  const transaction = (names: string[]) => {
    const tx = {
      error: null,
      oncomplete: null as (() => void) | null,
      onabort: null,
      objectStore(name: string) {
        if (!names.includes(name)) throw new Error(`${name} is not in the transaction`);
        return { put: (value: unknown, key?: IDBValidKey) => void puts.push([name, value, key]) };
      },
    };
    later(() => tx.oncomplete?.());
    return tx;
  };
  const database = { transaction, close: () => undefined };
  const open = () => {
    const request = { result: database, error: null, onsuccess: null as (() => void) | null, onerror: null };
    later(() => request.onsuccess?.());
    return request;
  };
  return { puts, factory: { open } };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('seed', () => {
  it('writes the rows the store’s builders make of fixtureSnapshot(), with the e2e seed device', async () => {
    const { browser, calls } = recordingBrowser();
    await seed(browser, { url: 'http://localhost:3000/portfolio' }, NOW);
    const { plan, entries } = fixtureSnapshot();
    if (plan === null) throw new Error('fixtureSnapshot() has no plan');
    const written = calls.filter(([kind]) => kind === 'evaluate').map(([, arg]) => arg);
    expect(written[0]).toEqual({
      name: DATABASE_NAME,
      rows: {
        plans: [planRow(plan, SEED_DEVICE_ID)],
        entries: entries.map((entry) => entryRow(entry, plan.id, SEED_DEVICE_ID)),
        prefs: { key: PREFS_KEY, value: prefsRecord(undefined, { ...DEFAULT_PREFS, reviewedAt: NOW }, NOW) },
      },
    });
  });

  it('writes a prefs record reviewed at the run’s now, so Today asks for no annual review a year on', async () => {
    const { plan } = fixtureSnapshot();
    if (plan === null) throw new Error('fixtureSnapshot() has no plan');
    const { prefs } = (await seededRows(NOW)).rows;
    expect(prefs.value.reviewedAt).toBe(NOW);
    const today = day(NOW);
    expect(today).toBe('2027-04-06' as CalendarDate);
    // The two days as useReviewDates names them, in the clock's zone.
    const dates = (reviewedAt: Instant | null) => ({
      createdOn: day(plan.createdAt),
      reviewedOn: reviewedAt === null ? null : day(reviewedAt),
    });
    // Without the seed's record the store reads the defaults, and the review is due from 2027-04-05.
    expect(reviewDue(dates(DEFAULT_PREFS.reviewedAt), today)).toBe(true);
    expect(reviewDue(dates(prefs.value.reviewedAt), today)).toBe(false);
  });

  it('puts the plan, the entries and the prefs record under its key in one transaction, in the page', async () => {
    const { puts, factory } = recordingIndexedDb();
    vi.stubGlobal('indexedDB', factory);
    const { browser, calls } = recordingBrowser({ runRows: true });
    await seed(browser, { url: 'http://localhost:3000/today' }, NOW);
    const [, written] = calls.find(([kind]) => kind === 'evaluate') ?? [];
    const { rows } = written as { rows: { plans: unknown[]; entries: unknown[]; prefs: { value: unknown } } };
    expect(puts).toEqual([
      ...rows.plans.map((row) => ['plans', row, undefined]),
      ...rows.entries.map((row) => ['entries', row, undefined]),
      ['prefs', rows.prefs.value, PREFS_KEY],
    ]);
  });

  it('opens Today at the measured origin, waits for the screen, seeds, cleans up and closes the page', async () => {
    const { browser, calls } = recordingBrowser();
    await seed(browser, { url: 'https://proof-of-calm-git-x-incubating.vercel.app/log' });
    expect(calls.map(([kind, arg]) => (kind === 'evaluate' ? kind : [kind, arg]))).toEqual([
      ['goto', 'https://proof-of-calm-git-x-incubating.vercel.app/today'],
      ['wait', 'main#main:not([aria-busy="true"])'],
      'evaluate',
      'evaluate',
      ['close', null],
    ]);
  });

  // At a preview the job hands the bypass headers to LHCI as one JSON string in the settings; the seed's
  // page needs them as Lighthouse's runs do, or deployment protection answers with its login page.
  it('sends the headers of the run’s settings, as LHCI passes them from the environment', async () => {
    const headers = { 'x-vercel-protection-bypass': 'not-a-secret', 'x-vercel-skip-toolbar': '1' };
    for (const extraHeaders of [JSON.stringify(headers), headers]) {
      const { browser, calls } = recordingBrowser();
      await seed(browser, { url: 'http://localhost:3000/plan', options: { settings: { extraHeaders } } });
      expect(calls[0]).toEqual(['headers', headers]);
    }
  });

  it('keeps the device id of the e2e seed, so both write the same rows', () => {
    const e2e = readFileSync(new URL('../e2e/seed.ts', import.meta.url), 'utf8');
    expect(e2e).toContain(`const SEED_DEVICE_ID = '${SEED_DEVICE_ID}'`);
  });
});
