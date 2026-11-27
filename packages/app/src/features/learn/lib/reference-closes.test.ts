import type { CoinId } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { closesPath, loadReferenceCloses, toPriceHistory } from './reference-closes';

// The simulator's price history (docs/EDUCATION.md §7 and §8, packages/data/README.md): one dataset file per coin
// at a relative path, parsed with the data package's schema. Synthetic figures only (ADR-0036, Reading of
// 2026-11-27): no exchange's close enters this repository.

const BTC = 'BTC' as CoinId;
const DATASET = {
  coin: 'BTC',
  currency: 'EUR',
  days: [
    { date: '2026-01-01', close: '100.5', sources: 2 },
    { date: '2026-01-02', close: '101', sources: 2 },
  ],
};

const answering =
  (response: () => Response): typeof fetch =>
  async () =>
    response();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('loadReferenceCloses', () => {
  it('asks for the coin’s file at the relative path', async () => {
    const asked: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      asked.push(String(input));
      return json(DATASET);
    };
    await loadReferenceCloses(BTC, fetcher);
    expect(asked).toEqual(['/data/prices/BTC-EUR.json']);
    expect(closesPath('ETH' as CoinId)).toBe('/data/prices/ETH-EUR.json');
  });

  it('a 404 is unpublished', async () => {
    const result = await loadReferenceCloses(
      BTC,
      answering(() => new Response('Not found', { status: 404 })),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'unpublished' } });
  });

  it('a TypeError from the fetch is offline', async () => {
    const fetcher: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await loadReferenceCloses(BTC, fetcher)).toEqual({ ok: false, error: { kind: 'offline' } });
  });

  it('sends no credentials and a signal that ends the request', async () => {
    const inits: (RequestInit | undefined)[] = [];
    const fetcher: typeof fetch = async (_, init) => {
      inits.push(init);
      return json(DATASET);
    };
    await loadReferenceCloses(BTC, fetcher);
    expect(inits).toHaveLength(1);
    expect(inits[0]?.credentials).toBe('omit');
    expect(inits[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('a connection that stalls is offline once the timeout ends it', async () => {
    // Settles only when its signal aborts, as the platform's fetch does on a connection never answered.
    const stalling: typeof fetch = (_, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const started = Date.now();
    expect(await loadReferenceCloses(BTC, stalling, 20)).toEqual({ ok: false, error: { kind: 'offline' } });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it.each([500, 502, 503])('a %i is offline', async (status) => {
    const result = await loadReferenceCloses(
      BTC,
      answering(() => new Response('', { status })),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'offline' } });
  });

  it('a file of another coin is invalid', async () => {
    const result = await loadReferenceCloses(
      BTC,
      answering(() => json({ ...DATASET, coin: 'ETH' })),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it.each([
    ['a close as a number', { ...DATASET, days: [{ date: '2026-01-01', close: 100, sources: 2 }] }],
    ['another currency', { ...DATASET, currency: 'USD' }],
    ['dates out of order', { ...DATASET, days: [...DATASET.days].reverse() }],
    ['no day at all', { ...DATASET, days: [] }],
  ])('a file with %s is invalid', async (_, body) => {
    const result = await loadReferenceCloses(
      BTC,
      answering(() => json(body)),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('a body that is not JSON is invalid', async () => {
    const result = await loadReferenceCloses(
      BTC,
      answering(() => new Response('<!doctype html><title>App</title>', { status: 200 })),
    );
    expect(result).toEqual({ ok: false, error: { kind: 'invalid' } });
  });

  it('a valid file is ok, with its days as written', async () => {
    const result = await loadReferenceCloses(
      BTC,
      answering(() => json(DATASET)),
    );
    expect(result).toEqual({ ok: true, value: DATASET });
  });
});

describe('toPriceHistory', () => {
  it('gives the simulation its closes as decimal strings, in date order', async () => {
    const result = await loadReferenceCloses(
      BTC,
      answering(() => json(DATASET)),
    );
    if (!result.ok) throw new Error('the fixture did not load');
    expect(toPriceHistory(result.value)).toEqual([
      ['2026-01-01', '100.5'],
      ['2026-01-02', '101'],
    ]);
  });
});
