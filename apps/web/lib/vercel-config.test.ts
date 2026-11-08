import { readFileSync } from 'node:fs';
import { APP_ROUTES } from '@proofofcalm/app/lib/navigation/routes';
import { THEME_BEFORE_PAINT, THEME_BEFORE_PAINT_SHA256 } from '@proofofcalm/app/lib/theme';
import { BOOT_SCRIPT, BOOT_SCRIPT_HASH, sha256 } from '@proofofcalm/config/vite';
import { describe, expect, it } from 'vitest';
import { isExemptPath, NOT_AVAILABLE_STYLE } from './geo/uk-block';
import { buildCsp, reportingEndpoints } from './security/csp';
import { securityHeaders } from './security/headers';
import { LEGAL_PAGES, SECURITY_TXT_PATH } from './site/pages';
import { type VercelJson, vercelConfig } from './vercel-config';

// The hashes recomputed from the texts, not read from the constants the writer uses.
const inputs = {
  themeHash: sha256(THEME_BEFORE_PAINT),
  bootHash: sha256(BOOT_SCRIPT),
  notAvailableStyleHash: sha256(NOT_AVAILABLE_STYLE),
  appRoutes: APP_ROUTES,
  legalPaths: LEGAL_PAGES.map((page) => page.path),
  securityTxtPath: SECURITY_TXT_PATH,
};
const config = vercelConfig(inputs);
const committed: VercelJson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const csp = buildCsp({
  development: false,
  https: true,
  scriptHashes: [inputs.themeHash, inputs.bootHash],
  styleHashes: [inputs.notAvailableStyleHash],
});
const asRecord = (headers: readonly { key: string; value: string }[]) =>
  Object.fromEntries(headers.map(({ key, value }) => [key, value]));
const ukRoute = config.routes[0];
if (ukRoute === undefined) throw new Error('no UK route');

describe('the committed vercel.json (ADR-0045 §1)', () => {
  it('equals what the code writes; `node scripts/vercel-config.ts --write` regenerates it', () => {
    expect(committed).toEqual(config);
  });

  it('is built from hashes that equal the constants the writer uses', () => {
    expect(`sha256-${THEME_BEFORE_PAINT_SHA256}`).toBe(inputs.themeHash);
    expect(BOOT_SCRIPT_HASH).toBe(inputs.bootHash);
  });

  it('keeps the Vite preset, the output directory, the region and clean URLs in the repository', () => {
    expect(config).toMatchObject({
      framework: 'vite',
      buildCommand: 'pnpm run build',
      outputDirectory: 'dist',
      regions: ['fra1'],
      cleanUrls: true,
      trailingSlash: false,
    });
  });
});

describe('the header rules (ADR-0045 §3)', () => {
  it('sets the eight security headers on every response', () => {
    expect(config.headers[0]).toEqual({ source: '/(.*)', headers: [...securityHeaders] });
  });

  it('sets the hashed policy and Reporting-Endpoints on the documents, not on assets or the API', () => {
    const rule = config.headers[1];
    expect(rule?.headers).toEqual([
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Reporting-Endpoints', value: reportingEndpoints() },
    ]);
    const source = new RegExp(`^${rule?.source}$`);
    for (const path of ['/', '/today', '/terms', '/app', '/not-available', '/~offline']) {
      expect(source.test(path), path).toBe(true);
    }
    for (const path of [
      '/api/prices',
      '/assets/app-1.js',
      '/icons/icon-192.png',
      '/.well-known/security.txt',
      '/sw.js',
      '/serwist/sw.js',
      '/manifest.webmanifest',
      '/favicon.svg',
      '/apple-touch-icon.png',
    ]) {
      expect(source.test(path), path).toBe(false);
    }
  });

  it('holds the two script hashes and the style hash and no nonce', () => {
    expect(csp).toContain(`'${inputs.themeHash}' '${inputs.bootHash}' 'strict-dynamic'`);
    expect(csp).toContain(`style-src 'self' '${inputs.notAvailableStyleHash}'`);
    expect(csp).not.toContain('nonce');
  });

  it('caches the hashed assets for a year and lets both worker paths control the whole origin', () => {
    expect(config.headers.slice(2)).toEqual([
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/serwist/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
    ]);
  });
});

describe('the UK route (ADR-0045 §4)', () => {
  it('answers GB document requests with the static page and 451, case-sensitively', () => {
    expect(ukRoute).toMatchObject({
      has: [{ type: 'header', key: 'x-vercel-ip-country', value: 'GB' }],
      dest: '/not-available',
      status: 451,
      caseSensitive: true,
    });
    expect(config.routes).toHaveLength(1);
  });

  it('carries the security headers, the policy and no-store', () => {
    expect(ukRoute.headers).toEqual({
      ...asRecord(securityHeaders),
      'Content-Security-Policy': csp,
      'Reporting-Endpoints': reportingEndpoints(),
      'Cache-Control': 'no-store',
    });
  });

  it('exempts exactly what isExemptPath exempts, trailing slashes and case included', () => {
    const blocked = new RegExp(ukRoute.src);
    for (const path of [
      '/',
      '/today',
      '/today/anything',
      '/learn',
      '/app',
      '/404',
      '/not-available',
      '/manifest.webmanifest',
      '/terms',
      '/terms/',
      '/privacy',
      '/risk',
      '/cookies',
      '/contact',
      '/contact/',
      '/terms/extra',
      '/Terms',
      '/.well-known/security.txt',
      '/.well-known/security.txt/',
      '/.well-known/other',
    ]) {
      expect(blocked.test(path), path).toBe(!isExemptPath(path));
    }
  });

  it('leaves the API, the assets, the workers and the icons alone', () => {
    const blocked = new RegExp(ukRoute.src);
    for (const path of [
      '/api/prices',
      '/assets/app-1.js',
      '/icons/icon-192.png',
      '/sw.js',
      '/serwist/sw.js',
      '/favicon.ico',
      '/apple-touch-icon.png',
    ]) {
      expect(blocked.test(path), path).toBe(false);
    }
  });
});

describe('the rewrites (ADR-0045 §1 and §2)', () => {
  it('send the API paths to the one function, a coin’s history one segment deep, and the app routes to the shell', () => {
    const routes = APP_ROUTES.join('|');
    expect(config.rewrites).toEqual([
      { source: '/api/(prices|csp-report|history/[^/]+)', destination: '/api' },
      { source: `/(${routes})`, destination: '/app' },
      { source: `/(${routes})/(.*)`, destination: '/app' },
    ]);
    expect(APP_ROUTES).toContain('today');
  });
});
