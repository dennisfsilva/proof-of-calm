import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  compress,
  createRouter,
  createVercelLocal,
  loadApi,
  shouldCompress,
  sourceToRegExp,
  VERCEL_BROTLI_QUALITY,
} from './vercel-local.ts';

// The paths that are not documents: no policy, and open from the UK (ADR-0045 §1).
const NOT_DOCUMENT =
  'api/|assets/|icons/|\\.well-known/|sw\\.js$|serwist/|manifest\\.webmanifest$|favicon\\.|apple-touch-icon\\.png$';
const POLICY =
  "default-src 'self'; script-src 'self' 'sha256-a=' 'strict-dynamic'; upgrade-insecure-requests; report-to csp";
const HTTP_POLICY = "default-src 'self'; script-src 'self' 'sha256-a=' 'strict-dynamic'; report-to csp";
const SECURITY = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];
const UK_HEADERS = { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': POLICY, 'Cache-Control': 'no-store' };

// Shaped like ADR-0045 §1's apps/web/vercel.json, with shorter header lists.
const CONFIG = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  buildCommand: 'pnpm run build',
  outputDirectory: 'dist',
  regions: ['fra1'],
  cleanUrls: true,
  trailingSlash: false,
  routes: [
    {
      src: `^/(?!(?:terms|privacy|risk|cookies|contact)/?$|${NOT_DOCUMENT}).*$`,
      has: [{ type: 'header', key: 'x-vercel-ip-country', value: 'GB' }],
      dest: '/not-available',
      status: 451,
      headers: UK_HEADERS,
    },
  ],
  headers: [
    { source: '/(.*)', headers: SECURITY },
    {
      source: `/((?!${NOT_DOCUMENT}).*)`,
      headers: [
        { key: 'Content-Security-Policy', value: POLICY },
        { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
      ],
    },
    { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    { source: '/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
  ],
  rewrites: [
    { source: '/api/(prices|csp-report)', destination: '/api' },
    { source: '/(today|portfolio|log|plan|settings|learn|onboarding)', destination: '/app' },
    { source: '/(today|portfolio|log|plan|settings|learn|onboarding)/(.*)', destination: '/app' },
  ],
};

const FILES: Record<string, string> = {
  'index.html': '<!doctype html><title>Holding page</title>',
  'app.html': '<!doctype html><title>App</title>',
  'terms.html': '<!doctype html><title>Terms</title>',
  'not-available.html': '<!doctype html><title>Not available</title>',
  '404.html': '<!doctype html><title>Not found</title>',
  '~offline.html': '<!doctype html><title>Offline</title>',
  'assets/index-abc123.js': 'export const doubled = [1, 2, 3].map((n) => n * 2);\n'.repeat(40),
  'icons/icon-192.png': 'not really a PNG',
  'sw.js': "self.addEventListener('install', () => {});",
  'manifest.webmanifest': '{"name":"Fixture"}',
  'favicon.ico': 'not really an icon',
  '.well-known/security.txt': 'Contact: mailto:security@example.com\n',
};

const GB = { 'x-vercel-ip-country': 'GB' };
const lowercased = (headers: Record<string, string>) =>
  Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

function writeBuild(dir: string): void {
  for (const [name, content] of Object.entries(FILES)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
}

// Answers as ADR-0045 §2 describes the API: GET /api/prices, POST /api/csp-report, 405 for another method.
const FIXTURE_API = {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.has('x-fail')) throw new Error('the fixture function fails');
    const { pathname, search } = new URL(request.url);
    if (pathname === '/api/prices' && request.method === 'GET') {
      const body = { pathname, search, origin: request.headers.get('origin') };
      return Response.json(body, { headers: { 'Cache-Control': 'public, s-maxage=600', Vary: 'Origin' } });
    }
    if (pathname === '/api/csp-report' && request.method === 'POST') {
      return Response.json({ received: await request.text() }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  },
};

type Answer = { status: number; headers: IncomingHttpHeaders; body: Buffer };

/** One request over plain node:http, which sends the path as written and leaves the body compressed. */
function ask(
  port: number,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const options = { host: '127.0.0.1', port, path, method: init.method ?? 'GET', headers: init.headers ?? {} };
    const request = httpRequest({ ...options, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }),
      );
    });
    request.on('error', reject);
    request.end(init.body);
  });
}

describe('sourceToRegExp', () => {
  it('reads literal paths and groups as path-to-regexp does for Vercel: anchored and case-sensitive', () => {
    const cases: [source: string, matches: string[], misses: string[]][] = [
      ['/(.*)', ['/', '/today', '/assets/index-abc.js'], ['']],
      ['/assets/(.*)', ['/assets/index-abc.js', '/assets/'], ['/assets', '/ASSETS/index-abc.js', '/x/assets/a.js']],
      ['/sw.js', ['/sw.js'], ['/swxjs', '/sw.js/', '/SW.JS']],
      ['/api/(prices|csp-report)', ['/api/prices', '/api/csp-report'], ['/api/pricesx', '/api/prices/x', '/api']],
      ['/(today|log)/(.*)', ['/today/a', '/log/a/b'], ['/today', '/plan/a']],
      ['/a\\(b', ['/a(b'], ['/ab']],
    ];
    for (const [source, matches, misses] of cases) {
      const pattern = sourceToRegExp(source);
      for (const path of matches) expect(pattern.test(path), `${source} on ${path}`).toBe(true);
      for (const path of misses) expect(pattern.test(path), `${source} on ${path}`).toBe(false);
    }
  });

  it('keeps a negative lookahead, so the document rule leaves out the API, the assets and the files', () => {
    const documents = sourceToRegExp(`/((?!${NOT_DOCUMENT}).*)`);
    for (const path of ['/', '/today', '/terms', '/~offline', '/nowhere']) {
      expect(documents.test(path), path).toBe(true);
    }
    const notDocuments = [
      '/api/prices',
      '/assets/a.js',
      '/icons/i.png',
      '/.well-known/security.txt',
      '/sw.js',
      '/serwist/sw.js',
      '/manifest.webmanifest',
      '/favicon.ico',
      '/apple-touch-icon.png',
    ];
    for (const path of notDocuments) expect(documents.test(path), path).toBe(false);
  });

  it('refuses what it does not emulate and what path-to-regexp rejects', () => {
    for (const source of ['/:path*', '/a/:id', '/{a}', '/(.*)?', '/(a)+', '/a*', '/((.*))', '/(?:a)', '/(a', '/()']) {
      expect(() => sourceToRegExp(source), source).toThrow(source);
    }
  });
});

describe('createRouter', () => {
  const route = createRouter(CONFIG, new Set(Object.keys(FILES)));
  const at = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
    route({ method, path, headers: new Headers(headers) });
  const routerFor = (config: unknown, files: string[] = []) => {
    const router = createRouter(config, new Set(files));
    return (path: string, headers: Record<string, string> = {}, method = 'GET') =>
      router({ method, path, headers: new Headers(headers) });
  };

  it('serves a build file by name, an HTML file at its clean URL and index.html at /', () => {
    expect(at('/')).toMatchObject({ kind: 'file', file: 'index.html', status: 200 });
    expect(at('/terms')).toMatchObject({ kind: 'file', file: 'terms.html', status: 200 });
    expect(at('/~offline')).toMatchObject({ kind: 'file', file: '~offline.html', status: 200 });
    expect(at('/sw.js')).toMatchObject({ kind: 'file', file: 'sw.js', status: 200 });
    expect(at('/.well-known/security.txt')).toMatchObject({ kind: 'file', file: '.well-known/security.txt' });
  });

  it('redirects .html and index paths to their clean URL and drops a trailing slash, with 308', () => {
    const redirects = [
      ['/terms.html', '/terms'],
      ['/index.html', '/'],
      ['/index', '/'],
      ['/terms/', '/terms'],
      ['/today/plan/', '/today/plan'],
    ];
    for (const [path = '', location] of redirects) {
      const outcome = at(path);
      expect(outcome, path).toMatchObject({ kind: 'empty', status: 308 });
      expect(outcome.headers.get('location'), path).toBe(location);
    }
  });

  it('answers those redirects before the routes and the header rules, in the order Vercel builds them', () => {
    expect(at('/terms.html', GB)).toMatchObject({ kind: 'empty', status: 308 });
    expect(at('/today/', GB)).toMatchObject({ kind: 'empty', status: 308 });
    expect(Object.fromEntries(at('/terms/').headers)).toEqual({ location: '/terms' });
  });

  it('answers a matching route with its destination, its status and only its own headers', () => {
    const outcome = at('/today', GB);
    expect(outcome).toMatchObject({ kind: 'file', file: 'not-available.html', status: 451 });
    expect(Object.fromEntries(outcome.headers)).toEqual(lowercased(UK_HEADERS));
    expect(at('/', GB)).toMatchObject({ kind: 'file', file: 'not-available.html', status: 451 });
    expect(at('/nowhere', GB)).toMatchObject({ kind: 'file', file: 'not-available.html', status: 451 });
  });

  it('keeps the legal pages, security.txt, the API and the static files open from the UK', () => {
    expect(at('/terms', GB)).toMatchObject({ kind: 'file', file: 'terms.html', status: 200 });
    const files = ['/.well-known/security.txt', '/assets/index-abc123.js', '/icons/icon-192.png', '/sw.js'];
    for (const path of [...files, '/manifest.webmanifest', '/favicon.ico']) {
      expect(at(path, GB), path).toMatchObject({ kind: 'file', status: 200 });
    }
    expect(at('/api/prices', GB)).toMatchObject({ kind: 'function' });
  });

  it('passes a route by when its has condition does not hold', () => {
    expect(at('/today')).toMatchObject({ kind: 'file', file: 'app.html', status: 200 });
    expect(at('/today', { 'x-vercel-ip-country': 'PT' })).toMatchObject({ kind: 'file', file: 'app.html' });
  });

  it('matches a route src in any case, and header and rewrite sources and file names in their own', () => {
    expect(at('/TODAY', GB)).toMatchObject({ kind: 'file', file: 'not-available.html', status: 451 });
    expect(at('/TODAY')).toMatchObject({ kind: 'missing' });
    expect(at('/Terms')).toMatchObject({ kind: 'missing' });
    expect(at('/ASSETS/index-abc123.js').headers.get('cache-control')).toBeNull();
  });

  it('gives a response every header rule that matches the requested path', () => {
    const document = at('/today');
    expect(document.headers.get('x-content-type-options')).toBe('nosniff');
    expect(document.headers.get('content-security-policy')).toBe(POLICY);
    expect(document.headers.get('reporting-endpoints')).toBe('csp-endpoint="/api/csp-report"');
    const asset = at('/assets/index-abc123.js');
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.headers.get('x-content-type-options')).toBe('nosniff');
    expect(asset.headers.has('content-security-policy')).toBe(false);
    expect(at('/sw.js').headers.get('service-worker-allowed')).toBe('/');
    expect(at('/api/prices').headers.get('strict-transport-security')).toBe(SECURITY[0]?.value);
    expect(at('/api/prices').headers.has('content-security-policy')).toBe(false);
    expect(at('/nowhere').headers.get('content-security-policy')).toBe(POLICY);
  });

  it('lets a later header rule win and matches the rules against the path before any rewrite', () => {
    const later = routerFor(
      {
        headers: [
          { source: '/(.*)', headers: [{ key: 'Cache-Control', value: 'first' }] },
          { source: '/today', headers: [{ key: 'cache-control', value: 'second' }] },
          { source: '/app', headers: [{ key: 'X-App', value: 'yes' }] },
        ],
        rewrites: [{ source: '/today', destination: '/app' }],
      },
      ['app'],
    );
    const outcome = later('/today');
    expect(outcome).toMatchObject({ kind: 'file', file: 'app' });
    expect(outcome.headers.get('cache-control')).toBe('second');
    expect(outcome.headers.has('x-app')).toBe(false);
  });

  it('serves the filesystem before the rewrites and rewrites only the product routes', () => {
    expect(at('/today/plan/edit')).toMatchObject({ kind: 'file', file: 'app.html' });
    expect(at('/todayx')).toMatchObject({ kind: 'missing' });
    expect(at('/nowhere')).toMatchObject({ kind: 'missing' });
    const spa = routerFor({ cleanUrls: true, rewrites: [{ source: '/(.*)', destination: '/app' }] }, [
      'app.html',
      'terms.html',
    ]);
    expect(spa('/terms')).toMatchObject({ kind: 'file', file: 'terms.html' });
    expect(spa('/nowhere')).toMatchObject({ kind: 'file', file: 'app.html' });
  });

  it('runs the function at /api and at the two rewritten API paths, and nowhere else', () => {
    expect(at('/api')).toMatchObject({ kind: 'function' });
    expect(at('/api/prices')).toMatchObject({ kind: 'function' });
    expect(at('/api/csp-report', {}, 'POST')).toMatchObject({ kind: 'function' });
    expect(at('/api/other')).toMatchObject({ kind: 'missing' });
  });

  it('holds a has condition by presence or a pattern for the whole value, a missing one by presence', () => {
    const header = (key: string, value?: string) => ({ type: 'header', key, value });
    const status = routerFor({
      routes: [
        { src: '/a', has: [header('X-Country', 'G[BR]')], missing: [header('x-preview')], status: 201 },
        { src: '/a', has: [header('x-any')], status: 202 },
      ],
    });
    const answer = (headers: Record<string, string>) => {
      const outcome = status('/a', headers);
      return outcome.kind === 'empty' ? outcome.status : outcome.kind;
    };
    expect(answer({ 'x-country': 'GB' })).toBe(201);
    expect(answer({ 'x-country': 'GR' })).toBe(201);
    expect(answer({ 'x-country': 'xGBx' })).toBe('missing');
    expect(answer({ 'x-country': 'GB', 'x-preview': '' })).toBe('missing');
    expect(answer({ 'x-any': '' })).toBe(202);
  });

  it('adds the headers of a route that continues and keeps a route to its methods', () => {
    const outcome = routerFor({
      routes: [
        { src: '/(.*)', headers: { 'X-Seen': 'yes' }, continue: true },
        { src: '/form', methods: ['post'], status: 204 },
      ],
    });
    expect(outcome('/form', {}, 'POST')).toMatchObject({ kind: 'empty', status: 204 });
    expect(outcome('/form', {}, 'POST').headers.get('x-seen')).toBe('yes');
    expect(outcome('/form')).toMatchObject({ kind: 'missing' });
    expect(outcome('/form').headers.get('x-seen')).toBe('yes');
  });

  it('fills $1 to $9 in a route header from the match of its src', () => {
    const moved = routerFor({ routes: [{ src: '/old/([^/]+)/(.*)', status: 308, headers: { Location: '/$2/$1' } }] });
    expect(moved('/old/a/b')).toMatchObject({ kind: 'empty', status: 308 });
    expect(moved('/old/a/b').headers.get('location')).toBe('/b/a');
  });

  it('refuses what it does not emulate, so a rule never passes unnoticed', () => {
    const refused = [
      [],
      { redirects: [] },
      { trailingSlash: true },
      { routes: [{ src: '/a', status: 200, transforms: [] }] },
      { routes: [{ src: '/a' }] },
      { routes: [{ src: '/a', dest: '/b', continue: true }] },
      { routes: [{ src: '/legacy/(.*)', status: 410, continue: true }] },
      { routes: [{ src: '/u/(?<id>[^/]+)', status: 308, headers: { Location: '/user/$id' } }] },
      { routes: [{ src: '/(.*)', status: 308, headers: { Location: '/$0' } }] },
      { routes: [{ src: '/(.*)', status: 308, headers: { Location: '/$12' } }] },
      { routes: [{ src: '/a', dest: 'https://example.com/' }] },
      { routes: [{ src: '/a', status: 200, has: [{ type: 'cookie', key: 'consent' }] }] },
      { routes: [{ src: '/a', status: 200, has: [{ type: 'header', key: 'x-country', value: { eq: 'GB' } }] }] },
      { routes: [{ src: '/(a', status: 200 }] },
      { rewrites: [{ source: '/a', destination: '/b?c=d' }] },
      { rewrites: [{ source: '/a/:id', destination: '/b' }] },
      { headers: [{ source: '/(.*)?', headers: [] }] },
    ];
    for (const config of refused) expect(() => createRouter(config, new Set()), JSON.stringify(config)).toThrow();
  });

  it('refuses an .html destination under cleanUrls, which Vercel serves without the extension', () => {
    const [uk] = CONFIG.routes;
    expect(() => createRouter({ ...CONFIG, routes: [{ ...uk, dest: '/not-available.html' }] }, new Set())).toThrow(
      'routes[0].dest: with cleanUrls, Vercel serves /not-available.html at /not-available',
    );
  });
});

describe('createVercelLocal', () => {
  let root = '';
  let server: Server;
  let port = 0;
  const get = (path: string, init: Parameters<typeof ask>[2] = {}) => ask(port, path, init);

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'poc-vercel-local-'));
    writeBuild(join(root, 'dist'));
    writeFileSync(join(root, 'secret.txt'), 'outside the build');
    const api = { source: '/api/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=60' }] };
    const config = { ...CONFIG, headers: [...CONFIG.headers, api] };
    server = createVercelLocal({ dir: join(root, 'dist'), config, api: FIXTURE_API });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  });

  it('serves a document with its headers, brotli at quality 3 and the policy fit for plain http', async () => {
    const answer = await get('/', { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(answer.headers['content-encoding']).toBe('br');
    expect(answer.headers.vary).toBe('Accept-Encoding');
    const quality3 = brotliCompressSync(Buffer.from(FILES['index.html']!), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 3 },
    });
    expect(answer.body.equals(quality3)).toBe(true);
    expect(answer.headers['content-length']).toBe(String(answer.body.length));
    expect(answer.headers['x-content-type-options']).toBe('nosniff');
    expect(answer.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(answer.headers['content-security-policy']).toBe(HTTP_POLICY);
  });

  it('compresses only for clients that accept brotli, and never a PNG', async () => {
    const plain = await get('/');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString()).toBe(FILES['index.html']);
    const png = await get('/icons/icon-192.png', { headers: { 'accept-encoding': 'br' } });
    expect(png.headers['content-type']).toBe('image/png');
    expect(png.headers['content-encoding']).toBeUndefined();
    expect(png.body.toString()).toBe(FILES['icons/icon-192.png']);
  });

  it('serves the build assets and security.txt with their types and headers', async () => {
    const script = await get('/assets/index-abc123.js', { headers: { 'accept-encoding': 'br' } });
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(script.headers['content-security-policy']).toBeUndefined();
    expect(brotliDecompressSync(script.body).toString()).toBe(FILES['assets/index-abc123.js']);
    const securityTxt = await get('/.well-known/security.txt');
    expect(securityTxt.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(securityTxt.body.toString()).toBe(FILES['.well-known/security.txt']);
  });

  it('answers a GB visitor with the not-available page, 451 and the route headers alone', async () => {
    const answer = await get('/today', { headers: GB });
    expect(answer.status).toBe(451);
    expect(answer.body.toString()).toBe(FILES['not-available.html']);
    expect(answer.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.headers['x-frame-options']).toBe('DENY');
    expect(answer.headers['content-security-policy']).toBe(HTTP_POLICY);
    expect(answer.headers['x-content-type-options']).toBeUndefined();
  });

  it('redirects with 308, a Location and the default Cache-Control alone, and no body', async () => {
    const answer = await get('/terms/');
    expect(answer.status).toBe(308);
    expect(answer.headers.location).toBe('/terms');
    expect(answer.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
    expect(answer.headers['x-content-type-options']).toBeUndefined();
    expect(answer.headers['strict-transport-security']).toBeUndefined();
    expect(answer.body.length).toBe(0);
    expect((await get('/terms.html')).headers.location).toBe('/terms');
  });

  it('routes the path as it arrived, so a redirect keeps its escapes and stays on this origin', async () => {
    const redirects = [
      ['/%2Fevil.example/', '/%2Fevil.example'],
      ['/%5Cevil.example/', '/%5Cevil.example'],
      ['/a%3Fb.html', '/a%3Fb'],
      ['/a%23b/', '/a%23b'],
    ];
    for (const [path = '', location] of redirects) {
      const answer = await get(path);
      expect(answer.status, path).toBe(308);
      expect(answer.headers.location, path).toBe(location);
    }
    const offline = await get('/%7Eoffline');
    expect(offline.status).toBe(200);
    expect(offline.body.toString()).toBe(FILES['~offline.html']);
  });

  it('serves a file to GET and HEAD and answers another method with 405', async () => {
    const head = await get('/terms', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(head.headers['content-length']).toBe(String(Buffer.byteLength(FILES['terms.html']!)));
    const post = await get('/today', { method: 'POST', body: 'x' });
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe('GET, HEAD');
  });

  it('answers a missing path with 404.html and 404, and never reads a file outside the build', async () => {
    for (const path of ['/nowhere', '/..%2Fsecret.txt', '/%2e%2e/secret.txt', '/assets/..%2F..%2Fsecret.txt']) {
      const answer = await get(path);
      expect(answer.status, path).toBe(404);
      expect(answer.body.toString(), path).toBe(FILES['404.html']);
    }
    expect((await get('/%E0%A4%A')).status).toBe(400);
  });

  it('runs the function with the request as sent, its headers winning over vercel.json', async () => {
    const prices = await get('/api/prices?currency=EUR', {
      headers: { origin: 'capacitor://localhost', 'accept-encoding': 'br' },
    });
    expect(prices.status).toBe(200);
    expect(JSON.parse(brotliDecompressSync(prices.body).toString())).toEqual({
      pathname: '/api/prices',
      search: '?currency=EUR',
      origin: 'capacitor://localhost',
    });
    expect(prices.headers['cache-control']).toBe('public, s-maxage=600');
    expect(prices.headers.vary).toBe('Origin, Accept-Encoding');
    expect(prices.headers['x-content-type-options']).toBe('nosniff');
    expect(prices.headers['content-security-policy']).toBeUndefined();
    const report = await get('/api/csp-report', { method: 'POST', body: '{"csp-report":{}}' });
    expect(JSON.parse(report.body.toString())).toEqual({ received: '{"csp-report":{}}' });
  });

  it("passes the function's 405 through and answers 500 when the function throws", async () => {
    const wrongMethod = await get('/api/csp-report');
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.allow).toBe('POST');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await get('/api/prices', { headers: { 'x-fail': '1' } })).status).toBe(500);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});

describe('loadApi', () => {
  it("loads the function's fetch handler from its bundle and refuses a module without one", async () => {
    const root = mkdtempSync(join(tmpdir(), 'poc-vercel-api-'));
    try {
      const handler = 'export default { fetch: (request) => new Response(new URL(request.url).pathname) };\n';
      writeFileSync(join(root, 'api.mjs'), handler);
      writeFileSync(join(root, 'none.mjs'), 'export default {};\n');
      const api = await loadApi(join(root, 'api.mjs'));
      expect(await (await api.fetch(new Request('http://localhost/api/prices'))).text()).toBe('/api/prices');
      await expect(loadApi(join(root, 'none.mjs'))).rejects.toThrow('fetch(request)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the command', () => {
  it('loads .env.local before the function, serves dist through vercel.json and says when it is ready', async () => {
    // apps/web's layout, which the defaults name.
    const root = mkdtempSync(join(tmpdir(), 'poc-vercel-command-'));
    writeBuild(join(root, 'dist'));
    writeFileSync(join(root, 'vercel.json'), JSON.stringify(CONFIG));
    mkdirSync(join(root, 'server-dist'));
    const handler =
      'const key = process.env.POC_FIXTURE_KEY ?? "unset";\nexport default { fetch: () => new Response(key) };\n';
    writeFileSync(join(root, 'server-dist', 'api.mjs'), handler);
    writeFileSync(join(root, '.env.local'), 'POC_FIXTURE_KEY=from-env-local\n');
    const script = fileURLToPath(new URL('./vercel-local.ts', import.meta.url));
    const child = spawn(process.execPath, [script, '--port', '0'], { cwd: root });
    try {
      const origin = await new Promise<string>((resolve, reject) => {
        let errors = '';
        child.stderr.on('data', (chunk: Buffer) => {
          errors += chunk.toString();
        });
        child.stdout.on('data', (chunk: Buffer) => {
          const ready = /Ready on (http:\/\/localhost:\d+)/.exec(chunk.toString());
          if (ready?.[1] !== undefined) resolve(ready[1]);
        });
        child.on('exit', (code) => reject(new Error(`the server exited with ${code}: ${errors}`)));
      });
      expect(await (await fetch(`${origin}/api`)).text()).toBe('from-env-local');
      expect((await fetch(`${origin}/terms`)).status).toBe(200);
      expect((await fetch(`${origin}/today`, { headers: GB })).status).toBe(451);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise((resolve) => {
          child.once('exit', resolve);
          child.kill();
        });
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('shouldCompress', () => {
  it('compresses the types Vercel compresses, documents included, for clients that accept brotli', () => {
    const types = [
      'text/html; charset=utf-8',
      'text/javascript; charset=utf-8',
      'application/javascript',
      'text/css',
      'application/json',
      'application/manifest+json',
      'text/plain; charset=utf-8',
      'image/svg+xml',
      'image/x-icon',
    ];
    for (const type of types) expect(shouldCompress(type, 'gzip, deflate, br'), type).toBe(true);
  });

  it('leaves the other types alone and respects clients without brotli', () => {
    for (const type of ['font/woff2', 'image/png', 'application/octet-stream', 'text/event-stream']) {
      expect(shouldCompress(type, 'br'), type).toBe(false);
    }
    expect(shouldCompress('text/html', 'gzip')).toBe(false);
    expect(shouldCompress(undefined, 'br')).toBe(false);
    expect(shouldCompress('text/html', undefined)).toBe(false);
  });
});

describe('compress', () => {
  it('round-trips at the quality Vercel answers with, so the budget is measured as served', () => {
    const body = Buffer.from('export const a = [1, 2, 3].map((n) => n * 2);'.repeat(200));
    const atVercelQuality = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 3 } });
    expect(VERCEL_BROTLI_QUALITY).toBe(3);
    expect(compress(body).equals(atVercelQuality)).toBe(true);
    expect(brotliDecompressSync(compress(body)).equals(body)).toBe(true);
  });
});
