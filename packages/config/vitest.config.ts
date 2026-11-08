import { defineConfig } from 'vitest/config';

// The Vite factory and its plugins are Node code: Node environment, and the guard tests run a real
// `vite build` on a fixture under a temporary directory, so they get a longer timeout.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['vite/**/*.test.ts'],
    testTimeout: 60_000,
    // One dot per test in CI and under `pnpm check` (CREW_QUIET): the output stays short.
    reporters: process.env.CI || process.env.CREW_QUIET ? ['dot'] : ['default'],
  },
});
