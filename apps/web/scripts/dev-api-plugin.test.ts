import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { ConfigEnv, Connect, UserConfig, ViteDevServer } from 'vite';
import { describe, expect, it, vi } from 'vitest';
import { API_MODULE, devApi, sendResponse, toRequest } from './dev-api-plugin.ts';

type Init = { method: string; url: string; rawHeaders?: string[]; body?: string };

function incoming({ method, url, rawHeaders = [], body }: Init): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  const node = Object.assign(stream, { method, url, rawHeaders, headers: { host: 'localhost:3000' } });
  return node as unknown as IncomingMessage;
}

class FakeServerResponse {
  statusCode = 0;
  readonly headers = new Map<string, string | string[]>();
  body: Buffer | undefined;
  setHeader(name: string, value: string | string[]) {
    this.headers.set(name, value);
  }
  end(body: Buffer) {
    this.body = body;
  }
}
const outgoing = () => new FakeServerResponse();
const asNode = (res: FakeServerResponse) => res as unknown as ServerResponse;

describe('toRequest', () => {
  it('maps the method, the URL on the origin and the headers; a GET has no body', async () => {
    const request = await toRequest(
      incoming({ method: 'GET', url: '/api/prices?ids=btc', rawHeaders: ['Accept', 'application/json'] }),
      'http://localhost:3000',
    );
    expect(request.method).toBe('GET');
    expect(request.url).toBe('http://localhost:3000/api/prices?ids=btc');
    expect(request.headers.get('accept')).toBe('application/json');
    expect(request.body).toBeNull();
  });

  it('carries the body of a POST', async () => {
    const request = await toRequest(incoming({ method: 'POST', url: '/api/csp-report', body: '{"a":1}' }), 'http://h');
    expect(await request.text()).toBe('{"a":1}');
  });
});

describe('sendResponse', () => {
  it('writes the status, the headers, every set-cookie and the body', async () => {
    const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
    headers.append('set-cookie', 'a=1');
    headers.append('set-cookie', 'b=2');
    const res = outgoing();
    await sendResponse(new Response('{"ok":true}', { status: 201, headers }), asNode(res));
    expect(res.statusCode).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toEqual(['a=1', 'b=2']);
    expect(res.body?.toString()).toBe('{"ok":true}');
  });
});

describe('devApi', () => {
  const env: ConfigEnv = { command: 'serve', mode: 'development' };

  it('applies to the dev server only and gives the SSR loader the react-server condition', () => {
    const plugin = devApi();
    expect(plugin.apply).toBe('serve');
    const config = (plugin.config as (config: UserConfig, env: ConfigEnv) => UserConfig)({}, env);
    expect(config.ssr?.resolve?.externalConditions).toEqual(['node', 'react-server']);
  });

  function serve(api: unknown) {
    let handler: Connect.NextHandleFunction | undefined;
    const ssrLoadModule = vi.fn(async () => ({ default: api }));
    const server = {
      config: { root: 'P:/nowhere' },
      middlewares: {
        use: (fn: Connect.NextHandleFunction) => {
          handler = fn;
        },
      },
      ssrLoadModule,
    } as unknown as ViteDevServer;
    (devApi().configureServer as (server: ViteDevServer) => void)(server);
    if (handler === undefined) throw new Error('no middleware');
    return { handler, ssrLoadModule };
  }

  it('answers /api/* from server/api.ts and leaves every other path to Vite', async () => {
    const fetch = vi.fn(async (request: Request) => new Response(new URL(request.url).pathname, { status: 200 }));
    const { handler, ssrLoadModule } = serve({ fetch });
    const res = outgoing();
    const next = vi.fn();
    await handler(incoming({ method: 'GET', url: '/api/prices' }), asNode(res), next);
    expect(ssrLoadModule).toHaveBeenCalledWith(API_MODULE);
    expect(res.body?.toString()).toBe('/api/prices');
    expect(next).not.toHaveBeenCalled();

    await handler(incoming({ method: 'GET', url: '/today' }), asNode(outgoing()), next);
    expect(next).toHaveBeenCalledWith();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('passes a module without a fetch handler to Vite as an error', async () => {
    const { handler } = serve({});
    const next = vi.fn();
    await handler(incoming({ method: 'GET', url: '/api/prices' }), asNode(outgoing()), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('fetch(request)') }));
  });
});
