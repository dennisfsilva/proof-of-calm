import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { RateLimited } from '../pace.ts';
import { bitstamp } from './bitstamp.ts';
import type { SourceIo } from './index.ts';

// Synthetic closes only (ADR-0036, Reading of 2026-11-27): no exchange's figure enters this file.
const NOW = new Date(Date.UTC(2026, 10, 27, 0, 30, 0));
const day = (date: string) => date as CalendarDate;
const seconds = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;
const candle = (date: string, close: unknown) => ({
  timestamp: String(seconds(date)),
  open: '1',
  high: '1',
  low: '1',
  close,
  volume: '1',
});
const body = (candles: unknown[]) => ({ data: { pair: 'BTC/EUR', ohlc: candles } });

function io(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const value: SourceIo = {
    now: () => NOW,
    sleep: async () => undefined,
    timeout: () => new AbortController().signal,
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      return answer();
    },
  };
  return { io: value, calls };
}

const read = (answer: () => Response | Promise<Response>, from = '2026-01-01', to = '2026-11-27') => {
  if (bitstamp === null) throw new Error('the Bitstamp reader is not built');
  return bitstamp.closes('btceur', day(from), day(to), io(answer).io);
};

describe("Bitstamp's reader", () => {
  it("asks for yesterday's daily candle only, without the open one and with no header of its own", async () => {
    const fake = io(() => Response.json(body([candle('2026-11-26', '2')])));
    const rows = await bitstamp?.closes('btceur', day('2026-01-01'), day('2026-11-27'), fake.io);
    expect(rows).toEqual([{ date: '2026-11-26', close: '2' }]);
    expect(fake.calls).toHaveLength(1);
    const url = new URL(fake.calls[0]?.url ?? '');
    expect(`${url.origin}${url.pathname}`).toBe('https://www.bitstamp.net/api/v2/ohlc/btceur/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      step: '86400',
      limit: '1',
      start: String(seconds('2026-11-26')),
      exclude_current_candle: 'true',
    });
    expect(fake.calls[0]?.init?.headers).toBeUndefined();
  });

  it('asks nothing when yesterday is outside `from` to `to`: there is no catch-up', async () => {
    const fake = io(() => Response.json(body([candle('2026-11-20', '2')])));
    expect(await bitstamp?.closes('btceur', day('2026-11-01'), day('2026-11-20'), fake.io)).toEqual([]);
    expect(await bitstamp?.closes('btceur', day('2026-11-27'), day('2026-11-30'), fake.io)).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it('drops a candle dated other than yesterday', async () => {
    const candles = [candle('2026-11-25', '1'), candle('2026-11-26', '2'), candle('2026-11-27', '3')];
    expect(await read(() => Response.json(body(candles)))).toEqual([{ date: '2026-11-26', close: '2' }]);
    expect(await read(() => Response.json(body([candle('2026-11-27', '3')])))).toEqual([]);
    expect(await read(() => Response.json(body([])))).toEqual([]);
  });

  it('keeps the close an exact decimal string and converts exponent notation exactly', async () => {
    expect(await read(() => Response.json(body([candle('2026-11-26', '98765.432100000000000001')])))).toEqual([
      { date: '2026-11-26', close: '98765.432100000000000001' },
    ]);
    expect(await read(() => Response.json(body([candle('2026-11-26', '2.5E-6')])))).toEqual([
      { date: '2026-11-26', close: '0.0000025' },
    ]);
  });

  it.each([
    ['a float close', candle('2026-11-26', 2.5)],
    ['a malformed close', candle('2026-11-26', '2,5')],
    ['a zero close', candle('2026-11-26', '0')],
    ['a timestamp that is not whole seconds', { ...candle('2026-11-26', '2'), timestamp: '1.5e9' }],
    [
      'a timestamp that does not start a UTC day',
      { ...candle('2026-11-26', '2'), timestamp: String(seconds('2026-11-26') + 60) },
    ],
  ])('refuses %s without naming it', async (_, bad) => {
    await expect(read(() => Response.json(body([bad])))).rejects.toThrow(/^refused: bitstamp btceur malformed$/);
  });

  it.each([
    ['a body that is not JSON', () => new Response('{"data":{"ohlc":[{"close":"secret 42.1', { status: 200 })],
    ['a body of another shape', () => Response.json({ data: { ohlc: 'secret 42.1' } })],
  ])('refuses %s as malformed, quoting none of it', async (_, answer) => {
    const failure = await read(answer).catch((e: unknown) => e);
    expect((failure as Error).message).toBe('refused: bitstamp btceur malformed');
    expect((failure as Error).cause).toBeUndefined();
  });

  it("refuses an error answer, naming the status and not Bitstamp's words", async () => {
    const answer = () => Response.json({ errors: [{ message: 'secret 42.1' }], code: 'API0001' });
    await expect(read(answer)).rejects.toThrow(/^refused: bitstamp btceur error$/);
    await expect(read(() => new Response('secret 42.1', { status: 404 }))).rejects.toThrow(
      /^refused: bitstamp btceur http 404$/,
    );
    await expect(read(() => new Response('', { status: 429 }))).rejects.toThrow(
      /^refused: bitstamp btceur rate limited$/,
    );
    await expect(read(() => Promise.reject(new RateLimited()))).rejects.toThrow(
      /^refused: bitstamp btceur rate limited$/,
    );
    await expect(read(() => Promise.reject(new TypeError('fetch failed: https://x 42.1')))).rejects.toThrow(
      /^refused: bitstamp btceur unreachable$/,
    );
  });

  it('refuses a symbol outside the listing shape before any request', async () => {
    const fake = io(() => Response.json(body([])));
    await expect(bitstamp?.closes('../btceur', day('2026-01-01'), day('2026-11-27'), fake.io)).rejects.toThrow(
      /^refused: bitstamp unknown pair$/,
    );
    expect(fake.calls).toHaveLength(0);
  });
});
