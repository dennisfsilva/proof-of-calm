import { describe, expect, it } from 'vitest';
import { buildCsp, reportingEndpoints } from './csp';
import { securityHeaders } from './headers';

const directives = (csp: string) =>
  new Map(
    csp.split('; ').map((part) => {
      const [name, ...values] = part.split(' ');
      return [name, values] as const;
    }),
  );

const hashes = { scriptHashes: ['sha256-theme', 'sha256-boot'], styleHashes: ['sha256-style'] };

describe('buildCsp in production (ADR-0045 §3)', () => {
  const csp = directives(buildCsp({ ...hashes, development: false, https: true }));

  it('allows scripts only by hash, with strict-dynamic and no eval or third-party origin', () => {
    expect(csp.get('script-src')).toEqual(["'self'", "'sha256-theme'", "'sha256-boot'", "'strict-dynamic'"]);
  });

  it('allows styles by hash, never unsafe-inline', () => {
    expect(csp.get('style-src')).toEqual(["'self'", "'sha256-style'"]);
  });

  it('holds no nonce, so the policy is the same on every response and vercel.json can carry it', () => {
    expect(buildCsp({ ...hashes, development: false, https: true })).not.toContain('nonce');
    expect(buildCsp({ ...hashes, development: false, https: true })).toBe(
      buildCsp({ ...hashes, development: false, https: true }),
    );
  });

  it('keeps every other source same-origin', () => {
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('font-src')).toEqual(["'self'"]);
    expect(csp.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(csp.get('worker-src')).toEqual(["'self'", 'blob:']);
    expect(csp.get('manifest-src')).toEqual(["'self'"]);
  });

  it('forbids framing, plugins and base or form hijacking', () => {
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
  });

  it('upgrades insecure requests and reports violations', () => {
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
    expect(csp.get('report-uri')).toEqual(['/api/csp-report']);
    expect(csp.get('report-to')).toEqual(['csp-endpoint']);
  });
});

describe('buildCsp in development', () => {
  const csp = directives(buildCsp({ ...hashes, development: true, https: false }));

  it("adds eval and relaxes styles for Vite's dev server, nothing else", () => {
    expect(csp.get('script-src')).toEqual([
      "'self'",
      "'sha256-theme'",
      "'sha256-boot'",
      "'strict-dynamic'",
      "'unsafe-eval'",
    ]);
    expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('does not ask an http origin to upgrade requests', () => {
    expect(csp.has('upgrade-insecure-requests')).toBe(false);
  });
});

describe('reportingEndpoints', () => {
  it('names the report-to group', () => {
    expect(reportingEndpoints()).toBe('csp-endpoint="/api/csp-report"');
  });
});

describe('securityHeaders', () => {
  it('sets the headers of docs/SECURITY.md §4', () => {
    const byName = Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));
    expect(byName).toEqual({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow',
    });
  });
});
