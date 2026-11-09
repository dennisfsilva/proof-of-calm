import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import type { Snapshot } from '@proofofcalm/app/lib/ports';
import { type FixturePhase, fixtureNowMs, fixtureSnapshot } from '@proofofcalm/app/lib/services/fixtures';
import type { CalendarDate, Entry as PlanEntry } from '@proofofcalm/core';
import { classConflicts } from '@proofofcalm/ui/lib/class-conflicts';
import portugal from '../../../packages/content/jurisdictions/pt.json' with { type: 'json' };
import { seedPlan } from './seed';
import { routeFixturePrices, test } from './support';

// docs/ENGINEERING.md §3: every page on every project of the matrix, in light and dark, with no
// horizontal page scroll, 44 px touch targets, no axe violation, and no animation where motion is
// reduced, and every page matches its reviewed baseline (ADR-0024 Corrections: rendered only in the
// pinned container, skipped where the platform has none). The not-available page is what the proxy
// serves a visitor from the United Kingdom (ADR-0029); the not-found page is what a path that does not
// exist answers, with status 404 (ADR-0045 §1). A `phase` seeds the fixture plan and fixes the
// clock on that phase's date: the buying phase on 20 October 2026, the sell window on 15 March 2030.
// `heading` is the page's own h1, which says its screen has rendered. A `shape` routes the closes of that
// shape (support.ts), so the fall page has a fall of the held coins to show; `holds` is text the screen shows
// once its data has loaded, with the URL still on `path` (the fall page gives way to the module without a fall).
type Shape = Parameters<typeof routeFixturePrices>[2];
type Entry = {
  name: string;
  path: string;
  heading: string;
  country?: string;
  phase?: FixturePhase;
  shape?: Shape;
  holds?: RegExp;
};
const PAGES: readonly Entry[] = [
  { name: 'today', path: '/today', heading: 'Today' },
  { name: 'today-plan', path: '/today', heading: 'Today', phase: 'buy' },
  { name: 'today-sell', path: '/today', heading: 'Today', phase: 'sell' },
  { name: 'portfolio', path: '/portfolio', heading: 'Portfolio' },
  { name: 'portfolio-buy', path: '/portfolio', heading: 'Portfolio', phase: 'buy' },
  { name: 'portfolio-sell', path: '/portfolio', heading: 'Portfolio', phase: 'sell' },
  { name: 'log', path: '/log', heading: 'Log' },
  { name: 'log-buy', path: '/log', heading: 'Log', phase: 'buy' },
  { name: 'plan', path: '/plan', heading: 'Plan' },
  { name: 'plan-buy', path: '/plan', heading: 'Plan', phase: 'buy' },
  { name: 'plan-sell', path: '/plan', heading: 'Plan', phase: 'sell' },
  { name: 'settings', path: '/settings', heading: 'Settings' },
  { name: 'settings-buy', path: '/settings', heading: 'Settings', phase: 'buy' },
  { name: 'learn', path: '/learn', heading: 'Learn' },
  { name: 'learn-start-here', path: '/learn/start-here', heading: 'Start here' },
  { name: 'learn-cycles', path: '/learn/cycles', heading: 'Cycles' },
  { name: 'learn-noise', path: '/learn/noise', heading: 'Noise' },
  { name: 'learn-when-the-market-drops', path: '/learn/when-the-market-drops', heading: 'When the market drops' },
  {
    name: 'learn-fall-under-way',
    path: '/learn/fall-under-way',
    heading: 'The fall under way and your plan',
    phase: 'buy',
    shape: 'week-fall',
    holds: /below (its|their) 90-day high/,
  },
  { name: 'learn-countries', path: '/learn/countries', heading: 'Countries' },
  { name: 'learn-country-pt', path: '/learn/countries/pt', heading: portugal.name },
  { name: 'onboarding', path: '/onboarding', heading: 'Set up a plan' },
  { name: 'offline', path: '/~offline', heading: 'Offline' },
  { name: 'holding', path: '/', heading: 'proof of calm' },
  { name: 'terms', path: '/terms', heading: 'Terms of use' },
  { name: 'privacy', path: '/privacy', heading: 'Privacy notice' },
  { name: 'risk', path: '/risk', heading: 'Risk disclosure' },
  { name: 'cookies', path: '/cookies', heading: 'Cookie-free statement' },
  { name: 'contact', path: '/contact', heading: 'Contact' },
  { name: 'not-available', path: '/', heading: 'Not available in the United Kingdom', country: 'GB' },
  { name: 'not-found', path: '/no-such-page', heading: 'Page not found' },
];
const TARGET = 44;

/**
 * Waits until the entry's screen has rendered: its own h1 visible, and the screen area not busy, which
 * it is while the services start and while a lazy screen's chunk loads behind the route table's empty
 * Suspense fallback (`ScreenPending`). Without it, a check or a screenshot can run on the empty area.
 */
async function screenReady(page: Page, heading: string) {
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  await expect(page.locator('main#main[aria-busy="true"]')).toHaveCount(0);
}

/**
 * Interactive elements smaller than the target, leaving out links inside running text (WCAG 2.5.8) and
 * the hidden inputs Base UI's form controls keep for the form (aria-hidden, out of the tab order and
 * 1 × 1 px; the visible control they mirror is the target, and is measured).
 */
function smallTargets(page: Page, target: number) {
  return page.evaluate((size) => {
    const selector = 'a[href], button, input, select, textarea, summary, [role="button"], [tabindex="0"]';
    const mirror = (element: HTMLElement) => element.getAttribute('aria-hidden') === 'true' && element.tabIndex < 0;
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => !element.closest('p, li, td') && !mirror(element))
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { element: element.outerHTML.slice(0, 80), width: box.width, height: box.height };
      })
      .filter((box) => box.width > 0 && box.height > 0 && (box.width < size || box.height < size));
  }, target);
}

/** Class attributes holding two utilities for one property, which `cn` leaves in place (ADR-0043). */
async function conflictingClasses(page: Page) {
  const classNames = await page.evaluate(() => [
    ...new Set([...document.querySelectorAll('[class]')].map((element) => element.getAttribute('class') ?? '')),
  ]);
  return classNames.flatMap((className) => {
    const losing = classConflicts(className);
    return losing.length === 0 ? [] : [`${className}: ${losing.join(' ')}`];
  });
}

/** The fixture with five more buys, so the Log has 13 transactions and a Show all button (as in log.spec). */
function withMoreBuys(): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries as [PlanEntry];
  const more = ['2026-04-20', '2026-05-25', '2026-07-20', '2026-08-20', '2026-10-12'].map(
    (date, index): PlanEntry => ({
      ...first,
      id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}` as PlanEntry['id'],
      kind: 'extra',
      date: date as CalendarDate,
      amount: '50' as PlanEntry['amount'],
      units: '0.0008' as PlanEntry['units'],
    }),
  );
  return { ...snapshot, entries: [...snapshot.entries, ...more] };
}

// A focus move scrolls its target and its focus ring clear of the fixed tab bar (docs/DESIGN.md §6),
// also at 125 % zoom.
test('the row focused after Show all clears the tab bar', async ({ page }) => {
  await page.clock.setFixedTime(new Date(fixtureNowMs('buy')));
  await seedPlan(page, withMoreBuys());
  await page.goto('/log');
  await expect(page.locator('main#main')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: 'Show all 13 entries' }).click();
  const focused = page.locator('tbody button[aria-expanded]:focus');
  await expect(focused).toContainText('5 Apr 2026');
  const { ringBottom, barTop } = await page.evaluate(() => {
    const bar = document.querySelector('[data-slot="tab-bar"] > .fixed');
    const top = bar === null || bar.getBoundingClientRect().height === 0 ? null : bar.getBoundingClientRect().top;
    // The ring's extent outside the box, from the focus tokens resolved to px by a probe; the computed
    // outline is no witness, as a script focus after a click need not match :focus-visible.
    const probe = document.createElement('div');
    probe.style.width = 'calc(var(--focus-offset) + var(--focus-width))';
    document.body.append(probe);
    const ring = probe.getBoundingClientRect().width;
    probe.remove();
    const bottom = document.activeElement?.getBoundingClientRect().bottom ?? 0;
    return { ringBottom: bottom + ring, barTop: top ?? window.innerHeight };
  });
  // WebKit scrolls in whole pixels while layout is fractional, so the row can land up to 1 px lower than the scroll padding.
  expect(ringBottom, 'the focused row and its focus ring end above the tab bar').toBeLessThan(barTop + 1);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const { name, path, heading, country, phase, shape, holds } of PAGES) {
      // An entry that routes the closes blocks the worker: on WebKit a page the worker controls sends its
      // fetches past the page's routes (support.ts), and the fall page, given the server's closes, turns into
      // the module. The others keep it, as a visitor has it.
      test.describe(() => {
        test.use({ serviceWorkers: shape === undefined ? 'allow' : 'block' });
        test(`${name} fits the viewport, keeps its targets and passes axe`, async ({ page }, testInfo) => {
          if (country !== undefined) await page.setExtraHTTPHeaders({ 'x-vercel-ip-country': country });
          if (phase !== undefined) {
            // The fixture plan on its phase's date: the primary action, its chips, the strip and the banner.
            await page.clock.setFixedTime(new Date(fixtureNowMs(phase)));
            await seedPlan(page, fixtureSnapshot());
          }
          if (shape !== undefined) await routeFixturePrices(page, fixtureNowMs(phase ?? 'buy'), shape);
          await page.goto(path);
          await screenReady(page, heading);
          if (holds !== undefined) {
            await expect(page.getByText(holds)).toBeVisible();
            await expect(page, 'the page stays on its path').toHaveURL((url) => url.pathname === path);
          }
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0);
          expect(await smallTargets(page, TARGET), 'touch targets of at least 44 × 44 px').toEqual([]);
          expect(await conflictingClasses(page), 'no two utilities for one property on an element').toEqual([]);
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();
          expect(axe.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
          if (testInfo.project.name === 'reduced-motion') {
            expect(await page.evaluate(() => document.getAnimations().length), 'no animation').toBe(0);
          }
        });
      });
    }

    // The screenshots hold still: the clock is fixed for every page (on the buying phase's date when the
    // page seeds no plan), /api/prices and the closes come from fixtures with the worker blocked, and the
    // prices line, which names the time of the fetch, is masked.
    test.describe('screenshots', () => {
      test.use({ serviceWorkers: 'block' });

      for (const { name, path, heading, country, phase, shape } of PAGES) {
        test(`${name} matches its reviewed baseline`, async ({ page }, testInfo) => {
          const snapshot = `${name}-${colorScheme}.png`;
          const updating = testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed';
          const baseline = testInfo.snapshotPath(snapshot, { kind: 'screenshot' });
          // biome-ignore lint/suspicious/noSkippedTests: a runtime skip while the platform has no reviewed baseline, not a disabled test
          test.skip(!updating && !existsSync(baseline), 'no reviewed baseline for this platform yet');
          const nowMs = fixtureNowMs(phase ?? 'buy');
          await page.clock.setFixedTime(new Date(nowMs));
          await routeFixturePrices(page, nowMs, shape);
          if (country !== undefined) await page.setExtraHTTPHeaders({ 'x-vercel-ip-country': country });
          if (phase !== undefined) await seedPlan(page, fixtureSnapshot());
          await page.goto(path);
          await screenReady(page, heading);
          // Today's foot waits for the red-day model (docs/DESIGN.md §8); over the rising history it settles on
          // the backup banner or the durability line.
          if (path === '/today' && phase !== undefined)
            await expect(page.getByText(/^Your data lives only/)).toBeVisible();
          await page.evaluate(() => document.fonts.ready.then(() => undefined));
          await expect(page).toHaveScreenshot(snapshot, {
            fullPage: true,
            animations: 'disabled',
            mask: [page.getByText(/^Prices (as of|from) /)],
          });
        });
      }
    });
  });
}
