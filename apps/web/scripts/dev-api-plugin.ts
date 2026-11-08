// The dev server's API (ADR-0045 §2): under `vite`, and never in a build, a request below /api/ runs
// server/api.ts through Vite's SSR loader, so the module that answers in development is the one the
// function bundles for Vercel, with the server-side variables of apps/web/.env.local. The loader
// resolves externalized packages with the react-server condition, as scripts/bundle-api.ts does, so
// `server-only` resolves to its empty module. Production and `pnpm start` go through
// tools/serve/vercel-local.ts instead, which reads vercel.json and the bundle.
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

type FetchHandler = { fetch(request: Request): Response | Promise<Response> };

/** The module id Vite loads: server/api.ts, from the host's root. */
export const API_MODULE = '/server/api.ts';
const API_PREFIX = '/api/';

/** The Request of a node request on the given origin, with the body of anything but GET and HEAD. */
export async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const method = req.method ?? 'GET';
  const headers = new Headers();
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i] ?? '', req.rawHeaders[i + 1] ?? '');
  }
  let body: Uint8Array<ArrayBuffer> | null = null;
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    body = new Uint8Array(Buffer.concat(chunks));
  }
  return new Request(new URL(req.url ?? '/', origin), { method, headers, body });
}

/** Writes a Response to a node response: the status, every header (set-cookie repeated), the body. */
export async function sendResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== 'set-cookie') res.setHeader(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function isFetchHandler(value: unknown): value is FetchHandler {
  return typeof value === 'object' && value !== null && typeof (value as { fetch?: unknown }).fetch === 'function';
}

/** The plugin: serve only, the react-server condition for the SSR loader, the /api/ middleware. */
export function devApi(): Plugin {
  return {
    name: 'proofofcalm:dev-api',
    apply: 'serve',
    config: () => ({ ssr: { resolve: { externalConditions: ['node', 'react-server'] } } }),
    configureServer(server: ViteDevServer) {
      const envFile = join(server.config.root, '.env.local');
      if (existsSync(envFile)) process.loadEnvFile(envFile);
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(API_PREFIX)) return next();
        try {
          const { default: api } = (await server.ssrLoadModule(API_MODULE)) as { default?: unknown };
          if (!isFetchHandler(api)) {
            throw new Error(`${API_MODULE}: the default export has no fetch(request) (ADR-0045 §2).`);
          }
          const request = await toRequest(req, `http://${req.headers.host ?? 'localhost'}`);
          await sendResponse(await api.fetch(request), res);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
