// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, Suspense, startTransition } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../lib/i18n';
import { ServicesProvider, useServices } from '../../../lib/services';
import { createTestServices, preloadLazyModules } from '../../../lib/services/testing';
import learnPt from '../../../messages/pt-PT/learn.json';
import { ModuleSheet } from '../components/module-sheet';
import { ModuleView } from '../components/module-view';
import { useModuleBody } from './bodies';

// A translated module (ADR-0057, ADR-0048 Deviations): its metadata and body come from its own chunk; English stands
// for a slug without one, and for a chunk that fails or resolves to nothing, and the next mount tries again.
const { translation } = vi.hoisted(() => ({ translation: { load: (): Promise<unknown> => Promise.resolve() } }));
vi.mock('virtual:learn-modules', async (original) => {
  const modules = await original<typeof import('virtual:learn-modules')>();
  // One slug per case: a translation that loaded stays kept for the file's later tests. The fixture folder holds four
  // modules, so the retry cases take copies of start-here under slugs of their own.
  const load = () => translation.load();
  const base = modules.LEARN_MODULES.find((module) => module.slug === 'start-here');
  const body = modules.LEARN_BODIES['start-here'];
  if (base === undefined || body === undefined) throw new Error('the start-here fixture is missing');
  const copies = ['strict-retry', 'left-retry'];
  const slugs = ['start-here', 'risk-honestly', 'taxes-where-you-live', ...copies];
  return {
    ...modules,
    LEARN_MODULES: [...modules.LEARN_MODULES, ...copies.map((slug) => ({ ...base, slug }))],
    LEARN_BODIES: { ...modules.LEARN_BODIES, ...Object.fromEntries(copies.map((slug) => [slug, body])) },
    LEARN_TRANSLATIONS: { 'pt-PT': Object.fromEntries(slugs.map((slug) => [slug, load])) },
  };
});
// The retry's dispatch, counted (BUILD-PROMPT: a load started after commit is cancelled by its cleanup).
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return { ...react, startTransition: vi.fn(react.startTransition) };
});

await preloadLazyModules([
  () =>
    import('virtual:learn-modules').then((modules) =>
      Promise.all(
        ['start-here', 'risk-honestly', 'taxes-where-you-live'].map((slug) => modules.LEARN_BODIES[slug]?.()),
      ),
    ),
]);

const { LEARN_MODULES } = await import('virtual:learn-modules');
const ENGLISH = LEARN_MODULES.find((module) => module.slug === 'start-here');
if (ENGLISH === undefined) throw new Error('the start-here fixture is missing');
const PT = { ...ENGLISH, title: 'Começar aqui', idea: 'Uma ideia traduzida.', caveat: 'Uma ressalva traduzida.' };
const translated = () => Promise.resolve({ meta: PT, default: () => <p>Um parágrafo traduzido.</p> });

function deferred() {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((done) => (resolve = done));
  return { promise, resolve };
}

function Shown({ slug }: { slug: string }) {
  const shown = useModuleBody(slug, useServices().language);
  return shown === undefined ? null : <ModuleView module={shown.module} Body={shown.Body} language={shown.language} />;
}

// Rendered inside an awaited act, so the retry of a suspended render runs once its chunk resolves.
// `strict` mounts under <StrictMode>, as both hosts do, so every effect runs, is cleaned up and runs again.
const mount = async (slug = 'start-here', sheet = false, strict = false) => {
  let mounted: ReturnType<typeof render> | undefined;
  const tree = (
    <ServicesProvider services={createTestServices({ language: 'pt-PT' })}>
      <I18nProvider locale="pt-PT" messages={{ learn: learnPt }}>
        <Suspense fallback={null}>
          {sheet ? <ModuleSheet slug={slug as 'start-here'} open onOpenChange={vi.fn()} /> : <Shown slug={slug} />}
        </Suspense>
      </I18nProvider>
    </ServicesProvider>
  );
  await act(async () => {
    mounted = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });
  if (mounted === undefined) throw new Error('nothing rendered');
  return mounted;
};

beforeEach(() => {
  translation.load = translated;
  vi.mocked(startTransition).mockClear();
});
afterEach(cleanup);

describe('useModuleBody on a pt-PT screen', () => {
  it('renders the translated title, caveat and body with no lang="en"', async () => {
    const { container } = await mount();
    expect(await screen.findByRole('heading', { level: 1, name: PT.title })).toBeTruthy();
    expect(screen.getByText(PT.caveat)).toBeTruthy();
    expect(await screen.findByText('Um parágrafo traduzido.')).toBeTruthy();
    expect(container.querySelector('[lang="en"]')).toBeNull();
  });

  it("names the sheet by the translated idea, with no lang='en'", async () => {
    await mount('start-here', true);
    const dialog = await screen.findByRole('dialog', { name: PT.idea });
    expect(await screen.findByText('Um parágrafo traduzido.')).toBeTruthy();
    expect(dialog.querySelector('[lang="en"]')).toBeNull();
  });

  it('shows English for a slug without a translation, lang="en" on its title, caveat and body only', async () => {
    const { container } = await mount('when-the-market-drops');
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.getAttribute('lang')).toBe('en');
    expect(container.querySelector('[data-slot="card"] p')?.getAttribute('lang')).toBe('en');
    expect([...container.querySelectorAll('[lang]')].map((element) => element.tagName)).toEqual(['H1', 'P', 'DIV']);
  });

  it.each([
    ['a rejected import', 'risk-honestly', () => Promise.reject(new Error('offline'))],
    ['an import that resolves to undefined', 'taxes-where-you-live', () => Promise.resolve(undefined)],
  ])(
    'renders English after %s, and the next mount loads again, though no render committed',
    async (_name, slug, load) => {
      // The reader leaves while the chunk loads, then it fails: that render never commits, so no cleanup of it runs.
      const leave = async () => {
        let settle = (): void => undefined;
        translation.load = () => new Promise((resolve) => (settle = () => resolve(load())));
        const left = await mount(slug);
        expect(left.container.querySelector('h1')).toBeNull();
        left.unmount();
        await act(async () => settle());
      };
      const english = LEARN_MODULES.find((module) => module.slug === slug);
      await leave();
      const failing = vi.fn(load);
      translation.load = failing;
      const first = await mount(slug);
      expect(
        (await screen.findByRole('heading', { level: 1, name: english?.title ?? slug })).getAttribute('lang'),
      ).toBe('en');
      expect(first.container.querySelectorAll('[lang="en"]')).toHaveLength(3);
      expect(failing).toHaveBeenCalledTimes(1);
      first.unmount();
      // This mount's cleanup dropped the fallback, so the next one suspends on a fresh load; a fallback left again by a
      // render that never committed gives way to the translation the next mount loads.
      await leave();
      const loading = vi.fn(translated);
      translation.load = loading;
      await mount(slug);
      expect(await screen.findByRole('heading', { level: 1, name: PT.title })).toBeTruthy();
      expect(loading).toHaveBeenCalledTimes(1);
    },
  );

  it('under StrictMode shows the translation the kept retry brings, once, and drops the cancelled first retry', async () => {
    const errors = vi.spyOn(console, 'error');
    const [cancelled, kept] = [deferred(), deferred()];
    // The render's import fails; StrictMode runs the retry effect, cleans it up and runs it again: two retries.
    const loading = vi
      .fn<() => Promise<unknown>>(translated)
      .mockImplementationOnce(() => Promise.reject(new Error('offline')))
      .mockImplementationOnce(() => cancelled.promise)
      .mockImplementationOnce(() => kept.promise);
    translation.load = loading;
    // The copy keeps start-here's English texts.
    const first = await mount('strict-retry', false, true);
    expect((await screen.findByRole('heading', { level: 1, name: ENGLISH.title })).getAttribute('lang')).toBe('en');
    expect(loading).toHaveBeenCalledTimes(3);
    await act(async () => kept.resolve({ meta: PT, default: () => <p>Um parágrafo traduzido.</p> }));
    // The cancelled retry resolves last, with another text: it must neither be kept nor dispatch.
    const stale = { ...PT, title: 'Um título antigo' };
    await act(async () => cancelled.resolve({ meta: stale, default: () => <p>Um parágrafo antigo.</p> }));
    expect(await screen.findByRole('heading', { level: 1, name: PT.title })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText('Um parágrafo antigo.')).toBeNull();
    expect(startTransition).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    first.unmount();
    // The kept retry is the second one, so the next mount shows it with no new load.
    await mount('strict-retry', false, true);
    expect(await screen.findByRole('heading', { level: 1, name: PT.title })).toBeTruthy();
    expect(loading).toHaveBeenCalledTimes(3);
  });

  it('drops a retry that resolves after its mount left, so the next mount loads again', async () => {
    const retry = deferred();
    const loading = vi
      .fn<() => Promise<unknown>>(translated)
      .mockImplementationOnce(() => Promise.reject(new Error('offline')))
      .mockImplementationOnce(() => retry.promise);
    translation.load = loading;
    const left = await mount('left-retry');
    expect((await screen.findByRole('heading', { level: 1, name: ENGLISH.title })).getAttribute('lang')).toBe('en');
    expect(loading).toHaveBeenCalledTimes(2);
    left.unmount();
    await act(async () => retry.resolve({ meta: PT, default: () => <p>Um parágrafo traduzido.</p> }));
    expect(startTransition).not.toHaveBeenCalled();
    await mount('left-retry');
    expect(await screen.findByRole('heading', { level: 1, name: PT.title })).toBeTruthy();
    expect(loading).toHaveBeenCalledTimes(3);
  });
});
