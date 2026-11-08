import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

// The smoke test of the export (ADR-0045 §10) against the plain file server, in Chromium at a phone
// width: it renders, which a file check cannot prove. The web host's matrix covers the screens.
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL, locale: 'en-GB', timezoneId: 'Europe/Lisbon', trace: 'retain-on-failure' },
  projects: [{ name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
  webServer: {
    command: `node scripts/serve-static.ts --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
