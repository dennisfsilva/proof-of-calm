// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { useMessages, useTranslations } from 'use-intl';
import { afterEach, describe, expect, it } from 'vitest';
import learn from '../../messages/en/learn.json';
import plan from '../../messages/en/plan.json';
import today from '../../messages/en/today.json';
import { lazyScreen, loadNamespace } from './lazy';
import { I18nProvider } from './provider';
import { messageRegistry } from './registry';

afterEach(cleanup);

function LearnHeading() {
  const t = useTranslations('learn');
  return <h1>{t('title')}</h1>;
}
const LearnScreen = lazyScreen('learn', () => Promise.resolve({ default: LearnHeading }));

function TodayHeading() {
  const t = useTranslations('today');
  return <h1>{t('title')}</h1>;
}

/** The namespaces the provider holds, as the screens see them. */
function Namespaces() {
  return <output>{Object.keys(useMessages()).join(' ')}</output>;
}

describe('lazyScreen (ADR-0045 §8)', () => {
  it('puts the screen’s namespace in the provider’s messages before the screen renders', async () => {
    expect(messageRegistry.getSnapshot().learn).toBeUndefined();
    render(
      <I18nProvider>
        <Suspense fallback={null}>
          <LearnScreen />
        </Suspense>
      </I18nProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Learn' })).toBeDefined();
    expect(messageRegistry.getSnapshot().learn).toEqual(learn);
  });

  it('reaches a provider that is already mounted', () => {
    render(
      <I18nProvider>
        <Namespaces />
      </I18nProvider>,
    );
    expect(screen.getByRole('status').textContent).not.toContain('plan');
    act(() => messageRegistry.add('plan', plan));
    expect(screen.getByRole('status').textContent).toContain('plan');
  });

  it('lets a namespace passed to the provider win over the registry', () => {
    messageRegistry.add('today', { ...today, title: 'From the registry' });
    render(
      <I18nProvider messages={{ today }}>
        <TodayHeading />
      </I18nProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Today' })).toBeDefined();
  });
});

describe('loadNamespace', () => {
  it('registers a lazy namespace for a static screen’s lazy part, such as Today’s entry sheet', async () => {
    expect(messageRegistry.getSnapshot().settings).toBeUndefined();
    await loadNamespace('settings');
    expect(messageRegistry.getSnapshot().settings?.title).toBe('Settings');
  });
});
