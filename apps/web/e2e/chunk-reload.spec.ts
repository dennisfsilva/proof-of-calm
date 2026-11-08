import { expect, type Page, type Route } from '@playwright/test';
import { test } from './support';

// The reload on a failed chunk (ADR-0045 §3 and its Deviations entry of 2026-10-22): Vite's
// `vite:preloadError` reloads the page only when the entry the page runs is gone from the server, a new
// deployment. A chunk that failed while this build is still deployed, or that the browser cancelled
// because the page was leaving (WebKit cancels a leaving document's loads), keeps the page and the
// navigation the person started. A screen whose chunk still fails shows the shell's error state with
// Reload inside the header and the tab bar (the boundary in packages/app's route table).

test.use({ serviceWorkers: 'block' });

const ready = (page: Page) => expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
const isScript = (url: string) => /^\/assets\/[^/]+\.js$/.test(new URL(url).pathname);

/** The main frame's navigation requests from now on, as paths. */
function recordNavigations(page: Page) {
  const paths: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      paths.push(new URL(request.url()).pathname);
    }
  });
  return paths;
}

/** Dispatches the event Vite's preload helper sends, after `evaluate` returns, as a failed import would. */
const failChunk = (page: Page) =>
  page.evaluate(() => {
    setTimeout(() => window.dispatchEvent(new Event('vite:preloadError', { cancelable: true })), 0);
  });

/** Waits in the page, so a reload the handler would start has the time to start. */
const pause = (page: Page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));

test('a failed chunk while this build is still deployed keeps the page', async ({ page }) => {
  await page.goto('/today');
  await ready(page);
  const navigations = recordNavigations(page);

  const head = page.waitForRequest(
    (request) => request.method() === 'HEAD' && new URL(request.url()).pathname.startsWith('/assets/'),
  );
  await failChunk(page);
  await (await head).response();
  await pause(page);
  expect(navigations).toEqual([]);
});

test('a build that is gone reloads once', async ({ page }) => {
  await page.goto('/today');
  await ready(page);
  const navigations = recordNavigations(page);
  await page.route('**/assets/*.js', (route) =>
    route.request().method() === 'HEAD' ? route.fulfill({ status: 404 }) : route.continue(),
  );

  await failChunk(page);
  await expect.poll(() => navigations).toEqual(['/today']);
  await ready(page);
  await failChunk(page);
  await pause(page);
  expect(navigations).toEqual(['/today']);
});

test('leaving while a screen loads goes where the person went', async ({ page }) => {
  const requested = new Set<string>();
  page.on('request', (request) => {
    if (isScript(request.url())) requested.add(request.url());
  });
  await page.goto('/onboarding');
  await ready(page);

  // The scripts Onboarding loaded pass; Plan's lazy chunks are held, never answered, until the page leaves.
  const loaded = new Set(requested);
  const held: Route[] = [];
  let holding = true;
  await page.route('**/assets/*.js', (route) => {
    if (!holding || loaded.has(route.request().url())) return route.continue();
    held.push(route);
    return undefined;
  });

  await page.goto('/plan', { waitUntil: 'commit' });
  await expect.poll(() => held.length).toBeGreaterThan(0);
  holding = false;
  await page.goto('/today');
  await expect(page).toHaveURL(/\/today$/);
  await ready(page);
});

test('a screen whose chunk fails shows the error state in the shell, and Reload brings it back', async ({ page }) => {
  const requested = new Set<string>();
  page.on('request', (request) => {
    if (isScript(request.url())) requested.add(request.url());
  });
  await page.goto('/today');
  await ready(page);

  // Every script Today did not load fails, as a chunk the network cannot fetch; the HEAD of the entry
  // still reaches the server and answers 200, so the build is still deployed and nothing reloads.
  const loaded = new Set(requested);
  await page.route('**/assets/*.js', (route) =>
    route.request().method() === 'GET' && !loaded.has(route.request().url()) ? route.abort() : route.continue(),
  );
  const head = page.waitForResponse((response) => response.request().method() === 'HEAD' && isScript(response.url()));
  const navigations = recordNavigations(page);
  await page.getByRole('link', { name: 'Portfolio' }).click();
  expect((await head).status()).toBe(200);

  const heading = page.getByRole('heading', { level: 1, name: 'This screen could not be loaded.' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole('link', { name: 'Proof of Calm' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Portfolio' })).toHaveAttribute('aria-current', 'page');
  await pause(page);
  expect(navigations).toEqual([]);

  await page.unroute('**/assets/*.js');
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();
  await expect(heading).toBeHidden();
});
