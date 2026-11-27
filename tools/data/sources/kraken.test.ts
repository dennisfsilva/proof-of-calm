import type { CalendarDate } from '@proofofcalm/core';
import { describe, expect, it } from 'vitest';
import { RateLimited } from '../pace.ts';
import type { SourceIo } from './index.ts';
import { kraken } from './kraken.ts';

// Synthetic closes only (ADR-0036, Reading of 2026-11-27): no exchange's figure enters this file.
const NOW = new Date(Date.UTC(2026, 10, 27, 0, 30, 0));
const day = (date: string) => date as CalendarDate;
const seconds = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;
const candle = (date: string, close: unknown) => [seconds(date), '1', '1', '1', close, '1', '1', 3];
const body = (candles: unknown[]) => ({ error: [], result: { XXBTZEUR: candles, last: seconds('2026-11-27') } });

function io(answer: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const value: SourceIo = {
    now: () => NOW,
    sleep: async () => undefined,
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      return answer();
    },
  };
  return { io: value, calls };
}

const read = (answer: () => Response | Promise<Response>, from = '2026-11-20', to = '2026-11-27') => {
  if (kraken === null) throw new Error('the Kraken reader is not built');
  return kraken.closes('XBTEUR', day(from), day(to), io(answer).io);
};

describe("Kraken's reader", () => {
  it('asks for daily candles of the pair since the first day, with no header of its own', async () => {
    const fake = io(() => Response.json(body([candle('2026-11-27', '9')])));
    await kraken?.closes('XBTEUR', day('2026-11-20'), day('2026-11-26'), fake.io);
    expect(fake.calls).toHaveLength(1);
    const url = new URL(fake.calls[0]?.url ?? '');
    expect(`${url.origin}${url.pathname}`).toBe('https://api.kraken.com/0/public/OHLC');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      pair: 'XBTEUR',
      interval: '1440',
      since: String(seconds('2026-11-20') - 1),
    });
    expect(fake.calls[0]?.init?.headers).toBeUndefined();
  });

  it('drops the running candle, the last one, even when it is dated before today', async () => {
    const rows = await read(() =>
      Response.json(body([candle('2026-11-24', '1.5'), candle('2026-11-25', '2.5'), candle('2026-11-26', '3.5')])),
    );
    expect(rows).toEqual([
      { date: '2026-11-24', close: '1.5' },
      { date: '2026-11-25', close: '2.5' },
    ]);
  });

  it('keeps only complete days from `from` to `to`, none dated today or later', async () => {
    const candles = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-27', '2026-11-28', '2026-11-29'];
    const rows = await read(() => Response.json(body(candles.map((date) => candle(date, '4')))), '2026-11-20');
    expect(rows.map((row) => row.date)).toEqual(['2026-11-20', '2026-11-21']);
    const narrow = await read(() => Response.json(body(candles.map((date) => candle(date, '4')))), '2026-11-19', '2026-11-20');
    expect(narrow.map((row) => row.date)).toEqual(['2026-11-19', '2026-11-20']);
  });

  it("maps each candle's UTC epoch seconds to its UTC day", async () => {
    const rows = await read(
      () => Response.json(body([[1_764_288_000, '1', '1', '1', '7', '1', '1', 1], candle('2026-11-27', '1')])),
      '2025-01-01',
    );
    expect(rows).toEqual([{ date: '2025-11-28', close: '7' }]);
  });

  it('keeps closes as exact decimal strings and converts exponent notation exactly', async () => {
    const closes = ['12345.678900000000000123', '1.5e-7', '12E3', '0.05e1'];
    const dates = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];
    const rows = await read(() =>
      Response.json(body([...dates.map((date, i) => candle(date, closes[i])), candle('2026-11-27', '1')])),
    );
    expect(rows.map((row) => row.close)).toEqual(['12345.678900000000000123', '0.00000015', '12000', '0.5']);
  });

  it.each([
    ['a float', 1.5],
    ['a malformed exponent', '1.5e'],
    ['a zero', '0'],
    ['a negative', '-2'],
    ['a missing close', undefined],
  ])('refuses %s close without naming it', async (_, close) => {
    const answer = () => Response.json(body([candle('2026-11-25', close), candle('2026-11-27', '1')]));
    await expect(read(answer)).rejects.toThrow(/^refused: kraken XBTEUR malformed$/);
  });

  it('refuses a candle that does not start a UTC day, or two of one day', async () => {
    const offDay = [seconds('2026-11-25') + 3600, '1', '1', '1', '2', '1', '1', 1];
    await expect(read(() => Response.json(body([offDay, candle('2026-11-27', '1')])))).rejects.toThrow(
      /^refused: kraken XBTEUR malformed$/,
    );
    const twice = [candle('2026-11-25', '2'), candle('2026-11-25', '3'), candle('2026-11-27', '1')];
    await expect(read(() => Response.json(body(twice)))).rejects.toThrow(/^refused: kraken XBTEUR malformed$/);
  });

  it("refuses an answer with a non-empty `error` array, naming the status and not Kraken's words", async () => {
    const failure = await read(() => Response.json({ error: ['EQuery:Unknown asset pair'] })).catch((e: unknown) => e);
    expect((failure as Error).message).toBe('refused: kraken XBTEUR error');
    expect((failure as Error).cause).toBeUndefined();
  });

  it.each([
    ['a body that is not JSON', () => new Response('{"error":[],"result":{"secret 42.1', { status: 200 })],
    ['a body of another shape', () => Response.json({ result: { XXBTZEUR: 'secret 42.1' } })],
    ['two series', () => Response.json({ error: [], result: { A: [], B: [], last: 1 } })],
    ['a candle that is not an array', () => Response.json(body(['secret 42.1', candle('2026-11-27', '1')]))],
  ])('refuses %s as malformed, quoting none of it', async (_, answer) => {
    const failure = await read(answer).catch((e: unknown) => e);
    expect((failure as Error).message).toBe('refused: kraken XBTEUR malformed');
    expect((failure as Error).cause).toBeUndefined();
  });

  it('names the HTTP status, a limit, or an unreachable exchange, and nothing else', async () => {
    await expect(read(() => new Response('secret 42.1', { status: 503 }))).rejects.toThrow(
      /^refused: kraken XBTEUR http 503$/,
    );
    await expect(read(() => new Response('', { status: 429 }))).rejects.toThrow(/^refused: kraken XBTEUR rate limited$/);
    await expect(read(() => Promise.reject(new RateLimited()))).rejects.toThrow(/^refused: kraken XBTEUR rate limited$/);
    await expect(read(() => Promise.reject(new TypeError('fetch failed: https://x 42.1')))).rejects.toThrow(
      /^refused: kraken XBTEUR unreachable$/,
    );
  });

  it('refuses a symbol outside the listing shape before any request', async () => {
    const fake = io(() => Response.json(body([])));
    await expect(kraken?.closes('XBT/EUR?x=1', day('2026-11-20'), day('2026-11-26'), fake.io)).rejects.toThrow(
      /^refused: kraken unknown pair$/,
    );
    expect(fake.calls).toHaveLength(0);
  });
});
