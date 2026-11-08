import type { Preview } from '@storybook/react-vite';
import '../src/styles/fonts.css';
import '../src/styles/globals.css';
import { failOnClassConflicts, globalTypes, VIEWPORTS, withGlobals } from './shared';

// The globals, their decorator and the class-conflict check are shared with packages/app's Storybook
// (shared.ts, `@proofofcalm/ui/storybook`); this file adds the styles and the defaults.
const preview: Preview = {
  decorators: [withGlobals],
  afterEach: failOnClassConflicts,
  globalTypes,
  initialGlobals: {
    theme: 'light',
    motion: 'full',
    textZoom: '100',
    viewport: { value: 'android-small', isRotated: false },
  },
  parameters: {
    layout: 'padded',
    viewport: { options: VIEWPORTS },
    // Every story fails its test on an axe violation (docs/ENGINEERING.md §2).
    a11y: { test: 'error' },
  },
  tags: ['test'],
};

export default preview;
