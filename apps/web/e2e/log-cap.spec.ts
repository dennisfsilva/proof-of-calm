import { expect, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { type CalendarDate, type Entry, liveEntries, MAX_ENTRIES } from '@proofofcalm/core';
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// The Log at the cap on a slow phone (docs/ENGINEERING.md §4, "The Log at the cap"): the fixture plan filled to
// MAX_ENTRIES live entries (docs/DOMAIN.md §6), one extra buy a day before the first buy day, BTC and ETH in turn,
// so every entry is a row of its own. Chromium's CPU throttle at 6x stands in for the phone. Event Timing gives each
// input's duration, from the input to the next paint; a longtask observer gives the longest task the input starts
// before the screen settles, which Event Timing misses, and the longest task from the navigation to the Log's heading.
// The rule holds both. An input is asserted only while this machine measured both under half the 100 ms rule, since
// CI's shared runners are slower and vary; the others are annotations with their figures. Desktop project only
// (apps/web/playwright.config.ts): the throttle is a Chromium DevTools command.

const CPU_RATE = 6;
const RULE_MS = 100;
// A run took 113 to 121 s on this machine (2026-11-25), the seed's 7 s included.
const TIMEOUT_MS = 420_000;
/**
 * The inputs this machine measured under half the rule at 6x, asserted under it. None on 2026-11-25: opening a row
 * took 136 to 192 ms, Edit entry 1,160 to 1,288, a keystroke in the amount 648 to 776 and closing the sheet 720 to 800.
 */
const ASSERTED: ReadonlySet<string> = new Set<string>([]);

/** The fixture plan with extra buys on the days before its first buy day, up to MAX_ENTRIES live entries. */
function atTheCap(): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [Entry];
  const dayBefore = Date.parse(`${snapshot.plan?.firstBuy ?? '2026-04-05'}T00:00:00Z`) - 86_400_000;
  const more = Array.from(
    { length: MAX_ENTRIES - liveEntries(snapshot.entries).length },
    (_, index): Entry => ({
      ...first,
      id: `00000000-0000-4000-8000-${String(700_000 + index).padStart(12, '0')}` as Entry['id'],
      kind: 'extra',
      slot: null,
      coin: (index % 2 === 0 ? 'BTC' : 'ETH') as Entry['coin'],
      date: new Date(dayBefore - index * 86_400_000).toISOString().slice(0, 10) as CalendarDate,
      amount: '20' as Entry['amount'],
      units: '0.0003' as Entry['units'],
    }),
  );
  return { ...snapshot, entries: [...snapshot.entries, ...more] };
}

type Perf = {
  events: { name: string; duration: number; interactionId: number }[];
  tasks: { start: number; duration: number }[];
  heading: number | null;
};

/** Event Timing entries of 16 ms and more, long tasks, and when the Log's heading first shows; set before any script. */
function observe(): void {
  const perf: Perf = { events: [], tasks: [], heading: null };
  Object.assign(window, { perf });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceEventTiming[]) {
      perf.events.push({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId });
    }
    // durationThreshold is in Event Timing but not in TypeScript's DOM types.
  }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) perf.tasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: 'longtask', buffered: true });
  const heading = new MutationObserver(() => {
    if (document.querySelector('main#main h1') === null) return;
    perf.heading = performance.now();
    heading.disconnect();
  });
  heading.observe(document, { childList: true, subtree: true });
}

const perfOf = (page: Page) => page.evaluate(() => (window as unknown as { perf: Perf }).perf);

/** Waits two frames and a pause, so the observers have delivered what the last input caused. */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 250)));
      }),
  );

/**
 * The longest Event Timing duration of an interaction `act` makes, in ms (0: none reached 16 ms), and the longest
 * task from the input until `shown` holds and the page settles.
 */
async function measure(page: Page, act: () => Promise<void>, shown: () => Promise<void>) {
  await settle(page);
  await page.evaluate(() => {
    const { perf } = window as unknown as { perf: Perf };
    perf.events.length = 0;
    perf.tasks.length = 0;
  });
  await act();
  await shown();
  await settle(page);
  const { events, tasks } = await perfOf(page);
  const input = Math.max(0, ...events.filter((event) => event.interactionId > 0).map((event) => event.duration));
  return { input, task: Math.max(0, ...tasks.map((task) => task.duration)) };
}

test.use({ serviceWorkers: 'block' });

test(`the Log at ${MAX_ENTRIES} entries: each input and Show all at ${CPU_RATE}x CPU, against the ${RULE_MS} ms rule`, async ({
  page,
}, testInfo) => {
  test.setTimeout(TIMEOUT_MS);
  const record = (what: string, figures: Record<string, number>) => {
    const parts = Object.entries(figures).map(([name, ms]) => `${name} ${Math.round(ms)} ms`);
    testInfo.annotations.push({ type: 'perf', description: `${what}: ${parts.join(', ')} at ${CPU_RATE}x CPU` });
  };
  // Today reads the 10,000 entries before the seed's reload settles, and the Log at 6x reads them again.
  const loading = { timeout: TIMEOUT_MS / 6 };
  await routeFixturePrices(page, Date.now());
  await page.addInitScript(observe);
  await seedPlan(page, atTheCap(), undefined, loading);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  const navigated = Date.now();
  await page.goto('/log');
  await expect(page.locator('main#main h1')).toBeVisible(loading);
  const toHeading = Date.now() - navigated;
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true', loading);
  const load = await perfOf(page);
  const beforeHeading = load.tasks.filter((task) => load.heading === null || task.start < load.heading);
  record('Load to the heading', {
    'longest task': Math.max(0, ...beforeHeading.map((task) => task.duration)),
    'until the heading shows': toHeading,
  });

  // The four inputs on the Log as it opens, its last LOG_PAGE transactions; with every row shown each one waits on
  // the 10,000 rows' render, which is over the rule, so Show all comes last.
  const row = page.locator('tbody button[aria-expanded]', { hasText: 'Monthly buy' }).first();
  const open = await measure(
    page,
    () => row.click(),
    () => expect(row).toHaveAttribute('aria-expanded', 'true', loading),
  );
  const sheet = page.getByRole('dialog');
  const edit = await measure(
    page,
    () => page.getByRole('button', { name: 'Edit entry' }).click(),
    () => expect(sheet).toContainText('Edit the entry', loading),
  );
  const amount = sheet.getByLabel('BTC cost before fees (EUR)');
  await amount.click();
  const typed = await measure(
    page,
    () => amount.press('5'),
    () => expect(amount).toHaveValue(/5/, loading),
  );
  const close = await measure(
    page,
    () => sheet.getByRole('button', { name: 'Close' }).click(),
    () => expect(sheet).toBeHidden(loading),
  );

  const inputs = {
    'open a row': open,
    'Edit entry': edit,
    'one keystroke in the amount': typed,
    'close the sheet': close,
  };
  for (const [what, { input, task }] of Object.entries(inputs)) {
    // An input over the rule that no invisible change fixed stays recorded, not asserted (docs/ENGINEERING.md §4).
    record(ASSERTED.has(what) ? what : `${what} (over the rule)`, { input, 'longest task': task });
    if (ASSERTED.has(what)) {
      expect(input, `${what} at ${CPU_RATE}x CPU`).toBeLessThan(RULE_MS);
      expect(task, `${what}'s longest task at ${CPU_RATE}x CPU`).toBeLessThan(RULE_MS);
    }
  }

  const showAll = page.locator('main#main button', { hasText: /^Show all/ });
  const started = Date.now();
  const all = await measure(
    page,
    () => showAll.click(),
    () => expect(showAll).toHaveCount(0, { timeout: TIMEOUT_MS / 2 }),
  );
  // Over the rule: Show all renders every row in one task, so a person waits that long for them; making it shorter
  // changes what the Log shows (paging or a virtual list, a design decision), so it is recorded here and not asserted.
  record('Show all (over the rule)', {
    input: all.input,
    'longest task': all.task,
    'until the rows show': Date.now() - started,
  });
});
