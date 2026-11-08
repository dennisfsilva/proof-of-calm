import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
    reporters: process.env.CI || process.env.CREW_QUIET ? ['dot'] : ['default'],
  },
});
