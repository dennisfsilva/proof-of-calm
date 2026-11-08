import { failOnClassConflicts, globalTypes, VIEWPORTS, withGlobals } from '@proofofcalm/ui/storybook';
import type { Decorator, Preview } from '@storybook/react-vite';
import { type ReactNode, useEffect, useState } from 'react';
import { EMPTY_SNAPSHOT } from '../src/lib/adapters';
import { I18nProvider, messages } from '../src/lib/i18n';
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
// under load).

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
  const custom = parameters.services;
  const snapshot: Snapshot = parameters.snapshot ?? EMPTY_SNAPSHOT;
  const nowMs: unknown = parameters.nowMs;
  const create =
    typeof custom === 'function'
      ? () => custom() as Services
      : () =>
          createTestServices({
            snapshot: { ...snapshot, prefs: { ...snapshot.prefs, theme, motion } },
            ...(typeof nowMs === 'number' ? { nowMs } : {}),
          });
  return (
    <ServicesFrame key={`${theme}-${motion}`} create={create}>
      <Story />
    </ServicesFrame>
  );
};

const withMessages: Decorator = (Story) => (
  <I18nProvider messages={messages}>
    <Story />
  </I18nProvider>
);

await preloadLazyModules([
  () => import('../src/features/learn').then((learn) => learn.loadLearnScreen()),
  () => import('../src/features/learn/components/module-sheet'),
  // The file behind LEARN_BODIES here (main.ts); only the learn feature imports the virtual module itself.
  () => import('../src/features/learn/fixtures/start-here.mdx'),
  () => import('../src/features/log'),
  () => import('../src/features/onboarding'),
  () => import('../src/features/plan'),
  () => import('../src/features/portfolio'),
  () => import('../src/features/settings'),
]);

const preview: Preview = {
  decorators: [withNavigation, withMessages, withServices, withGlobals],
  afterEach: failOnClassConflicts,
  globalTypes,
  initialGlobals: {
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
