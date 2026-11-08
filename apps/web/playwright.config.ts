import { defineConfig, devices } from '@playwright/test';
import { bypassHeaders } from './e2e/support';

const port = Number(process.env.PORT ?? 3000);
// BASE_URL points the suite at a deployment (docs/OWNER-SETUP.md §3: the request-level specs send the
// protection-bypass header from VERCEL_AUTOMATION_BYPASS_SECRET); without it the suite starts the
// local server over the production build.
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;
const phone = { width: 390, height: 844 };
// The request-level specs (headers, CSP and its reports, routes, the API, the site pages' content, the
// UK block, the PWA wiring, the deployment checks) depend on no viewport: they run on desktop only. The
// matrix spec lays out every page on every project.
const requestOnly = /(csp|csp-report|deployment|prices|pwa|site|uk-block)\.spec\.ts$/;

// The suite runs against the production build served by tools/serve/vercel-local.ts, which applies
// vercel.json's routes, headers and rewrites to `dist` and runs the function bundle (ADR-0045 §1),
// because the CSP that matters is the production one. The seven projects of docs/ENGINEERING.md §3; the
// matrix spec and the today, log, end-buying and pause flows run in light and dark, the other flows in
// light. Visual baselines are valid only in the pinned container (ADR-0024).
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide' } },
  use: {
    baseURL,
    extraHTTPHeaders: bypassHeaders(),
    locale: 'en-GB',
    timezoneId: 'Europe/Lisbon',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'android-small',
      testIgnore: requestOnly,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'iphone', testIgnore: requestOnly, use: { ...devices['iPhone 13'], viewport: phone } },
    {
      name: 'tablet',
      testIgnore: requestOnly,
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'desktop-wide',
      testIgnore: requestOnly,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    // 125 % text zoom: every spec's `page` (e2e/support.ts) has a 20 px root on this project.
    { name: 'zoom-125', testIgnore: requestOnly, use: { ...devices['Desktop Chrome'], viewport: phone } },
    {
      name: 'reduced-motion',
      testIgnore: requestOnly,
      use: { ...devices['Desktop Chrome'], viewport: phone, contextOptions: { reducedMotion: 'reduce' } },
    },
  ],
  webServer: process.env.BASE_URL
    ? []
    : {
        command: `node ../../tools/serve/vercel-local.ts --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
