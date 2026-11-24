// @vitest-environment jsdom
import { UNDO_WINDOW_MS } from '@proofofcalm/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { NavigationProvider, usePathname } from '../../../lib/navigation';
import { ServicesProvider } from '../../../lib/services';
import { createTestServices, preloadLazyModules, recordingPlatform } from '../../../lib/services/testing';
import shell from '../../../messages/en/shell.json';
import { TAXES_MODULE } from '../lib/taxes';
import { WhyLink, type WhyLinkProps } from './why-link';

// Under Vitest each import() is a round trip to the main process: the namespaces answer from memory, and
// the sheet and the body load with this file, so a findBy waits on renders (lib/services/testing-modules.ts).
// `offline` makes the sheet's load fail, as a chunk that does not arrive does; `loads` lists the namespaces asked
// for, in order; `formsOffline` fails the country forms alone.
const network = vi.hoisted(() => ({ offline: false, formsOffline: false, loads: [] as string[] }));

vi.mock('../../../lib/i18n/namespaces', async (original) => {
  const { namespacesInMemory } = await import('../../../lib/services/testing-modules');
  const namespaces = await namespacesInMemory(await original<typeof import('../../../lib/i18n/namespaces')>());
  const { learn, countries } = namespaces.NAMESPACE_LOADERS.en;
  const counted =
    <T,>(name: string, load: () => Promise<T>) =>
    () => {
      network.loads.push(name);
      const offline = network.offline || (name === 'countries' && network.formsOffline);
      return offline ? Promise.reject(new Error('Failed to fetch')) : load();
    };
  return {
    ...namespaces,
    NAMESPACE_LOADERS: {
      ...namespaces.NAMESPACE_LOADERS,
      en: {
        ...namespaces.NAMESPACE_LOADERS.en,
        learn: counted('learn', learn),
        countries: counted('countries', countries),
      },
    },
  };
});

await preloadLazyModules([
  () => import('./module-sheet'),
  () =>
    import('virtual:learn-modules').then((modules) =>
      Promise.all(['start-here', TAXES_MODULE].map((slug) => modules.LEARN_BODIES[slug]?.())),
    ),
]);

afterEach(cleanup);

const NAME = 'Why? The hold phase';
const IDEA = "The fixture's one idea, for the tests and the stories.";

const Path = () => <output data-testid="path">{usePathname()}</output>;

const mount = (standalone = false, Link = WhyLink, services = createTestServices()) =>
  render(
    <NavigationProvider location="memory" initialPath="/today">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ shell }}>
          <Link standalone={standalone} module="start-here" section="a-section" name={NAME} />
          <Path />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );

/**
 * The link over a sheet that cannot load. React keeps a rejected `lazy` as long as its module lives, so these
 * tests take a copy of the module, by a query, and the others keep the one that loads.
 */
async function offline() {
  const path = './why-link?offline';
  const { WhyLink: Link } = (await import(/* @vite-ignore */ path)) as typeof import('./why-link');
  network.offline = true;
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  onTestFinished(() => {
    network.offline = false;
    logged.mockRestore();
  });
  const platform = recordingPlatform();
  const services = createTestServices({ platform });
  const toast = vi.spyOn(services.toasts, 'add');
  mount(false, Link, services);
  return { link: screen.getByRole('button', { name: NAME }), toast, platform };
}

/** Presses the link of `module` in a copy of this module taken by `tag`, its `lazy` unloaded, with `loads` cleared. */
async function pressFresh(module: WhyLinkProps['module'], tag: string) {
  const path = `./why-link?${tag}`;
  const { WhyLink: Link } = (await import(/* @vite-ignore */ path)) as typeof import('./why-link');
  const services = createTestServices();
  await services.start();
  const toast = vi.spyOn(services.toasts, 'add');
  network.loads = [];
  render(
    <NavigationProvider location="memory" initialPath="/today">
      <ServicesProvider services={services}>
        <I18nProvider messages={{ shell }}>
          <Link module={module} name={NAME} />
        </I18nProvider>
      </ServicesProvider>
    </NavigationProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: NAME }));
  return { toast };
}

describe('WhyLink', () => {
  // jsdom has no layout: the classes here, the 44 px in the Standalone and OpenEndedHold stories.
  it('standalone holds the 44 px target both ways, and inside a sentence neither', () => {
    const { unmount } = mount();
    const inline = screen.getByRole('button', { name: NAME }).classList;
    expect([inline.contains('min-h-target'), inline.contains('min-w-target')]).toEqual([false, false]);
    unmount();
    mount(true);
    const standalone = screen.getByRole('button', { name: NAME }).classList;
    expect([standalone.contains('min-h-target'), standalone.contains('min-w-target')]).toEqual([true, true]);
  });

  it("opens the module's sheet and the route stays", async () => {
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: NAME }));
    expect(await screen.findByRole('dialog', { name: IDEA })).toBeDefined();
    expect(screen.getByTestId('path').textContent).toBe('/today');
  });

  it('closing gives the focus back to the link', async () => {
    mount();
    const link = screen.getByRole('button', { name: NAME });
    link.focus();
    fireEvent.click(link);
    const heading = await screen.findByRole('heading', { level: 2, name: 'A section' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  // Safari does not focus a button on press, so the sheet opens with the focus on body, which Base UI skips.
  it('a press that did not focus the link still gets the focus back on close', async () => {
    mount();
    const link = screen.getByRole('button', { name: NAME });
    fireEvent.click(link);
    const heading = await screen.findByRole('heading', { level: 2, name: 'A section' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it('a sheet that cannot load leaves the link and says so', async () => {
    const { link, toast } = await offline();
    fireEvent.click(link);
    await waitFor(() => expect(toast).toHaveBeenCalledOnce());
    expect(toast).toHaveBeenCalledWith({
      title: 'This explanation could not be loaded. Check your connection, then reload the page.',
      timeout: UNDO_WINDOW_MS,
      actionProps: { children: 'Reload', onClick: expect.any(Function) },
    });
    expect(screen.getByRole('button', { name: NAME })).toBe(link);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('path').textContent).toBe('/today');
  });

  it("the toast's Reload reloads, since an installed app has no browser reload", async () => {
    const { link, toast, platform } = await offline();
    fireEvent.click(link);
    await waitFor(() => expect(toast).toHaveBeenCalledOnce());
    expect(platform.calls.reloads).toBe(0);
    toast.mock.calls[0]?.[0].actionProps?.onClick(() => undefined);
    expect(platform.calls.reloads).toBe(1);
  });

  it('words the fix as the screen error does', () => {
    expect(shell.why.failed.endsWith(` ${shell.screenError.line}`)).toBe(true);
  });

  it('a second press says so again', async () => {
    const { link, toast } = await offline();
    fireEvent.click(link);
    await waitFor(() => expect(toast).toHaveBeenCalledOnce());
    fireEvent.click(link);
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: NAME })).toBe(link);
  });

  it("is named by its host's text, the visible word first", () => {
    mount();
    const link = screen.getByRole('button', { name: NAME });
    expect(link.textContent).toBe('Why?');
    expect(NAME.startsWith(link.textContent ?? '')).toBe(true);
  });

  // Only the tax module's sheet renders the plan's country card, the one reader of the country forms (ADR-0045 §8:
  // a screen loads only the namespaces it reads). A copy of the module each, so its `lazy` loads afresh.
  it.each([
    ['start-here', ['learn']],
    [TAXES_MODULE, ['learn', 'countries']],
  ] as const)('the sheet of %s loads %j', async (module, expected) => {
    await pressFresh(module, `loads-${module}`);
    await screen.findByRole('dialog');
    expect(network.loads.toSorted()).toEqual(expected.toSorted());
  });

  it('country forms that cannot load leave every other sheet as it was', async () => {
    network.formsOffline = true;
    onTestFinished(() => {
      network.formsOffline = false;
    });
    const { toast } = await pressFresh('start-here', 'forms-offline');
    expect(await screen.findByRole('dialog', { name: IDEA })).toBeDefined();
    expect(toast).not.toHaveBeenCalled();
  });

  it('stands as a touch target of its own only when asked', () => {
    const { unmount } = mount();
    expect(screen.getByRole('button', { name: NAME }).className).not.toContain('min-h-target');
    unmount();
    mount(true);
    expect(screen.getByRole('button', { name: NAME }).className).toContain('min-h-target');
  });
});
