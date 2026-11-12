// @vitest-environment jsdom

import type { Plan } from '@proofofcalm/core';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { Component, type ComponentProps, type ReactNode, Suspense } from 'react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { fixtureSnapshot } from '../../../lib/services/fixtures';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import shell from '../../../messages/en/shell.json';
import { TAXES_MODULE, YOUR_COUNTRY } from '../lib/taxes';
import { ModuleSheet } from './module-sheet';

// The second fixture as a module with a chart whose idea and caveat write `N %` with an ordinary space and with a
// no-break one, as real ones do (docs/CONTENT-STYLE.md §4); its body holds no `<Chart />`, so nothing is drawn.
const { CHARTED } = vi.hoisted(() => ({ CHARTED: 'Falls of 80 % came back, and so did falls of 94\u00a0%.' }));
vi.mock('virtual:learn-modules', async (original) => {
  const modules = await original<typeof import('virtual:learn-modules')>();
  return {
    ...modules,
    LEARN_MODULES: modules.LEARN_MODULES.map((module) =>
      module.slug === 'when-the-market-drops'
        ? { ...module, chart: 'drawdowns-bar', idea: CHARTED, caveat: CHARTED }
        : module,
    ),
  };
});

// The fixtures through the real pipeline, as the hosts' build gives them; loaded here so that a findBy waits
// on React's render of the lazy body, not on Vite's first transform of it.
await preloadLazyModules([
  () =>
    import('virtual:learn-modules').then((modules) =>
      Promise.all(['start-here', 'when-the-market-drops', TAXES_MODULE].map((slug) => modules.LEARN_BODIES[slug]?.())),
    ),
]);

afterEach(cleanup);

const IDEA = "The fixture's one idea, for the tests and the stories.";

const tree = (props: Partial<ComponentProps<typeof ModuleSheet>> = {}) => (
  <ServicesProvider services={createTestServices()}>
    <I18nProvider messages={{ learn }}>
      <Suspense fallback={null}>
        <ModuleSheet slug="start-here" open onOpenChange={vi.fn()} {...props} />
      </Suspense>
    </I18nProvider>
  </ServicesProvider>
);

const mount = (props?: Partial<ComponentProps<typeof ModuleSheet>>) => render(tree(props));

describe('ModuleSheet', () => {
  it("the sheet's title is the module's idea, with the last-reviewed line under it", async () => {
    mount();
    const dialog = await screen.findByRole('dialog', { name: IDEA });
    const title = within(dialog).getByRole('heading', { name: IDEA });
    expect(title.nextElementSibling?.textContent).toMatch(/^Last reviewed 30\sOct\s2026$/u);
    expect(within(dialog).queryByRole('heading', { name: 'Start here' })).toBeNull();
    expect(within(dialog).getByText("The fixture's caveat, in its box.")).toBeDefined();
    expect(within(dialog).getByRole('heading', { level: 2, name: 'A section' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDefined();
  });

  it("a module with a chart joins its idea's `N %` with the page's joiner, as its caveat and the route's title do", async () => {
    mount({ slug: 'when-the-market-drops' });
    const dialog = await screen.findByRole('dialog');
    const caveat = dialog.querySelector('[data-slot="card"]')?.textContent ?? '';
    expect(caveat).toBe('Falls of 80% came back, and so did falls of 94%.');
    expect(dialog.querySelector('[data-slot="sheet-title"]')?.textContent).toBe(caveat);
    expect(screen.getByRole('dialog', { name: caveat })).toBe(dialog);
  });

  it('with a section the focus lands on that heading', async () => {
    mount({ section: 'a-section' });
    const heading = await screen.findByRole('heading', { level: 2, name: 'A section' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("a section the module does not have leaves the focus to the default, the sheet's first tab stop", async () => {
    mount({ section: 'no-such-section' });
    const dialog = await screen.findByRole('dialog', { name: IDEA });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    await waitFor(() => expect(document.activeElement).toBe(close));
  });

  it("with no section the focus lands on Close, the popup's first child", async () => {
    mount();
    const dialog = await screen.findByRole('dialog', { name: IDEA });
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(dialog.firstElementChild?.contains(close)).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(close));
  });

  it('closing moves the focus to the control the host names', async () => {
    const opener = document.body.appendChild(document.createElement('button'));
    onTestFinished(() => opener.remove());
    const props = { finalFocus: { current: opener } };
    const { rerender } = mount(props);
    await screen.findByRole('dialog', { name: IDEA });
    rerender(tree({ ...props, open: false }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('an unknown slug renders nothing', async () => {
    mount({ slug: 'not-a-module' as ComponentProps<typeof ModuleSheet>['slug'] });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.textContent).toBe('');
  });
});

/** Stands for WhyLink's boundary, which shows its toast in place of the sheet. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError = () => ({ failed: true });
  override render = () => (this.state.failed ? <p>The boundary</p> : this.props.children);
}

// The tax module leads with the card of the rules the plan's country runs on (docs/EDUCATION.md §4); the sheet shows
// the card and no list of countries.
describe('ModuleSheet: the tax module', () => {
  type Options = Parameters<typeof createTestServices>[0];
  const sheetAt = async (
    country: string | null,
    props: Partial<ComponentProps<typeof ModuleSheet>> = {},
    options: Options = {},
  ) => {
    const snapshot = fixtureSnapshot();
    const services = createTestServices({
      snapshot:
        country === null
          ? { ...snapshot, plan: null, entries: [] }
          : { ...snapshot, plan: { ...(snapshot.plan as Plan), country: country as Plan['country'] } },
      ...options,
    });
    await services.start();
    // In an awaited act, so React retries the sheet that suspended on the profile once it is in.
    await act(async () => {
      render(
        <ServicesProvider services={services}>
          <I18nProvider messages={{ learn, shell }}>
            <Boundary>
              <Suspense fallback={null}>
                <ModuleSheet slug={TAXES_MODULE} open onOpenChange={vi.fn()} {...props} />
              </Suspense>
            </Boundary>
          </I18nProvider>
        </ServicesProvider>,
      );
    });
  };

  it("a plan in Portugal leads with Portugal's card at level 2, and no list", async () => {
    await sheetAt('PT');
    const dialog = await screen.findByRole('dialog');
    const card = within(dialog).getByRole('heading', { level: 2, name: 'Portugal' });
    expect(card.id).toBe(YOUR_COUNTRY);
    // Above the text: the card comes before the body's first paragraph.
    const body = within(dialog).getByText(/^A rate of 28/);
    expect(card.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).queryByText('Other countries')).toBeNull();
    expect(within(dialog).queryByText('Countries')).toBeNull();
  });

  it("with the section your-country the focus lands on the card's heading", async () => {
    await sheetAt('PT', { section: YOUR_COUNTRY });
    const card = await screen.findByRole('heading', { level: 2, name: 'Portugal' });
    await waitFor(() => expect(document.activeElement).toBe(card));
  });

  it.each(['XX', 'BR'])('a plan on %s leads with the generic card, its date line the general profile', async (code) => {
    await sheetAt(code);
    const card = await screen.findByRole('heading', { level: 2, name: 'Other country' });
    expect(card.id).toBe(YOUR_COUNTRY);
    expect(card.closest('article')?.lastElementChild?.textContent).toMatch(/^Reviewed on .+: the general profile/);
  });

  it('with no plan there is no card, and the focus stays on Close', async () => {
    await sheetAt(null, { section: YOUR_COUNTRY });
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/^A rate of 28/);
    expect(dialog.querySelector(`[id="${YOUR_COUNTRY}"]`)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close' })));
  });

  it('another module shows no card under a plan', async () => {
    await sheetAt('PT', { slug: 'start-here' });
    await screen.findByRole('dialog', { name: IDEA });
    expect(screen.queryByRole('heading', { name: 'Portugal' })).toBeNull();
  });

  it("a profile that fails to load fails the sheet to the host's boundary; the text never shows alone", async () => {
    const countries = createTestServices().countries;
    // React reports the error the boundary caught; the test reads the boundary instead.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    onTestFinished(() => {
      vi.restoreAllMocks();
    });
    await sheetAt(
      'PT',
      {},
      {
        nowMs: Date.parse('2026-12-03T10:00:00Z'),
        countries: { ...countries, planCard: () => Promise.reject(new Error('offline')) },
      },
    );
    await screen.findByText('The boundary');
    expect(screen.queryByText(/^A rate of 28/)).toBeNull();
  });
});
