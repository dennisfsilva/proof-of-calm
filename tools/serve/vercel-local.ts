// The local stand-in for Vercel (ADR-0045 §11): serves a built static directory through the vercel.json
// Vercel reads, runs the API function from its bundle and answers with brotli at Vercel's quality, so the
// e2e suite and Lighthouse see what a deployment serves (docs/ENGINEERING.md §4). From apps/web:
//   node ../../tools/serve/vercel-local.ts [--port 3000] [--dir dist] [--config vercel.json]
//     [--api server-dist/api.mjs] [--env .env.local]
// It emulates only what this repository's vercel.json uses and refuses anything else at start, so no rule
// passes unnoticed. Not emulated: the CDN cache, which also takes s-maxage and stale-while-revalidate out
// of the Cache-Control a browser receives (https://vercel.com/docs/caching/cache-control-headers).
// size-lint-allow: one server, one file, 34 tests
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { arrayBuffer } from 'node:stream/consumers';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants } from 'node:zlib';

// The types Vercel's CDN compresses (https://vercel.com/docs/how-vercel-cdn-works/compression, read
// 2026-10-17), and HTML, which that list leaves out but which Vercel was measured compressing (ADR-0024).
const COMPRESSIBLE = new Set(
  `application/json application/x-web-app-manifest+json application/geo+json application/manifest+json
  application/ld+json application/atom+xml application/rss+xml application/xhtml+xml application/xml
  application/rdf+xml application/javascript application/tar application/vnd.ms-fontobject application/wasm
  font/otf font/ttf image/svg+xml image/bmp image/x-icon
  text/cache-manifest text/css text/csv text/dns text/javascript text/plain text/markdown text/vcard
  text/calendar text/vnd.rim.location.xloc text/vtt text/x-component text/x-cross-domain-policy
  text/html`.split(/\s+/),
);

// Vercel answers with brotli quality 3, build assets and documents alike: on 2026-10-17 each script of
// the Today page arrived byte for byte as long as its quality-3 recompression (ADR-0024).
export const VERCEL_BROTLI_QUALITY = 3;

export function shouldCompress(contentType: string | undefined, acceptEncoding: string | undefined): boolean {
  const type = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return COMPRESSIBLE.has(type) && /\bbr\b/.test(acceptEncoding ?? '');
}

export function compress(body: Buffer): Buffer {
  return brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: VERCEL_BROTLI_QUALITY } });
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A `source` of vercel.json's headers or rewrites as Vercel compiles it: path-to-regexp with `strict` and
 * `sensitive`, anchored at both ends (`sourceToRegex` in Vercel's routing-utils). Literal text and unnamed
 * groups are emulated; a named parameter, a modifier or a brace group is refused, and so is what
 * path-to-regexp itself refuses.
 */
export function sourceToRegExp(source: string): RegExp {
  let pattern = '';
  for (let i = 0; i < source.length; i++) {
    const char = source.charAt(i);
    if (char === '\\') {
      i++;
      pattern += escapeRegExp(source.charAt(i));
    } else if (char === '(') {
      const end = groupEnd(source, i);
      pattern += source.slice(i, end + 1);
      i = end;
    } else if (':*+?{}'.includes(char)) {
      throw new Error(`${source}: vercel-local does not emulate "${char}" in a source.`);
    } else {
      pattern += escapeRegExp(char);
    }
  }
  return new RegExp(`^${pattern}$`);
}

/** The index of the parenthesis that closes the group opening at `start`. */
function groupEnd(source: string, start: number): number {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source.charAt(i);
    if (char === '\\') {
      i++;
    } else if (char === '(') {
      // path-to-regexp: a group may not start with "?", and a group inside it must not capture.
      const special = source.charAt(i + 1) === '?';
      if (special === (depth === 0)) throw new Error(`${source}: path-to-regexp refuses the group at ${i}.`);
      depth++;
    } else if (char === ')' && --depth === 0) {
      if (i === start + 1) throw new Error(`${source}: a group is empty (path-to-regexp).`);
      return i;
    }
  }
  throw new Error(`${source}: a group is not closed.`);
}

type Condition = { type: string; key: string; value?: unknown };
type Conditions = { has?: Condition[]; missing?: Condition[] };
type Route = Conditions & {
  src: string;
  dest?: string;
  status?: number;
  headers?: Record<string, string>;
  continue?: boolean;
  caseSensitive?: boolean;
  methods?: string[];
};
type HeaderRule = Conditions & { source: string; headers: { key: string; value: string }[] };
type Rewrite = Conditions & { source: string; destination: string };
type Config = {
  cleanUrls?: boolean;
  trailingSlash?: boolean;
  routes?: Route[];
  headers?: HeaderRule[];
  rewrites?: Rewrite[];
};

// What each object may hold. These keys of vercel.json steer only the build and the deployment.
const DEPLOYMENT_KEYS = ['$schema', 'framework', 'buildCommand', 'installCommand', 'outputDirectory', 'regions'];
const KEYS = {
  config: [...DEPLOYMENT_KEYS, 'cleanUrls', 'trailingSlash', 'routes', 'headers', 'rewrites'],
  route: ['src', 'dest', 'status', 'headers', 'has', 'missing', 'continue', 'caseSensitive', 'methods'],
  header: ['source', 'headers', 'has', 'missing'],
  rewrite: ['source', 'destination', 'has', 'missing'],
};

function refuse(where: string, what: string): never {
  throw new Error(`${where}: vercel-local does not emulate ${what}.`);
}

function only(value: unknown, keys: readonly string[], where: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where} is not an object.`);
  }
  for (const key of Object.keys(value)) if (!keys.includes(key)) refuse(where, `"${key}"`);
}

/** The configuration, once it is known to use only what this server emulates. */
function parseConfig(json: unknown): Config {
  only(json, KEYS.config, 'vercel.json');
  const config = json as Config;
  if (config.trailingSlash === true) refuse('vercel.json', 'trailingSlash true');
  const destination = (path: string, where: string) => {
    if (!/^\/[^?#:$]*$/.test(path)) refuse(where, `the destination ${path}, only a plain path of this deployment`);
    // "If cleanUrls is set to true in your project's vercel.json, do not include the file extension in the
    // source or destination path" (https://vercel.com/docs/project-configuration/vercel-json, rewrites).
    if (config.cleanUrls === true && path.endsWith('.html')) {
      throw new Error(`${where}: with cleanUrls, Vercel serves ${path} at ${path.slice(0, -'.html'.length)}.`);
    }
  };
  for (const [i, route] of (config.routes ?? []).entries()) {
    only(route, KEYS.route, `routes[${i}]`);
    // A route that continues only adds headers here; Vercel would carry its status on to what answers.
    const answers = route.dest !== undefined || route.status !== undefined;
    if ((route.continue === true) === answers) {
      refuse(`routes[${i}]`, 'a route that continues with a dest or a status, or that neither continues nor answers');
    }
    if (route.dest !== undefined) destination(route.dest, `routes[${i}].dest`);
    // Vercel reads "$" with the letters and digits 1 to 9 after it as one group name or number (its dev
    // router's resolveRouteParameters), so $12 is group 12 and $id a named group; fill reads $1 to $9.
    for (const [key, value] of Object.entries(route.headers ?? {})) {
      if (/\$(?![1-9](?![1-9A-Za-z]))/.test(value)) {
        refuse(`routes[${i}].headers.${key}`, `a "$" other than $1 to $9 (${value})`);
      }
    }
  }
  for (const [i, rule] of (config.headers ?? []).entries()) only(rule, KEYS.header, `headers[${i}]`);
  for (const [i, rule] of (config.rewrites ?? []).entries()) {
    only(rule, KEYS.rewrite, `rewrites[${i}]`);
    destination(rule.destination, `rewrites[${i}].destination`);
  }
  return config;
}

type Predicate = (headers: Headers) => boolean;

/** Every `has` condition holds and no `missing` one does. */
function conditionsOf({ has = [], missing = [] }: Conditions): Predicate {
  const present = has.map(conditionOf);
  const absent = missing.map(conditionOf);
  return (headers) => present.every((holds) => holds(headers)) && !absent.some((holds) => holds(headers));
}

/** A header condition: without a value, any value holds; a string is a pattern for the whole value. */
function conditionOf({ type, key, value }: Condition): Predicate {
  if (type !== 'header') refuse(`the condition on ${key}`, `the type ${type}, only header`);
  if (value !== undefined && typeof value !== 'string') refuse(`the condition on ${key}`, 'a value object');
  const whole = value === undefined ? undefined : new RegExp(`^(?:${value})$`);
  return (headers) => {
    const actual = headers.get(key);
    return actual !== null && (whole === undefined || whole.test(actual));
  };
}

/** `path` is the pathname as it arrived, undecoded, as Vercel's dev router matches it (`router.ts`). */
export type RouteRequest = { method: string; path: string; headers: Headers };

/** What answers a request; the server turns it into a response. */
export type Outcome =
  | { kind: 'empty'; status: number; headers: Headers }
  | { kind: 'file'; file: string; status: number; headers: Headers }
  | { kind: 'function'; headers: Headers }
  | { kind: 'missing'; headers: Headers };

type Found = { kind: 'function' } | { kind: 'file'; file: string };

// The routes routing-utils writes for cleanUrls and for trailingSlash false (convertCleanUrls,
// convertTrailingSlash), ahead of the configuration's own.
const CLEAN_URL_REDIRECTS: Route[] = [
  { src: '^/(?:(.+)/)?index(?:\\.html)?/?$', headers: { Location: '/$1' }, status: 308 },
  { src: '^/(.*)\\.html/?$', headers: { Location: '/$1' }, status: 308 },
];
const NO_TRAILING_SLASH: Route = { src: '^/(.*)\\/$', headers: { Location: '/$1' }, status: 308 };

/** apps/web/api/index.mjs answers at /api (ADR-0045 §2). */
const FUNCTION_PATH = '/api';

// A route's src is anchored, and matches without regard to case unless the route asks (routing-utils'
// normalizeRoutes; vercel.json docs, case sensitivity).
const anchored = (src: string) => `${src.startsWith('^') ? '' : '^'}${src}${src.endsWith('$') ? '' : '$'}`;

/** A route header with `$1` to `$9` filled from the match of the route's src. */
const fill = (template: string, match: RegExpExecArray) =>
  template.replace(/\$(\d)/g, (_, group: string) => match[Number(group)] ?? '');

/** The path decoded once, as the build's file names are written; undefined when malformed. */
function decoded(path: string): string | undefined {
  try {
    return decodeURIComponent(path);
  } catch {
    return undefined;
  }
}

/**
 * Routes a request through `json`, a vercel.json, in the order Vercel's routing-utils builds
 * (getTransformedRoutes): the cleanUrls and trailingSlash redirects, `routes`, `headers`, the filesystem
 * (the build's `files` and the function), then `rewrites`. A route that answers stops there with its own
 * headers; the header rules apply to whatever answers after them, matched on the requested path. Every
 * rule sees the path undecoded; only the file lookup decodes it.
 */
export function createRouter(json: unknown, files: ReadonlySet<string>): (request: RouteRequest) => Outcome {
  const config = parseConfig(json);
  const cleanUrls = config.cleanUrls === true;
  const routes = [
    ...(cleanUrls ? CLEAN_URL_REDIRECTS : []),
    ...(config.trailingSlash === false ? [NO_TRAILING_SLASH] : []),
    ...(config.routes ?? []),
  ].map((route) => ({
    ...route,
    pattern: new RegExp(anchored(route.src), route.caseSensitive === true ? '' : 'i'),
    methods: route.methods?.map((method) => method.toUpperCase()),
    holds: conditionsOf(route),
  }));
  const compile = <Rule extends Conditions & { source: string }>(rule: Rule) => ({
    ...rule,
    pattern: sourceToRegExp(rule.source),
    holds: conditionsOf(rule),
  });
  const headerRules = (config.headers ?? []).map(compile);
  const rewrites = (config.rewrites ?? []).map(compile);

  // A file by its decoded name, except an HTML file under cleanUrls, which answers only without its
  // extension; then the directory's index. Only names in `files` answer, so no path leaves the build.
  const find = (path: string): Found | undefined => {
    if (path === FUNCTION_PATH) return { kind: 'function' };
    const name = decoded(path)?.slice(1).replace(/\/$/, '');
    if (name === undefined) return undefined;
    const candidates = [
      ...(cleanUrls && name.endsWith('.html') ? [] : [name]),
      ...(cleanUrls ? [`${name}.html`] : []),
      name === '' ? 'index.html' : `${name}/index.html`,
    ];
    const file = candidates.find((candidate) => files.has(candidate));
    return file === undefined ? undefined : { kind: 'file', file };
  };
  const outcome = (found: Found | undefined, status: number, headers: Headers): Outcome => {
    if (found === undefined) return { kind: 'missing', headers };
    return found.kind === 'function' ? { kind: 'function', headers } : { ...found, status, headers };
  };

  return ({ method, path, headers: request }) => {
    const headers = new Headers();
    for (const route of routes) {
      const match = route.pattern.exec(path);
      if (match === null || !route.holds(request) || !(route.methods?.includes(method) ?? true)) continue;
      for (const [key, value] of Object.entries(route.headers ?? {})) headers.set(key, fill(value, match));
      if (route.continue === true) continue;
      if (route.dest === undefined) return { kind: 'empty', status: route.status ?? 200, headers };
      return outcome(find(route.dest), route.status ?? 200, headers);
    }
    for (const rule of headerRules) {
      if (!rule.pattern.test(path) || !rule.holds(request)) continue;
      for (const { key, value } of rule.headers) headers.set(key, value);
    }
    const found = find(path);
    if (found !== undefined) return outcome(found, 200, headers);
    const rewrite = rewrites.find((rule) => rule.pattern.test(path) && rule.holds(request));
    return outcome(rewrite === undefined ? undefined : find(rewrite.destination), 200, headers);
  };
}

/** A Vercel Function's Web Standard export, `export default { fetch(request) { … } }` (ADR-0045 §2). */
export type FetchHandler = { fetch(request: Request): Response | Promise<Response> };

const HTML_TYPE = 'text/html; charset=utf-8';
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': HTML_TYPE,
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// Vercel's default (https://vercel.com/docs/caching/cache-control-headers).
const DEFAULT_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

/** Every file under `dir`, by its path relative to it with forward slashes: the only files ever read. */
function filesIn(dir: string): Set<string> {
  return new Set(
    readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((name) => statSync(join(dir, name)).isFile())
      .map((name) => name.split(sep).join('/')),
  );
}

/** Writes a response as Vercel's CDN would send it, from this plain-http origin. */
function send(req: IncomingMessage, res: ServerResponse, status: number, headers: Headers, body: Buffer): void {
  // Over plain http WebKit upgrades every subresource to https and fails, so the directive goes, as buildCsp
  // leaves it out without https (ADR-0045 §11).
  const policy = headers.get('content-security-policy');
  if (policy !== null) {
    const directives = policy.split(';').map((directive) => directive.trim());
    const kept = directives.filter((directive) => directive !== 'upgrade-insecure-requests');
    headers.set('content-security-policy', kept.join('; '));
  }
  if (!headers.has('cache-control')) headers.set('cache-control', DEFAULT_CACHE_CONTROL);
  let payload = body;
  const compressible = body.length > 0 && !headers.has('content-encoding');
  if (compressible && shouldCompress(headers.get('content-type') ?? undefined, req.headers['accept-encoding'])) {
    payload = compress(body);
    headers.set('content-encoding', 'br');
    headers.append('vary', 'Accept-Encoding');
  }
  headers.delete('transfer-encoding');
  if (status === 204 || status === 304) headers.delete('content-length');
  else headers.set('content-length', String(payload.length));
  const cookies = headers.getSetCookie();
  res.writeHead(status, { ...Object.fromEntries(headers), ...(cookies.length > 0 ? { 'set-cookie': cookies } : {}) });
  res.end(payload);
}

/** The server, not yet listening, for the build in `dir` (read once: a deployment is fixed) and `config`. */
export function createVercelLocal({ dir, config, api }: { dir: string; config: unknown; api: FetchHandler }): Server {
  const files = filesIn(dir);
  const route = createRouter(config, files);
  const read = (file: string) => readFileSync(join(dir, file));

  async function respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    // A malformed escape is a 400. The rules then see the path undecoded: decoded, %2F would become a
    // separator in a redirect's Location (/%2Fevil.example/ to //evil.example, another origin).
    if (decoded(url.pathname) === undefined) return send(req, res, 400, new Headers(), Buffer.from('Bad request'));
    const headers = new Headers();
    for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
      headers.append(req.rawHeaders[i] ?? '', req.rawHeaders[i + 1] ?? '');
    }
    const outcome = route({ method, path: url.pathname, headers });
    switch (outcome.kind) {
      case 'empty':
        return send(req, res, outcome.status, outcome.headers, Buffer.alloc(0));
      case 'missing': {
        const page = files.has('404.html');
        outcome.headers.set('content-type', page ? HTML_TYPE : 'text/plain; charset=utf-8');
        return send(req, res, 404, outcome.headers, page ? read('404.html') : Buffer.from('Not found'));
      }
      case 'file': {
        if (outcome.status === 200 && method !== 'GET' && method !== 'HEAD') {
          outcome.headers.set('allow', 'GET, HEAD');
          return send(req, res, 405, outcome.headers, Buffer.alloc(0));
        }
        if (!outcome.headers.has('content-type')) {
          outcome.headers.set('content-type', CONTENT_TYPES[extname(outcome.file)] ?? 'application/octet-stream');
        }
        return send(req, res, outcome.status, outcome.headers, read(outcome.file));
      }
      case 'function': {
        const body = method === 'GET' || method === 'HEAD' ? null : await arrayBuffer(req);
        const response = await api.fetch(new Request(url, { method, headers, body }));
        // A function's headers win over vercel.json's (https://vercel.com/docs/caching/cdn-cache).
        response.headers.forEach((value, key) => {
          if (key === 'set-cookie') outcome.headers.append(key, value);
          else outcome.headers.set(key, value);
        });
        return send(req, res, response.status, outcome.headers, Buffer.from(await response.arrayBuffer()));
      }
    }
  }

  return createServer((req, res) => {
    respond(req, res).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) send(req, res, 500, new Headers(), Buffer.from('A server error has occurred'));
    });
  });
}

function isFetchHandler(value: unknown): value is FetchHandler {
  return typeof value === 'object' && value !== null && 'fetch' in value && typeof value.fetch === 'function';
}

/** The handler of the function's bundle, which apps/web/api/index.mjs re-exports (ADR-0045 §2). */
export async function loadApi(file: string): Promise<FetchHandler> {
  const { default: api } = (await import(pathToFileURL(file).href)) as { default?: unknown };
  if (!isFetchHandler(api)) throw new Error(`${file}: the default export has no fetch(request) (ADR-0045 §2).`);
  return api;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '3000' },
      dir: { type: 'string', default: 'dist' },
      config: { type: 'string', default: 'vercel.json' },
      api: { type: 'string', default: 'server-dist/api.mjs' },
      env: { type: 'string', default: '.env.local' },
    },
  });
  // Before the function's module loads, as it may read its configuration then; set variables win.
  if (existsSync(values.env)) process.loadEnvFile(values.env);
  const config: unknown = JSON.parse(readFileSync(values.config, 'utf8'));
  const server = createVercelLocal({ dir: resolve(values.dir), config, api: await loadApi(resolve(values.api)) });
  server.listen(Number(values.port), () => {
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : values.port;
    // Lighthouse CI and Playwright wait for this line.
    console.log(`Ready on http://localhost:${port}`);
  });
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
