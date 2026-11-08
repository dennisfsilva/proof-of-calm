// LHCI's puppeteerScript (apps/web/lighthouserc.json), bundled by `pnpm run lighthouse:seed` to
// node_modules/.cache/lighthouse/seed.cjs, where no lint reads it. LHCI runs it once before each URL's runs, in the browser Lighthouse then
// measures in: it opens Today, puts the plan of `fixtureSnapshot()` into the store the app has opened,
// as rows built here by the store's own builders (no committed copy of the rows), and removes the
// worker and Cache Storage it registered. Lighthouse's reset before every run clears those again and
// keeps IndexedDB (collect.settings.clearStorageTypes), so every measured load is cold but for the plan.
// A put replaces a row by id, so seeding before every URL leaves the same store.
import { DATABASE_NAME } from '@proofofcalm/app/lib/adapters';
import { entryRow, planRow } from '@proofofcalm/app/lib/adapters/idb/rows';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';

/** The device id of the e2e seed (apps/web/e2e/seed.ts says why a fixed, foreign id). */
export const SEED_DEVICE_ID = '00000000-0000-4000-8000-00000000e2e0' as Parameters<typeof planRow>[1];

type Headers = Record<string, string>;

/** The part of puppeteer's Browser and Page the seed uses; LHCI passes the real ones. */
export interface SeedPage {
  setExtraHTTPHeaders(headers: Headers): Promise<void>;
  goto(url: string): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  evaluate<A>(inPage: (arg: A) => Promise<void>, arg: A): Promise<unknown>;
  close(): Promise<void>;
}

export interface SeedBrowser {
  newPage(): Promise<SeedPage>;
}

/** LHCI's context: the URL about to be measured and the collect options, with the run's settings. */
export interface SeedContext {
  url: string;
  options?: { settings?: { extraHeaders?: string | Headers } };
}

function seedRows() {
  const { plan, entries } = fixtureSnapshot();
  return {
    plans: plan === null ? [] : [planRow(plan, SEED_DEVICE_ID)],
    entries: entries.map((entry) => entryRow(entry, plan?.id ?? null, SEED_DEVICE_ID)),
  };
}

type Rows = ReturnType<typeof seedRows>;

async function putRows({ name, rows }: { name: string; rows: Rows }): Promise<void> {
  // No version: the database opens at the version the app created, so no upgrade runs here.
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(['plans', 'entries'], 'readwrite');
    for (const row of rows.plans) transaction.objectStore('plans').put(row);
    for (const row of rows.entries) transaction.objectStore('entries').put(row);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

async function removeWorker(_: null): Promise<void> {
  for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
  for (const key of await caches.keys()) await caches.delete(key);
}

export async function seed(browser: SeedBrowser, { url, options }: SeedContext): Promise<void> {
  const page = await browser.newPage();
  // At a preview the job passes the bypass headers through the environment as one JSON string; the seed's
  // page sends them as Lighthouse's runs do, and writes them nowhere.
  const extraHeaders = options?.settings?.extraHeaders;
  if (extraHeaders !== undefined) {
    await page.setExtraHTTPHeaders(typeof extraHeaders === 'string' ? JSON.parse(extraHeaders) : extraHeaders);
  }
  await page.goto(new URL('/today', url).href);
  await page.waitForSelector('main#main:not([aria-busy="true"])');
  await page.evaluate(putRows, { name: DATABASE_NAME, rows: seedRows() });
  await page.evaluate(removeWorker, null);
  await page.close();
}

export default seed;
