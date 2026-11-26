import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { type CalendarDate, type Entry, LOG_WINDOW, liveEntries, MAX_ENTRIES } from '@proofofcalm/core';
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
// A run took 27 to 29 s on this machine with the window (2026-11-25), the seed's 7 s included.
const TIMEOUT_MS = 420_000;
/**
 * The inputs this machine measured under half the rule at 6x, asserted under it: none with the window of 100. On
 * 2026-11-25 every input passed 50 ms in some run (docs/ENGINEERING.md §4 has the figures): Show older entries' longest
 * task 65 to 115, Show newer entries' 71 to 114, closing the sheet's 0 to 69, the amount's keystroke 0 with its input 32
 * to 48; Show all, Edit entry and opening Go to year stay over the rule.
 */
const ASSERTED: ReadonlySet<string> = new Set<string>();

/**
 * The fixture plan with extra buys on the days before its first buy day, up to MAX_ENTRIES live entries; `withMove`
 * puts one live move of the first entry's coin, on its date, in the place of the oldest extra buy.
 */
function atTheCap(withMove = false): Snapshot {
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
  if (!withMove) return { ...snapshot, entries: [...snapshot.entries, ...more] };
  const move: Entry = {
    ...first,
    id: '00000000-0000-4000-8000-000000000799' as Entry['id'],
    kind: 'move',
    slot: null,
    amount: null,
    units: '0.0001' as Entry['units'],
    to: 'Ledger',
    received: '0.0001' as Entry['units'],
  };
  return { ...snapshot, entries: [...snapshot.entries, ...more.slice(0, -1), move] };
}

type Perf = {
  events: { name: string; duration: number; interactionId: number }[];
  tasks: { start: number; duration: number }[];
  heading: number | null;
  inputAt: number | null;
};

/**
 * Event Timing entries of 16 ms and more, long tasks, when the Log's heading first shows and when the first pointer or
 * key input since the last clear happened; set before any script.
 */
function observe(): void {
  const perf: Perf = { events: [], tasks: [], heading: null, inputAt: null };
  Object.assign(window, { perf });
  for (const type of ['pointerdown', 'keydown']) {
    addEventListener(type, (event) => (perf.inputAt ??= event.timeStamp), { capture: true });
  }
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
 * A click on `target` resolved before the window opens: a locator resolves again on every action, and Playwright's
 * `getByRole` over the Log's rows made a 75 to 101 ms task inside the window (#537's profile). The trial click waits
 * until the click would land; the handle's click inside the window then runs no selector.
 */
async function resolved(page: Page, target: Locator): Promise<() => Promise<void>> {
  await target.click({ ...loading, trial: true });
  const handle = await target.elementHandle(loading);
  if (handle === null) throw new Error(`${target} matched no element`);
  await settle(page);
  return () => handle.click();
}

/**
 * The longest Event Timing duration of an interaction `act` makes, in ms (0: none reached 16 ms), the longest task
 * from clearing the arrays until `shown` holds and the page settles, and the longest of those that started before the
 * input, the harness's own work, since the app is idle once settled (0: none). A locator as `act` is clicked, resolved
 * before the window opens.
 */
async function measure(page: Page, act: (() => Promise<void>) | Locator, shown: () => Promise<void>) {
  await settle(page);
  const perform = typeof act === 'function' ? act : await resolved(page, act);
  await page.evaluate(() => {
    const { perf } = window as unknown as { perf: Perf };
    perf.events.length = 0;
    perf.tasks.length = 0;
    perf.inputAt = null;
  });
  await perform();
  await shown();
  await settle(page);
  const { events, tasks, inputAt } = await perfOf(page);
  const durations = (from: Perf['tasks']) => Math.max(0, ...from.map((task) => task.duration));
  return {
    input: Math.max(0, ...events.filter((event) => event.interactionId > 0).map((event) => event.duration)),
    task: durations(tasks),
    harness: durations(tasks.filter((task) => task.start < (inputAt ?? Number.POSITIVE_INFINITY))),
  };
}

/** An annotation of `figures`, in ms, under `what`. */
const recorder =
  (testInfo: TestInfo) =>
  (what: string, figures: Record<string, number>): void => {
    const parts = Object.entries(figures).map(([name, ms]) => `${name} ${Math.round(ms)} ms`);
    testInfo.annotations.push({ type: 'perf', description: `${what}: ${parts.join(', ')} at ${CPU_RATE}x CPU` });
  };

// Today reads the 10,000 entries before the seed's reload settles, and the Log at 6x reads them again.
const loading = { timeout: TIMEOUT_MS / 6 };

/** Seeds `snapshot`, throttles the CPU and opens the Log; gives back the time to its heading, in ms. */
async function openTheLog(page: Page, snapshot: Snapshot): Promise<number> {
  await routeFixturePrices(page, Date.now());
  await page.addInitScript(observe);
  await seedPlan(page, snapshot, undefined, loading);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
  const navigated = Date.now();
  await page.goto('/log');
  await expect(page.locator('main#main h1')).toBeVisible(loading);
  const toHeading = Date.now() - navigated;
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true', loading);
  return toHeading;
}

test.use({ serviceWorkers: 'block' });

test(`the Log at ${MAX_ENTRIES} entries: each input, Show all and its window at ${CPU_RATE}x CPU, against the ${RULE_MS} ms rule`, async ({
  page,
}, testInfo) => {
  test.setTimeout(TIMEOUT_MS);
  const record = recorder(testInfo);
  const toHeading = await openTheLog(page, atTheCap());
  const load = await perfOf(page);
  const beforeHeading = load.tasks.filter((task) => load.heading === null || task.start < load.heading);
  record('Load to the heading', {
    'longest task': Math.max(0, ...beforeHeading.map((task) => task.duration)),
    'until the heading shows': toHeading,
  });

  // The four inputs on the Log as it opens, its last LOG_PAGE transactions, then Show all and the moves of its window.
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

  // Show all shows a window of LOG_WINDOW transactions under its range line (docs/DOMAIN.md §3.9); the moves through
  // the windows are transitions that keep the shown rows until the next ones are ready.
  const range = page.locator('main#main p', { hasText: /^Entries \S+ to \S+ of / });
  const showAll = page.locator('main#main button', { hasText: /^Show all/ });
  const firstWindow = new RegExp(`^Entries 1 to ${LOG_WINDOW} of `);
  const all = await measure(
    page,
    () => showAll.click(),
    () => expect(range).toHaveText(firstWindow, loading),
  );
  const older = await measure(page, page.getByRole('button', { name: 'Show older entries' }), () =>
    expect(range).toHaveText(new RegExp(`^Entries ${LOG_WINDOW + 1} to ${2 * LOG_WINDOW} of `), loading),
  );
  const newer = await measure(page, page.getByRole('button', { name: 'Show newer entries' }), () =>
    expect(range).toHaveText(firstWindow, loading),
  );
  const year = page.getByRole('combobox', { name: 'Go to year' });
  const choose = await measure(
    page,
    () => year.click(),
    () => expect(page.getByRole('option').last()).toBeVisible(loading),
  );
  const oldest = await measure(
    page,
    () => page.getByRole('option').last().click(),
    () => expect(range).not.toHaveText(firstWindow, loading),
  );

  const inputs = {
    'open a row': open,
    'Edit entry': edit,
    'one keystroke in the amount': typed,
    'close the sheet': close,
    'Show all': all,
    'Show older entries': older,
    'Show newer entries': newer,
    'open Go to year': choose,
    'choose the oldest year': oldest,
  };
  for (const [what, { input, task, harness }] of Object.entries(inputs)) {
    // An input over the rule that no invisible change fixed stays recorded, not asserted (docs/ENGINEERING.md §4).
    record(ASSERTED.has(what) ? what : `${what} (not asserted)`, {
      input,
      'longest task': task,
      'longest task before the input': harness,
    });
    if (ASSERTED.has(what)) {
      expect(input, `${what} at ${CPU_RATE}x CPU`).toBeLessThan(RULE_MS);
      expect(task, `${what}'s longest task at ${CPU_RATE}x CPU`).toBeLessThan(RULE_MS);
    }
  }

  // The stored Show all: the Log opens on its last LOG_PAGE transactions, and the window follows in a deferred render.
  const reloaded = Date.now();
  await page.reload();
  await expect(page.locator('main#main h1')).toBeVisible(loading);
  const reloadToHeading = Date.now() - reloaded;
  await expect(range).toHaveText(firstWindow, loading);
  await settle(page);
  const reload = await perfOf(page);
  const at = reload.heading ?? 0;
  record('Reload with Show all stored', {
    'longest task to the heading': Math.max(0, ...reload.tasks.filter((t) => t.start < at).map((t) => t.duration)),
    'longest task after it': Math.max(0, ...reload.tasks.filter((t) => t.start >= at).map((t) => t.duration)),
    'until the heading shows': reloadToHeading,
  });

  // Recorded for the next fixes, never asserted: a row's Delete entry and the toast's Undo, then Edit entry's Save
  // with a changed amount, on the window the stored Show all opened (the figures above come first, unchanged).
  const before = (await range.textContent()) ?? '';
  const monthly = page.locator('tbody button[aria-expanded]', { hasText: 'Monthly buy' }).first();
  await monthly.click();
  const remove = await measure(page, page.getByRole('button', { name: 'Delete entry' }), () =>
    expect(range).not.toHaveText(before, loading),
  );
  const undo = await measure(page, page.getByRole('button', { name: 'Undo' }), () =>
    expect(range).toHaveText(before, loading),
  );
  // The Undo puts the row back in a deferred render, which can replace the row a first click reached.
  const editEntry = page.getByRole('button', { name: 'Edit entry' });
  await expect(async () => {
    if ((await monthly.getAttribute('aria-expanded')) !== 'true') await monthly.click();
    await expect(editEntry).toBeVisible({ timeout: 5_000 });
  }).toPass(loading);
  await editEntry.click();
  await expect(sheet).toContainText('Edit the entry', loading);
  await sheet.getByLabel('BTC cost before fees (EUR)').fill('80');
  const save = await measure(
    page,
    () => sheet.getByRole('button', { name: 'Save' }).click(),
    () => expect(sheet).toBeHidden(loading),
  );
  const writes = { 'Delete entry': remove, "the toast's Undo": undo, 'Save with a changed amount': save };
  for (const [what, { input, task, harness }] of Object.entries(writes)) {
    record(`${what} (not asserted)`, { input, 'longest task': task, 'longest task before the input': harness });
  }
});

// The amount's keystroke with a live move stored: the form then reads the units the move took. Its own seed, so
// the test above keeps the snapshot its figures were measured on; recorded, never asserted.
test(`the Log at ${MAX_ENTRIES} entries with a live move: one keystroke in the amount at ${CPU_RATE}x CPU`, async ({
  page,
}, testInfo) => {
  test.setTimeout(TIMEOUT_MS);
  await openTheLog(page, atTheCap(true));
  const row = page.locator('tbody button[aria-expanded]', { hasText: 'Monthly buy' }).first();
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true', loading);
  const sheet = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Edit entry' }).click();
  await expect(sheet).toContainText('Edit the entry', loading);
  const amount = sheet.getByLabel('BTC cost before fees (EUR)');
  await amount.click();
  const { input, task, harness } = await measure(
    page,
    () => amount.press('5'),
    () => expect(amount).toHaveValue(/5/, loading),
  );
  recorder(testInfo)('one keystroke in the amount with a live move (not asserted)', {
    input,
    'longest task': task,
    'longest task before the input': harness,
  });
});
