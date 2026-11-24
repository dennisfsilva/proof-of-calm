import { failOnClassConflicts, globalTypes, VIEWPORTS, withGlobals } from '@proofofcalm/ui/storybook';
import type { Decorator, Preview } from '@storybook/react-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { EMPTY_SNAPSHOT } from '../src/lib/adapters';
import { I18nProvider, isUiLanguage, type Messages, messageRegistry, messages, type UiLanguage } from '../src/lib/i18n';
import { NavigationProvider } from '../src/lib/navigation';
import type { Snapshot } from '../src/lib/ports';
import { type Services, ServicesProvider } from '../src/lib/services';
import { createTestServices, preloadLazyModules } from '../src/lib/services/testing';
import './preview.css';

// The globals, their decorator and the class-conflict check come from packages/ui's Storybook; the
// screens also need the navigation adapter (ADR-0045 §9, wouter's memory location, starting at the
// story's `parameters.path`), the messages (§8, the merged catalogue, precompiled by main.ts) and the
// services over fakes, started once per story (a story that needs other services passes a factory as
// `parameters.services`; one that needs a plan or a date passes `parameters.snapshot` and
// `parameters.nowMs`). Their snapshot's appearance follows the theme and motion globals, so the
// shell's appearance effect sets what the globals' decorator set. Every module the product reaches with
// import() loads with this file, before any story and outside any test's timeout, so a play function's
// findBy waits on renders, not on Vite's first transform of a chunk, a namespace or a profile (seconds
// under load). The language global renders a story in English, pt-PT or German: the provider's locale,
// that language's merged namespaces whole, the files `loadNamespace` reads and the services' formatters (a
// story with its own services factory keeps English formats).

type Namespace = Messages[keyof Messages];

/** A language's namespace files, globbed eagerly, as one messages object keyed by namespace. */
const byNamespace = (files: Record<string, Namespace>) =>
  Object.fromEntries(
    Object.entries(files).map(([path, namespace]) => [/([^/]+)\.json$/.exec(path)?.[1], namespace]),
  ) as Messages;
const MESSAGES: Readonly<Record<UiLanguage, Messages>> = {
  en: messages,
  'pt-PT': byNamespace(import.meta.glob<Namespace>('../src/messages/pt-PT/*.json', { eager: true, import: 'default' })),
  de: byNamespace(import.meta.glob<Namespace>('../src/messages/de/*.json', { eager: true, import: 'default' })),
};
const languageOf = (globals: Record<string, unknown>): UiLanguage =>
  isUiLanguage(globals.language) ? globals.language : 'en';

const withNavigation: Decorator = (Story, { parameters }) => (
  <NavigationProvider location="memory" initialPath={typeof parameters.path === 'string' ? parameters.path : '/today'}>
    <Story />
  </NavigationProvider>
);

function ServicesFrame({ create, children }: { create: () => Services; children: ReactNode }) {
  const [services] = useState(create);
  useEffect(() => {
    void services.start();
  }, [services]);
  return <ServicesProvider services={services}>{children}</ServicesProvider>;
}

const withServices: Decorator = (Story, { parameters, globals }) => {
  const theme = globals.theme === 'dark' ? 'dark' : 'light';
  const motion = globals.motion === 'reduce' ? 'reduce' : 'system';
  const language: UiLanguage = languageOf(globals);
  const custom = parameters.services;
  const snapshot: Snapshot = parameters.snapshot ?? EMPTY_SNAPSHOT;
  const nowMs: unknown = parameters.nowMs;
  const create =
    typeof custom === 'function'
      ? () => custom() as Services
      : () =>
          createTestServices({
            snapshot: { ...snapshot, prefs: { ...snapshot.prefs, theme, motion } },
            language,
            ...(typeof nowMs === 'number' ? { nowMs } : {}),
          });
  return (
    <ServicesFrame key={`${theme}-${motion}-${language}`} create={create}>
      <Story />
    </ServicesFrame>
  );
};

const withMessages: Decorator = (Story, { globals }) => {
  const language = languageOf(globals);
  messageRegistry.setLanguage(language);
  document.documentElement.lang = language;
  return (
    <I18nProvider locale={language} messages={MESSAGES[language]}>
      <Story />
    </I18nProvider>
  );
};

await preloadLazyModules([
  () => import('../src/features/learn').then((learn) => learn.loadLearnScreen()),
  () => import('../src/features/learn/components/module-sheet'),
  // The file behind LEARN_BODIES here (main.ts); only the learn feature imports the virtual module itself.
  () => import('../src/features/learn/fixtures/start-here.mdx'),
  // Each loader imports its barrel first, so the barrel's own exports (Log's sheets, Onboarding's country step
  // and re-ask) are warmed with the screen: a barrel exports its screen only as a loader (ADR-0045 §9).
  () => import('../src/features/log').then((log) => log.loadLogScreen()),
  () => import('../src/features/onboarding').then((onboarding) => onboarding.loadOnboardingScreen()),
  () => import('../src/features/plan').then((plan) => plan.loadPlanScreen()),
  () => import('../src/features/plan').then((plan) => plan.loadReviewScreen()),
  () => import('../src/features/portfolio').then((portfolio) => portfolio.loadPortfolioScreen()),
  () => import('../src/features/settings').then((settings) => settings.loadSettingsScreen()),
]);

const preview: Preview = {
  decorators: [withNavigation, withMessages, withServices, withGlobals],
  afterEach: failOnClassConflicts,
  globalTypes: {
    ...globalTypes,
    language: {
      description: 'UI language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'pt-PT', title: 'Português (pt-PT)' },
          { value: 'de', title: 'Deutsch (de)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    language: 'en',
    theme: 'light',
    motion: 'full',
    textZoom: '100',
    viewport: { value: 'android-small', isRotated: false },
  },
  parameters: {
    layout: 'fullscreen',
    viewport: { options: VIEWPORTS },
    // Every story fails its test on an axe violation (docs/ENGINEERING.md §2).
    a11y: { test: 'error' },
  },
  tags: ['test'],
};

export default preview;
