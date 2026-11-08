import { readFileSync } from 'node:fs';
import { DATABASE_NAME } from '@proofofcalm/app/lib/adapters';
import { entryRow, planRow } from '@proofofcalm/app/lib/adapters/idb/rows';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { describe, expect, it } from 'vitest';
import { SEED_DEVICE_ID, type SeedBrowser, seed } from './seed';

/** A browser that records what the seed does to its one page, in order. */
function recordingBrowser() {
  const calls: [string, unknown][] = [];
  const browser: SeedBrowser = {
    newPage: async () => ({
      setExtraHTTPHeaders: async (headers) => void calls.push(['headers', headers]),
      goto: async (url) => void calls.push(['goto', url]),
      waitForSelector: async (selector) => void calls.push(['wait', selector]),
      evaluate: async (_inPage, arg) => void calls.push(['evaluate', arg]),
      close: async () => void calls.push(['close', null]),
    }),
  };
  return { browser, calls };
}

describe('seed', () => {
  it('writes the rows the store’s builders make of fixtureSnapshot(), with the e2e seed device', async () => {
    const { browser, calls } = recordingBrowser();
    await seed(browser, { url: 'http://localhost:3000/portfolio' });
    const { plan, entries } = fixtureSnapshot();
    if (plan === null) throw new Error('fixtureSnapshot() has no plan');
    const written = calls.filter(([kind]) => kind === 'evaluate').map(([, arg]) => arg);
    expect(written[0]).toEqual({
      name: DATABASE_NAME,
      rows: {
        plans: [planRow(plan, SEED_DEVICE_ID)],
        entries: entries.map((entry) => entryRow(entry, plan.id, SEED_DEVICE_ID)),
      },
    });
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
