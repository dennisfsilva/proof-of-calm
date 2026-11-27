import { defineConfig } from 'vitest/config';

// The schemas guard the price history at every boundary, so every file under src counts towards a
// 100 % threshold, as in the core (docs/ENGINEERING.md §2).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // One dot per test in CI and under `pnpm check` (CREW_QUIET): the output stays short.
    reporters: process.env.CI || process.env.CREW_QUIET ? ['dot'] : ['default'],
    coverage: {
      provider: 'v8',
      include: ['src'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { 100: true },
    },
  },
});
