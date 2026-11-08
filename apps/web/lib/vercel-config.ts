// apps/web/vercel.json as a function of the code (ADR-0045 §1, §3 and §4): the eight security headers,
// the hashed CSP, the UK route and the rewrites to the app shell and the API function. The file is
// static JSON that Vercel reads before the build, so `scripts/vercel-config.ts --write` regenerates it
// and `vercel-config.test.ts` fails when the committed copy drifts. Plain `node` loads this module.
import { BLOCKED_COUNTRIES, BLOCKED_STATUS, COUNTRY_HEADER } from './geo/rules.ts';
import { buildCsp, reportingEndpoints } from './security/csp.ts';
import { securityHeaders } from './security/headers.ts';

export type VercelInputs = {
  /** `sha256-…` of THEME_BEFORE_PAINT. */
  themeHash: string;
  /** `sha256-…` of BOOT_SCRIPT. */
  bootHash: string;
  /** `sha256-…` of NOT_AVAILABLE_STYLE. */
  notAvailableStyleHash: string;
  /** The app's routes, rewritten to the shell: APP_ROUTES. */
  appRoutes: readonly string[];
  /** The legal pages' paths, reachable from the UK: LEGAL_PAGES. */
  legalPaths: readonly string[];
  /** security.txt, reachable from the UK: SECURITY_TXT_PATH. */
  securityTxtPath: string;
};

type Header = { key: string; value: string };
type HeaderCondition = { type: 'header'; key: string; value: string };

export type VercelJson = {
  $schema: string;
  framework: 'vite';
  buildCommand: string;
  outputDirectory: string;
  regions: string[];
  cleanUrls: true;
  trailingSlash: false;
  routes: {
    src: string;
    has: HeaderCondition[];
    dest: string;
    status: number;
    caseSensitive: true;
    headers: Record<string, string>;
  }[];
  headers: { source: string; headers: Header[] }[];
  rewrites: { source: string; destination: string }[];
};

/** The requests that are not documents: the API, the build's assets, the workers and the icons. */
const NOT_DOCUMENTS = ['api/', 'assets/', 'icons/', 'sw\\.js$', 'serwist/', 'favicon\\.', 'apple-touch-icon\\.png$'];
/** With `cleanUrls`, Vercel serves dist/not-available.html here (the ADR's Deviations). */
const NOT_AVAILABLE = '/not-available';
const APP_SHELL = '/app';
const API_FUNCTION = '/api';
/** A coin's history is one path segment deeper; the handler checks the segment against the allow-list. */
const API_PATHS = ['prices', 'csp-report', 'history/[^/]+'];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slug = (path: string) => path.replace(/^\//, '');

export function vercelConfig(inputs: VercelInputs): VercelJson {
  const csp = buildCsp({
    development: false,
    https: true,
    scriptHashes: [inputs.themeHash, inputs.bootHash],
    styleHashes: [inputs.notAvailableStyleHash],
  });
  const policyHeaders: Header[] = [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'Reporting-Endpoints', value: reportingEndpoints() },
  ];
  // Exempt from the block: the legal pages and security.txt, with or without a trailing slash, as
  // isExemptPath reads them, and what is not a document. Case matters, as it does for isExemptPath.
  const exempt = [...inputs.legalPaths, inputs.securityTxtPath].map((path) => escapeRegExp(slug(path)));
  const blocked = `^/(?!(?:${exempt.join('|')})/?$|${NOT_DOCUMENTS.join('|')}).*$`;
  const appRoutes = inputs.appRoutes.join('|');

  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'vite',
    buildCommand: 'pnpm run build',
    outputDirectory: 'dist',
    regions: ['fra1'],
    cleanUrls: true,
    trailingSlash: false,
    routes: [
      {
        src: blocked,
        has: [{ type: 'header', key: COUNTRY_HEADER, value: BLOCKED_COUNTRIES.join('|') }],
        dest: NOT_AVAILABLE,
        status: BLOCKED_STATUS,
        caseSensitive: true,
        headers: Object.fromEntries(
          [...securityHeaders, ...policyHeaders, { key: 'Cache-Control', value: 'no-store' }].map(({ key, value }) => [
            key,
            value,
          ]),
        ),
      },
    ],
    headers: [
      { source: '/(.*)', headers: securityHeaders.map(({ key, value }) => ({ key, value })) },
      {
        source: `/((?!${['\\.well-known/', 'manifest\\.webmanifest$', ...NOT_DOCUMENTS].join('|')}).*)`,
        headers: policyHeaders,
      },
      { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/serwist/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
    ],
    rewrites: [
      { source: `/api/(${API_PATHS.join('|')})`, destination: API_FUNCTION },
      { source: `/(${appRoutes})`, destination: APP_SHELL },
      { source: `/(${appRoutes})/(.*)`, destination: APP_SHELL },
    ],
  };
}
