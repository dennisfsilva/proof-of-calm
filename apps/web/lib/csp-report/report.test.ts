import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { memoryStore } = await import('../server/store');
const { blockedSource, directiveName, handleCspReport, MAX_REPORT_BYTES, readViolations } = await import('./report');

const today = () => '2026-10-17';
const post = (contentType: string, body: string, headers: Record<string, string> = {}) =>
  new Request('https://proofofcalm.com/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': contentType, ...headers },
    body,
  });
const legacy = (fields: Record<string, string>) =>
  JSON.stringify({ 'csp-report': { 'document-uri': 'https://x/today?id=7', ...fields } });

describe('the CSP report endpoint (docs/SECURITY.md §4, ADR-0028)', () => {
  it('counts a report-uri report by directive and blocked origin only, and answers 204', async () => {
    const store = memoryStore();
    const body = legacy({
      'violated-directive': 'script-src-elem',
      'blocked-uri': 'https://evil.example/x.js?token=abc',
    });
    const response = await handleCspReport(post('application/csp-report', body), { store, today });
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await store.counts('csp:2026-10-17')).toEqual({ 'script-src-elem https://evil.example': 1 });
  });

  it('counts each csp-violation of a Reporting API batch and ignores other report types', async () => {
    const store = memoryStore();
    const batch = [
      {
        type: 'csp-violation',
        url: 'https://x/today',
        body: { effectiveDirective: 'img-src', blockedURL: 'data:image/png;base64,AAAA' },
      },
      { type: 'csp-violation', body: { effectiveDirective: 'script-src', blockedURL: 'inline' } },
      { type: 'deprecation', body: { id: 'x' } },
    ];
    const response = await handleCspReport(post('application/reports+json; charset=utf-8', JSON.stringify(batch)), {
      store,
      today,
    });
    expect(response.status).toBe(204);
    expect(await store.counts('csp:2026-10-17')).toEqual({ 'img-src data': 1, 'script-src inline': 1 });
  });

  it('refuses other content types, oversized bodies and broken JSON', async () => {
    const store = memoryStore();
    const deps = { store, today };
    expect((await handleCspReport(post('application/json', '{}'), deps)).status).toBe(415);
    expect((await handleCspReport(post('text/plain', ''), deps)).status).toBe(415);
    const large = legacy({ 'blocked-uri': `https://x.example/${'a'.repeat(MAX_REPORT_BYTES)}` });
    expect((await handleCspReport(post('application/csp-report', large), deps)).status).toBe(413);
    const declared = post('application/csp-report', '{}', { 'content-length': String(MAX_REPORT_BYTES + 1) });
    expect((await handleCspReport(declared, deps)).status).toBe(413);
    expect((await handleCspReport(post('application/csp-report', '{'), deps)).status).toBe(400);
    expect(await store.counts('csp:2026-10-17')).toEqual({});
  });

  it('answers 204 when the counter cannot be written', async () => {
    const store = { ...memoryStore(), increment: vi.fn(async () => Promise.reject(new Error('down'))) };
    const body = legacy({ 'effective-directive': 'style-src', 'blocked-uri': 'inline' });
    expect((await handleCspReport(post('application/csp-report', body), { store, today })).status).toBe(204);
  });
});

describe('what a violation keeps', () => {
  it('names the directive or says it is unknown', () => {
    expect(directiveName('script-src-elem')).toBe('script-src-elem');
    expect(directiveName("style-src 'self' 'nonce-abc'")).toBe('style-src');
    expect(directiveName(undefined)).toBe('unknown');
    expect(directiveName('<script>')).toBe('unknown');
  });

  it('keeps an origin, a keyword or a scheme, never a path, a query or a fragment', () => {
    expect(blockedSource('https://cdn.example:8443/a/b.js?x=1#y')).toBe('https://cdn.example:8443');
    expect(blockedSource('inline')).toBe('inline');
    expect(blockedSource('eval')).toBe('eval');
    expect(blockedSource('')).toBe('inline');
    expect(blockedSource('blob:https://x/123')).toBe('blob');
    expect(blockedSource('chrome-extension://abc/x.js')).toBe('chrome-extension');
    expect(blockedSource('not a url')).toBe('other');
  });

  it('reads nothing from bodies of the wrong shape, and at most 20 violations from a batch', () => {
    expect(readViolations('application/csp-report', { report: {} })).toEqual([]);
    expect(readViolations('application/reports+json', { type: 'csp-violation' })).toEqual([]);
    const many = Array.from({ length: 50 }, () => ({ type: 'csp-violation', body: { effectiveDirective: 'img-src' } }));
    expect(readViolations('application/reports+json', many)).toHaveLength(20);
  });
});
