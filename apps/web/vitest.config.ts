import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
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
