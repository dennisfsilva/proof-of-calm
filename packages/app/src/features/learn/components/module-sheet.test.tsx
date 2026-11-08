// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { type ComponentProps, Suspense } from 'react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import learn from '../../../messages/en/learn.json';
import { ModuleSheet } from './module-sheet';

// The fixture through the real pipeline, as the hosts' build gives it; loaded here so that a findBy waits
// on React's render of the lazy body, not on Vite's first transform of it.
await preloadLazyModules([
  () => import('virtual:learn-modules').then((modules) => modules.LEARN_BODIES['start-here']?.()),
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
    expect(title.parentElement?.nextElementSibling?.textContent).toMatch(/^Last reviewed 30\sOct\s2026$/u);
    expect(within(dialog).queryByRole('heading', { name: 'Start here' })).toBeNull();
    expect(within(dialog).getByText("The fixture's caveat, in its box.")).toBeDefined();
    expect(within(dialog).getByRole('heading', { level: 2, name: 'A section' })).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDefined();
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
