import { defineConfig } from 'vitest/config';

// The core is pure TypeScript: Node environment, no mocks, and every file under src counts
// towards a 100 % threshold, so an untested file fails CI (docs/ENGINEERING.md §2).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // One dot per test in CI and under `pnpm check` (CREW_QUIET): the output stays short.
    reporters: process.env.CI || process.env.CREW_QUIET ? ['dot'] : ['default'],
    coverage: {
      provider: 'v8',
      include: ['src'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      thresholds: { 100: true },
    },
  },
});
