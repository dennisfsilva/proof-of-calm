import { type Browser, expect, type Page } from '@playwright/test';
import { fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import shell from '../../../packages/app/src/messages/en/shell.json' with { type: 'json' };
import today from '../../../packages/app/src/messages/en/today.json' with { type: 'json' };
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// A dynamic import that fails while this build is still deployed (offline, a failed request) rejects with its own
// error and each site reaches its fallback (ADR-0045, the Deviations of 2026-10-22 and 2026-11-16): the chunk
// reload checks the entry and leaves the event's default, so Vite's preload helper throws the import's error
// instead of resolving to `undefined`. Each case finds its chunks by recording what the action requests in a probe
// context (hashed names change with every build), then aborts them in the test's page before the seed, with the
// entry's HEAD reaching the server (200, no reload). Vitest has no preload helper, so only the built app shows
// this. pt-PT's profile-overlay and rules chunks are language.spec.ts's ("when the language's rules chunk cannot
// load") and templates-language.spec.ts's; `bootLanguage`'s static chunks are language.spec.ts's too.

test.use({ serviceWorkers: 'block' });

const NOW_MS = fixtureNowMs('buy');
/** A property read of the `undefined` a prevented preload error resolves to, in Chromium's and WebKit's words. */
const UNDEFINED_READ = /Cannot read properties of undefined|undefined is not an object/;
/** The `defaultPrevented` of every `vite:preloadError`, read once every listener has run. */
const PREVENTED = '__importFailurePrevented';

const screenArea = (page: Page) => page.locator('main#main');
const ready = (page: Page) => expect(screenArea(page)).not.toHaveAttribute('aria-busy', 'true');
const isScript = (url: string) => /^\/assets\/.+\.js$/.test(new URL(url).pathname);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });

/** Today with the fixture plan on its late October buy, prices and a year of history of `shape` answered here. */
async function seededToday(page: Page, shape: 'rise' | 'week-fall' = 'rise') {
  await page.clock.setFixedTime(new Date(NOW_MS));
  await routeFixturePrices(page, NOW_MS, shape);
  await seedPlan(page, fixtureSnapshot());
}

/**
 * The scripts `act` requests first, after `prepare`, in a context of its own with the HTTP cache off (any route
 * turns it off), so the action's scripts reach the network as they do in the test's page.
 */
async function chunksOf(
  browser: Browser,
  baseURL: string | undefined,
  prepare: (page: Page) => Promise<void>,
  act: (page: Page) => Promise<void>,
): Promise<string[]> {
  const context = await browser.newContext({ ...(baseURL === undefined ? {} : { baseURL }), serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.route('**/assets/**', (route) => route.continue());
    // WebKit asks for the entry again on a dynamic import: only a script the document `prepare` ends on never asked
    // for is the action's.
    const before = new Set<string>();
    const urls = new Set<string>();
    let acting = false;
    page.on('framenavigated', (frame) => {
      if (!acting && frame === page.mainFrame()) before.clear();
    });
    page.on('request', (request) => {
      if (request.method() !== 'GET' || !isScript(request.url())) return;
      if (!acting) before.add(request.url());
      else if (!before.has(request.url())) urls.add(request.url());
    });
    await prepare(page);
    acting = true;
    await act(page);
    expect(urls.size).toBeGreaterThan(0);
    return [...urls];
  } finally {
    await context.close();
  }
}

/**
 * Aborts a GET of each of `urls` in `page`, records the errors a property read of `undefined` would print, and
 * every preload error's `defaultPrevented`. Called before the page's first navigation.
 */
async function failChunks(page: Page, urls: readonly string[]) {
  const failing = new Set(urls);
  const aborted: string[] = [];
  await page.route('**/assets/**', (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || !failing.has(request.url())) return route.continue();
    aborted.push(request.url());
    return route.abort('internetdisconnected');
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // Registered before the app's handler; the timeout reads the event once every listener ran.
  await page.addInitScript((key) => {
    const seen: boolean[] = [];
    Object.assign(window, { [key]: seen });
    window.addEventListener('vite:preloadError', (event) => {
      setTimeout(() => seen.push(event.defaultPrevented), 0);
    });
  }, PREVENTED);
  return {
    /** The chunks were requested and failed, no site read a property of `undefined`, and each import rejected. */
    async settled() {
      expect(aborted.length).toBeGreaterThan(0);
      expect(errors.filter((error) => UNDEFINED_READ.test(error))).toEqual([]);
      const prevented = await page.evaluate((key) => (window as unknown as Record<string, boolean[]>)[key], PREVENTED);
      expect(prevented.length).toBeGreaterThan(0);
      expect(prevented).not.toContain(true);
    },
  };
}

test("a lazy screen's chunk: the screen's error state with Reload, inside the header and the tab bar", async ({
  page,
  browser,
  baseURL,
}) => {
  const chunks = await chunksOf(
    browser,
    baseURL,
    async (probe) => {
      await probe.goto('/today');
      await ready(probe);
    },
    async (probe) => {
      await tab(probe, 'Log').click();
      await expect(probe.getByRole('heading', { level: 1, name: 'Log' })).toBeVisible();
    },
  );
  const failure = await failChunks(page, chunks);
  const head = page.waitForResponse((response) => response.request().method() === 'HEAD' && isScript(response.url()));
  await page.goto('/today');
  await ready(page);
  await tab(page, 'Log').click();

  expect((await head).status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'This screen could not be loaded.' })).toBeVisible();
  await expect(page.getByRole('button', { name: shell.screenError.reload })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Proof of Calm' })).toBeVisible();
  await expect(tab(page, 'Log')).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/\/log$/);
  await failure.settled();
});

test("a lazy namespace alone: Today's one tap says the purchase is recorded in Today's words and keeps Today", async ({
  page,
  browser,
  baseURL,
}) => {
  const asPlanned = (target: Page) => target.getByRole('button', { name: today.action.asPlanned });
  const chunks = await chunksOf(browser, baseURL, seededToday, async (probe) => {
    await asPlanned(probe).click();
    await expect(probe.getByRole('button', { name: 'Edit' })).toBeVisible();
  });
  const failure = await failChunks(page, chunks);
  await seededToday(page);
  await asPlanned(page).click();

  await expect(page.getByText(today.action.recorded, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: today.title })).toBeVisible();
  await failure.settled();
});

test("WhyLink's sheet chunk: the toast says the explanation could not load and the screen stays", async ({
  page,
  browser,
  baseURL,
}) => {
  const why = (target: Page) => target.getByRole('button', { name: 'Why? The 3 parts', exact: true });
  const onPlan = async (target: Page) => {
    await seededToday(target);
    await target.goto('/plan');
    await expect(why(target)).toBeVisible();
  };
  const chunks = await chunksOf(browser, baseURL, onPlan, async (probe) => {
    await why(probe).click();
    await expect(probe.getByRole('dialog')).toBeVisible();
  });
  const failure = await failChunks(page, chunks);
  await onPlan(page);
  await why(page).click();

  await expect(page.getByText(shell.why.failed)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(why(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
  await failure.settled();
});

test("the red-day model's chunk: no banner, and Today's foot settles on the next one", async ({
  page,
  browser,
  baseURL,
}) => {
  // Log never asks the model, so going back to Today asks it in a fresh document.
  const chunks = await chunksOf(
    browser,
    baseURL,
    async (probe) => {
      await seededToday(probe, 'week-fall');
      await probe.goto('/log');
      await ready(probe);
    },
    async (probe) => {
      await tab(probe, 'Today').click();
      await expect(probe.getByText(/ fell \d+% in the 7 days to /u)).toBeVisible();
    },
  );
  const failure = await failChunks(page, chunks);
  await seededToday(page, 'week-fall');
  await ready(page);

  await expect(page.getByText(/^Your data lives only/u)).toBeVisible();
  await expect(page.getByText(/ fell \d+% in the 7 days to /u)).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: today.title })).toBeVisible();
  await failure.settled();
});

test("a Learn module's body chunk: the screen's error state inside the shell", async ({ page, browser, baseURL }) => {
  const chunks = await chunksOf(
    browser,
    baseURL,
    async (probe) => {
      await probe.goto('/learn');
      await ready(probe);
    },
    async (probe) => {
      // wouter follows the history API, so this is a navigation inside the document, as a link's.
      await probe.evaluate(() => {
        window.history.pushState(null, '', '/learn/risk-honestly');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await expect(probe.getByRole('link', { name: 'Back to Learn' })).toBeVisible();
      await ready(probe);
    },
  );
  const failure = await failChunks(page, chunks);
  await page.goto('/learn/risk-honestly');

  await expect(page.getByRole('heading', { level: 1, name: 'This screen could not be loaded.' })).toBeVisible();
  await expect(tab(page, 'Learn')).toHaveAttribute('aria-current', 'page');
  await failure.settled();
});
