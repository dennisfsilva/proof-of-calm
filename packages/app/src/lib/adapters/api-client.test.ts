import { assertNever, CalendarDateSchema, PriceSnapshotSchema } from '@proofofcalm/core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiFailure } from '../ports';
import { createApiClient } from './api-client';

const SNAPSHOT = { at: '2026-10-17T08:59:00.000Z', prices: { BTC: { EUR: '60000.12' } } };

function fakeFetch(answer: () => Promise<Response> | Response) {
  return vi.fn(async (_input: string, _init: RequestInit) => answer());
}

/** What a caller does with a failure: one branch per kind, checked by the compiler. */
function describeFailure(failure: ApiFailure): string {
  switch (failure.kind) {
    case 'network':
      return 'offline';
    case 'http':
      return `status ${failure.status}`;
    case 'invalid':
      return 'unexpected answer';
    default:
      return assertNever(failure);
  }
}

describe('createApiClient (ADR-0032)', () => {
  it('asks for JSON without cookies and returns the validated body with the headers', async () => {
    const fetch = fakeFetch(() => Response.json(SNAPSHOT, { headers: { 'x-proof-of-calm-stale': 'false' } }));
    const api = createApiClient({ baseUrl: '', fetch });
    const answer = await api.get('/api/prices', PriceSnapshotSchema, { currency: 'EUR' });
    expect(answer.ok && answer.value.data).toEqual(SNAPSHOT);
    expect(answer.ok && answer.value.headers.get('x-proof-of-calm-stale')).toBe('false');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('/api/prices?currency=EUR');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('prefixes the injectable base URL, without a doubled slash, and leaves out an empty query', async () => {
    const fetch = fakeFetch(() => Response.json('2026-10-17'));
    const api = createApiClient({ baseUrl: 'https://proofofcalm.com/', fetch });
    expect(await api.get('/api/today', CalendarDateSchema)).toEqual({
      ok: true,
      value: { data: '2026-10-17', headers: expect.any(Headers) },
    });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://proofofcalm.com/api/today');
    await expect(api.get('api/today', CalendarDateSchema)).rejects.toThrow(RangeError);
  });

  it('sends the bearer token when one is given (accounts, M3)', async () => {
    const fetch = fakeFetch(() => Response.json('2026-10-17'));
    let token: string | null = 'access-token';
    const api = createApiClient({ baseUrl: '', fetch, token: async () => token });
    await api.get('/api/sync/pull', CalendarDateSchema);
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer access-token');
    token = null;
    await api.get('/api/sync/pull', CalendarDateSchema);
    expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).has('authorization')).toBe(false);
  });

  it('turns a token getter that fails (a session refresh offline) into a network failure, not a rejection', async () => {
    const fetch = fakeFetch(() => Response.json('2026-10-17'));
    const failing = createApiClient({ baseUrl: '', fetch, token: async () => Promise.reject(new Error('refresh')) });
    expect(await failing.get('/api/sync/pull', CalendarDateSchema)).toEqual({ ok: false, error: { kind: 'network' } });
    const throwing = createApiClient({
      baseUrl: '',
      fetch,
      token: () => {
        throw new Error('no session');
      },
    });
    expect(await throwing.get('/api/sync/pull', CalendarDateSchema)).toEqual({ ok: false, error: { kind: 'network' } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('turns every failure into a value: no answer, an error status, a body that is not what was asked', async () => {
    const answers: [() => Promise<Response> | Response, string][] = [
      [() => Promise.reject(new TypeError('Failed to fetch')), 'offline'],
      [() => Response.json({ error: 'prices-unavailable' }, { status: 503 }), 'status 503'],
      [() => new Response('<html>', { status: 200 }), 'unexpected answer'],
      [() => Response.json({ at: 'yesterday', prices: {} }), 'unexpected answer'],
    ];
    for (const [answer, expected] of answers) {
      const result = await createApiClient({ baseUrl: '', fetch: fakeFetch(answer) }).get(
        '/api/prices',
        PriceSnapshotSchema,
      );
      expect(result.ok ? 'ok' : describeFailure(result.error)).toBe(expected);
    }
  });

  it('counts a body that breaks off mid-way as no answer', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.error(new TypeError('network error'));
      },
    });
    const api = createApiClient({ baseUrl: '', fetch: fakeFetch(() => new Response(body)) });
    expect(await api.get('/api/prices', PriceSnapshotSchema)).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('gives up after the timeout, as no answer', async () => {
    const fetch = vi.fn(
      (_input: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const api = createApiClient({ baseUrl: '', fetch, timeoutMs: 5 });
    expect(await api.get('/api/prices', PriceSnapshotSchema)).toEqual({ ok: false, error: { kind: 'network' } });
  });
});
