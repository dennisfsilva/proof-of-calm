import { resolve } from 'node:path';
import { learnPlugins, MODULE_BODY_ELEMENTS } from '@proofofcalm/config/vite';
import { parseModule } from '@proofofcalm/content/modules';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // The Learn modules as the prerender reads them (ADR-0048), so the site tests render the public Learn pages.
  plugins: learnPlugins({
    dir: resolve(import.meta.dirname, '../../packages/content/learn'),
    parseModule,
    elements: MODULE_BODY_ELEMENTS,
  }),
  test: {
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'src/**/*.test.ts',
      'server/**/*.test.ts',
      'scripts/**/*.test.ts',
      'lighthouse/**/*.test.ts',
    ],
    // Playwright owns e2e/ (`pnpm test:e2e`); Vitest never collects a spec from it.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // One dot per test in CI and under `pnpm check` (CREW_QUIET): the output stays short.
    reporters: process.env.CI || process.env.CREW_QUIET ? ['dot'] : ['default'],
  },
});
