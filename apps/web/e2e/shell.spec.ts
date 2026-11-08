import { expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import { APPEARANCE_STORAGE_KEY } from '@proofofcalm/app/lib/theme';
import { seedPlan } from './seed';
import { test } from './support';

// The app shell on the viewport matrix (ADR-0045 §9, §3; docs/DESIGN.md §7): the tab bar below 48rem
// and the top navigation from there, the destinations and the gear through the router, the screen
// area busy only until the services have started, one `main` with the skip link before it, the
// appearance mirror honoured before hydration and the store's value after it, and the plan seed.

/** True where the top navigation shows instead of the tab bar: 48rem of the root font size, as the breakpoint. */
const wide = (page: Page) =>
  page.evaluate(() => {
    const rootPx = Number(getComputedStyle(document.documentElement).fontSize.replace('px', ''));
    return window.innerWidth >= 48 * rootPx;
  });

const screenArea = (page: Page) => page.locator('main#main');

test('shows the tab bar below 48rem and the top navigation from there', async ({ page }) => {
  await page.goto('/today');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  const topNav = page.locator('[data-slot="top-nav"]');
  const tabBar = page.locator('[data-slot="tab-bar"] nav');
  if (await wide(page)) {
    await expect(topNav).toBeVisible();
    await expect(tabBar).toBeHidden();
  } else {
    await expect(tabBar).toBeVisible();
    await expect(topNav).toBeHidden();
  }
});

test('the destinations, the gear and the wordmark navigate through the router', async ({ page }) => {
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('link', { name: 'Log' }).click();
  await expect(page).toHaveURL(/\/log$/);
  await expect(page.getByRole('heading', { name: 'Log' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'Proof of Calm' }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
});

test('the screen area is busy only until the services have started', async ({ page }) => {
  await page.goto('/today');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('the appearance mirror sets the theme before hydration, and the store sets it after', async ({
  page,
  request,
}) => {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: 'dark', motion: 'system' })] as const,
  );
  // Without the entry script the document stays as the before-paint script left it. Only the entry
  // is blocked: WebKit does not fetch again, on the next load of the page, a modulepreloaded chunk
  // it was blocked from loading, so blocking every chunk would leave the hydrated half without them.
  const entry = /\bdata-entry="(\/assets\/[^"]+)"/.exec(await (await request.get('/today')).text())?.[1];
  expect(entry, 'the boot script names the entry module').toBeTruthy();
  const isEntry = (url: URL) => url.pathname === entry;
  await page.route(isEntry, (route) => route.abort());
  await page.goto('/today');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.unroute(isEntry);

  // Hydrated, the store's prefs (system, on a fresh device) win and rewrite the mirror.
  await page.goto('/today');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  const mirror = await page.evaluate((key) => window.localStorage.getItem(key), APPEARANCE_STORAGE_KEY);
  expect(JSON.parse(mirror ?? '{}')).toEqual({ theme: 'system', motion: 'system' });
});

test('every screen has one main, while navigating as well', async ({ page }) => {
  // The most `main` elements the document ever held, sampled after every DOM change from the first parse.
  await page.addInitScript(() => {
    const record = () => {
      const seen = document.querySelectorAll('main').length;
      const held = Number(document.documentElement.dataset.mostMains ?? '0');
      if (seen > held) document.documentElement.dataset.mostMains = String(seen);
    };
    new MutationObserver(record).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  for (const name of ['Portfolio', 'Log', 'Learn', 'Settings', 'Today']) {
    await page.getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);
  }
  await expect(page.locator('html')).toHaveAttribute('data-most-mains', '1');
  for (const [path, name] of [
    ['/plan', 'Plan'],
    ['/onboarding', 'Set up a plan'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('data-most-mains', '1');
  }
});

// Playwright's WebKit on Windows never tabs to a link (on 2026-10-27, WebKit 27.2: Tab and Alt+Tab both
// pass over an `<a href>` to the next field), a setting of that build no Safari user meets; the Tab step
// runs on every other engine and platform, the Linux WebKit of CI included.
const tabsToLinks = (browserName: string) => !(browserName === 'webkit' && process.platform === 'win32');

test('Tab from a fresh load reaches the skip link first, and Enter moves focus to main', async ({
  page,
  browserName,
}) => {
  await page.goto('/today');
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  // Out of view until focused, at its full size all the time (the matrix measures every link's box).
  await expect(skip).not.toBeInViewport();
  if (tabsToLinks(browserName)) {
    await page.keyboard.press('Tab');
  } else {
    test.info().annotations.push({ type: 'not run', description: 'Tab to a link: WebKit on Windows skips links' });
    await skip.focus();
  }
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport({ ratio: 1 });
  const box = await skip.boundingBox();
  expect(box?.width, 'the focused skip link is a 44 px target').toBeGreaterThanOrEqual(44);
  expect(box?.height, 'the focused skip link is a 44 px target').toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect(screenArea(page)).toBeFocused();
  await expect(page).toHaveURL(/\/today$/);
});

// DESIGN §6 "Focus on a route change": a history traversal is a change of pathname too, so the focus lands
// on the screen's h1 at the top, not where the browser would restore the scroll.
test("after the browser's Back from Plan, Today's focused h1 is inside the viewport", async ({ page }) => {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixtureSnapshot());
  await page.getByRole('link', { name: 'Your plan' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  const heading = page.getByRole('heading', { level: 1, name: 'Today' });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport({ ratio: 1 });
});

test('a seeded plan opens the app on its fixed date', async ({ page }) => {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, fixtureSnapshot());
  await page.goto('/log');
  await expect(page.getByRole('heading', { level: 1, name: 'Log' })).toBeVisible();
  await expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('heading', { name: 'Your data could not be opened.' })).toHaveCount(0);
  // The store read every row and set none aside (a row that fails its schema moves to meta's list).
  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('proof-of-calm');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (store: string, run: (store: IDBObjectStore) => IDBRequest) =>
      new Promise<unknown>((resolve, reject) => {
        const request = run(database.transaction(store).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const counts = [await read('plans', (s) => s.count()), await read('entries', (s) => s.count())];
    const corrupt = await read('meta', (s) => s.get('corrupt'));
    database.close();
    return { counts, corrupt: Array.isArray(corrupt) ? corrupt.length : 0 };
  });
  expect(stored).toEqual({ counts: [1, fixtureSnapshot().entries.length], corrupt: 0 });
});
