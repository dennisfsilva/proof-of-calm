import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { TESTED_VIEWPORTS } from './.storybook/viewports.ts';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Pre-bundled before the run: a dependency Vite discovers mid-run reloads the page and breaks the
// suites (Storybook's Vitest addon FAQ). Every entry point the components import belongs here; the
// React Compiler's Babel plugin (.storybook/main.ts) adds react/compiler-runtime itself.
const PREBUNDLED = [
  '@base-ui/react/button',
  '@base-ui/react/checkbox',
  '@base-ui/react/collapsible',
  '@base-ui/react/csp-provider',
  '@base-ui/react/dialog',
  '@base-ui/react/field',
  '@base-ui/react/input',
  '@base-ui/react/radio',
  '@base-ui/react/radio-group',
  '@base-ui/react/select',
  '@base-ui/react/switch',
  '@base-ui/react/tabs',
  '@base-ui/react/toggle',
  '@base-ui/react/toggle-group',
  '@base-ui/react/tooltip',
  'class-variance-authority',
  'clsx',
  'lucide-react',
  'react-dom/server',
  'tailwind-merge',
];

// Every story runs as a browser test with axe in each combination of the phone and desktop widths
// and the light and dark themes (docs/ENGINEERING.md §2); `unit` holds the token and helper tests and
// the component tests, which choose jsdom per file (`// @vitest-environment jsdom`, ADR-0024).
const storyProjects = TESTED_VIEWPORTS.flatMap((viewport) =>
  (['light', 'dark'] as const).map((theme) => ({
    extends: true,
    optimizeDeps: { include: PREBUNDLED },
    plugins: [
      storybookTest({
        configDir: path.join(dirname, '.storybook'),
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
        test: {
          name: 'unit',
          environment: 'node',
          include: ['test/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
        },
      },
      ...storyProjects,
    ],
  },
});
