import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // One dot per test in CI and under `pnpm check` (CREW_QUIET): the output stays short.
    reporters: process.env.CI || process.env.CREW_QUIET ? ['dot'] : ['default'],
  },
});
