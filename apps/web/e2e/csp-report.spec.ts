import { expect } from '@playwright/test';
import { test } from './support';

// The report endpoint the policy names (report-uri and report-to), at the request level.

test('a report-uri report is accepted with 204 and no body', async ({ request }) => {
  const response = await request.post('/api/csp-report', {
    headers: { 'content-type': 'application/csp-report' },
    data: JSON.stringify({
      'csp-report': { 'violated-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js' },
    }),
  });
  expect(response.status()).toBe(204);
  expect(await response.text()).toBe('');
});

test('a Reporting API batch is accepted with 204', async ({ request }) => {
  const response = await request.post('/api/csp-report', {
    headers: { 'content-type': 'application/reports+json' },
    data: JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'data:' } }]),
  });
  expect(response.status()).toBe(204);
});

test('anything else is refused', async ({ request }) => {
  const wrongType = await request.post('/api/csp-report', {
    headers: { 'content-type': 'application/json' },
    data: '{}',
  });
  expect(wrongType.status()).toBe(415);
  expect((await request.get('/api/csp-report')).status()).toBe(405);
});
