import { resolve } from 'node:path';
import { learnPlugins, MODULE_BODY_ELEMENTS } from '@proofofcalm/config/vite';
import { parseModule } from '@proofofcalm/content/modules';
import { TESTED_VIEWPORTS } from '@proofofcalm/ui/storybook';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Pre-bundled before the run: a dependency Vite discovers mid-run reloads the page and breaks the
// suites (Storybook's Vitest addon FAQ). Every entry point the screens and their providers import
// belongs here, from this package's own dependencies (Vite resolves the list from here, so
// packages/ui's, lucide-react among them, cannot be named and are found through its linked sources);
// the React Compiler's Babel plugin (.storybook/main.ts) adds react/compiler-runtime itself.
const PREBUNDLED = [
  'idb',
  'react-dom/server',
  'use-intl',
  'wouter',
  'wouter/memory-location',
  'zustand',
  'zustand/vanilla',
];

// Every story runs as a browser test with axe in each combination of the phone and desktop widths
// and the light and dark themes (docs/ENGINEERING.md §2), as in packages/ui. The Storybook
// configuration directory is read relative to the working directory, which turbo and `pnpm --filter`
// set to this package.
const storyProjects = TESTED_VIEWPORTS.flatMap((viewport) =>
  (['light', 'dark'] as const).map((theme) => ({
    extends: true,
    optimizeDeps: { include: PREBUNDLED },
    plugins: [
      storybookTest({
        configDir: '.storybook',
        // Its default stubs every `.mdx` import with an empty module, which the Learn pipeline would refuse.
        disableAddonDocs: false,
        initialGlobals: { theme, viewport: { value: viewport, isRotated: false } },
      }),
    ],
    test: {
      name: `storybook:${viewport}:${theme}`,
      browser: {
        enabled: true,
        provider: playwright(),
        headless: true,
        instances: [{ browser: 'chromium' as const }],
      },
    },
  })),
);

export default defineConfig({
  test: {
    // One dot per test in CI and under `pnpm check` (CREW_QUIET): the output stays short.
    reporters: process.env.CI || process.env.CREW_QUIET ? ['dot'] : ['default'],
    projects: [
      {
        // The Learn pipeline over the fixture folder (ADR-0048), so the tests import `.mdx` and the virtual
        // module as a host does, with the host's one element; packages/content/learn stays out, and no test depends
        // on a real module.
        plugins: learnPlugins({
          dir: resolve(import.meta.dirname, 'src/features/learn/fixtures'),
          parseModule,
          elements: MODULE_BODY_ELEMENTS,
        }),
        test: {
          // The lib modules run in Node; a component test chooses jsdom per file
          // (`// @vitest-environment jsdom`, ADR-0024).
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      ...storyProjects,
    ],
  },
});
