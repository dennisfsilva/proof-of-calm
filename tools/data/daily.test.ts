// The daily job (daily.md): its windows, its pacing per exchange, what it writes, and every line it prints,
// all of the closed set. The exchanges are a fake fetch with synthetic closes; the entry's refusals run as
// the job runs, one node start each, before any request.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, type CalendarDate } from '@proofofcalm/core';
import type { Exchange } from '@proofofcalm/data';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DailyOptions, line, runDaily } from './daily.ts';
import { REQUEST_TIMEOUT_MS } from './pace.ts';
import { PAIRS } from './pairs.ts';
import { dayStart } from './sources/read.ts';
import type { Source, SourceIo } from './sources/source.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const TODAY = '2026-11-27' as CalendarDate;
const YESTERDAY = addDays(TODAY, -1);

// Every line the job may print (daily.md, Output).
const CLOSED = [
  /^(kraken|bitstamp) (EUR|USD): \d+ pairs, \d+ added, \d+ revised, \d+ failed( \(dry: nothing written\))?$/,
  /^(kraken|bitstamp|coinbase): off$/,
  /^refused: (kraken|bitstamp) [A-Za-z0-9]{1,24} (rate limited|unreachable|http \d{3}|error|malformed|unexpected error)$/,
];

const count = (exchange: Exchange, quote: 'EUR' | 'USD') =>
  Object.values(PAIRS).filter((venues) => venues[exchange]?.[quote] !== undefined).length;

type Request = { url: URL; at: number };

// Synthetic exchanges: Kraken's three complete days before today and the running one, Bitstamp's yesterday.
function exchanges(options: { close?: string; fail?: string } = {}) {
  const close = options.close ?? '1.5';
  const requests: Request[] = [];
  let clock = Date.parse(`${TODAY}T01:17:00Z`);
  let timeouts = 0;
  const io: SourceIo = {
    now: () => new Date(clock),
    sleep: async (ms) => {
      clock += ms;
    },
    timeout: (ms) => {
      expect(ms).toBe(REQUEST_TIMEOUT_MS);
      timeouts += 1;
      return new AbortController().signal;
    },
    fetch: async (input) => {
      const url = new URL(String(input));
      requests.push({ url, at: clock });
      if (url.hostname === 'api.kraken.com') {
        const pair = url.searchParams.get('pair') ?? '';
        if (pair === options.fail) return new Response('', { status: 500 });
        const days = [-3, -2, -1, 0].map((offset) => dayStart(addDays(TODAY, offset)));
        return Response.json({
          error: [],
          result: { [pair]: days.map((day) => [day, '1', '1', '1', close]), last: 0 },
        });
      }
      if (url.hostname === 'www.bitstamp.net') {
        return Response.json({ data: { pair: 'X/Y', ohlc: [{ timestamp: String(dayStart(YESTERDAY)), close }] } });
      }
      throw new Error('no network in tests');
    },
  };
  return { io, requests, timeouts: () => timeouts };
}

let store: string;
beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), 'daily-store-'));
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

async function run(io: SourceIo, options: Partial<DailyOptions> = {}, sources?: Record<Exchange, Source | null>) {
  const out: string[] = [];
  const err: string[] = [];
  const print = { out: (text: string) => out.push(text), err: (text: string) => err.push(text) };
  const clean = await runDaily({ store, dry: false, today: TODAY, ...options }, io, print, sources);
  for (const text of [...out, ...err]) expect(CLOSED.some((pattern) => pattern.test(text))).toBe(true);
  return { clean, out, err };
}

const summary = (exchange: Exchange, quote: 'EUR' | 'USD', added: number, revised = 0, failed = 0, tail = '') =>
  `${exchange} ${quote}: ${count(exchange, quote)} pairs, ${added} added, ${revised} revised, ${failed} failed${tail}`;
const file = (exchange: Exchange, pair: string) => join(store, 'closes', exchange, `${pair}.csv`);

describe('runDaily', () => {
  it('fills every pair of each exchange in SOURCES order and prints one line per exchange and quote', async () => {
    const { clean, out, err } = await run(exchanges().io);
    expect(err).toEqual([]);
    expect(out).toEqual([
      summary('kraken', 'EUR', 3 * count('kraken', 'EUR')),
      summary('kraken', 'USD', 3 * count('kraken', 'USD')),
      summary('bitstamp', 'EUR', count('bitstamp', 'EUR')),
      summary('bitstamp', 'USD', count('bitstamp', 'USD')),
      'coinbase: off',
    ]);
    expect(clean).toBe(true);
    const days = [-3, -2, -1].map((offset) => `${addDays(TODAY, offset)},1.5\n`);
    expect(readFileSync(file('kraken', 'BTC-EUR'), 'utf8')).toBe(`date,close\n${days.join('')}`);
    expect(readFileSync(file('bitstamp', 'BTC-USD'), 'utf8')).toBe(`date,close\n${YESTERDAY},1.5\n`);
    expect(existsSync(join(store, 'closes', 'coinbase'))).toBe(false);
  });

  it('reads Kraken from 720 days back and Bitstamp from yesterday, each through its own pacer', async () => {
    const { io, requests, timeouts } = exchanges();
    await run(io);
    const kraken = requests.filter(({ url }) => url.hostname === 'api.kraken.com');
    const bitstamp = requests.filter(({ url }) => url.hostname === 'www.bitstamp.net');
    expect(kraken).toHaveLength(count('kraken', 'EUR') + count('kraken', 'USD'));
    expect(bitstamp).toHaveLength(count('bitstamp', 'EUR') + count('bitstamp', 'USD'));
    for (const { url } of kraken)
      expect(url.searchParams.get('since')).toBe(String(dayStart(addDays(TODAY, -720)) - 1));
    for (const { url } of bitstamp) expect(url.searchParams.get('start')).toBe(String(dayStart(YESTERDAY)));
    for (const list of [kraken, bitstamp]) {
      for (const [index, { at }] of list.entries()) if (index > 0) expect(at - (list[index - 1]?.at ?? 0)).toBe(1000);
    }
    // A fresh pacer for Bitstamp: its first request does not wait for Kraken's next slot.
    expect(bitstamp[0]?.at).toBe(kraken.at(-1)?.at);
    expect(timeouts()).toBe(requests.length);
  });

  it('adds nothing on a second run, and counts a revised close without writing it', async () => {
    await run(exchanges().io);
    const before = readFileSync(file('kraken', 'ETH-USD'), 'utf8');
    const again = await run(exchanges().io);
    expect(again.out[0]).toBe(summary('kraken', 'EUR', 0));
    const revised = await run(exchanges({ close: '2.5' }).io);
    expect(revised.out[0]).toBe(summary('kraken', 'EUR', 0, 3 * count('kraken', 'EUR')));
    expect(revised.out[2]).toBe(summary('bitstamp', 'EUR', 0, count('bitstamp', 'EUR')));
    expect(readFileSync(file('kraken', 'ETH-USD'), 'utf8')).toBe(before);
  });

  it('writes nothing under --dry and says so on each count line', async () => {
    const { clean, out } = await run(exchanges().io, { dry: true });
    expect(out[0]).toBe(summary('kraken', 'EUR', 3 * count('kraken', 'EUR'), 0, 0, ' (dry: nothing written)'));
    expect(out[3]).toBe(summary('bitstamp', 'USD', count('bitstamp', 'USD'), 0, 0, ' (dry: nothing written)'));
    expect(clean).toBe(true);
    expect(existsSync(join(store, 'closes'))).toBe(false);
  });

  it('counts a failed pair, prints its refusal and still writes every other pair', async () => {
    const { clean, out, err } = await run(exchanges({ fail: 'XBTEUR' }).io);
    expect(err).toEqual(['refused: kraken XBTEUR http 500']);
    expect(out[0]).toBe(summary('kraken', 'EUR', 3 * (count('kraken', 'EUR') - 1), 0, 1));
    expect(out[1]).toBe(summary('kraken', 'USD', 3 * count('kraken', 'USD')));
    expect(clean).toBe(false);
    expect(existsSync(file('kraken', 'BTC-EUR'))).toBe(false);
    expect(existsSync(file('kraken', 'ETH-EUR'))).toBe(true);
  });

  it('prints a fixed line for a reader error outside the closed set, never its message', async () => {
    const thrower: Source = {
      exchange: 'kraken',
      closes: async (pair) => {
        if (pair === 'XBTUSD') throw new TypeError('close 61234.5 at https://api.kraken.com');
        if (pair === 'ETHUSD') throw new Error('refused: kraken ETHUSD 61234.5');
        return [];
      },
    };
    const { clean, out, err } = await run(exchanges().io, {}, { kraken: thrower, bitstamp: null, coinbase: null });
    expect(err).toEqual(['refused: kraken XBTUSD unexpected error', 'refused: kraken ETHUSD unexpected error']);
    expect(out.at(-2)).toBe('bitstamp: off');
    expect(clean).toBe(false);
  });

  it('stops at a malformed store file with the store’s own refusal', async () => {
    mkdirSync(join(store, 'closes', 'kraken'), { recursive: true });
    writeFileSync(file('kraken', 'AAVE-EUR'), 'date,close\n2026-11-01,61234.5,x\n');
    const error = await run(exchanges().io).catch((caught: unknown) => caught);
    expect(line(error)).toBe('refused: closes/kraken/AAVE-EUR.csv is malformed');
  });
});

describe('line', () => {
  it('passes the store’s closed refusals and replaces anything else with one fixed line', () => {
    expect(line(new Error('refused: closes/bitstamp/BTC-USD.csv cannot be written (ENOSPC)'))).toBe(
      'refused: closes/bitstamp/BTC-USD.csv cannot be written (ENOSPC)',
    );
    expect(line(new Error('refused: closes/kraken/BTC-EUR.csv is 61234.5'))).toBe('daily refused: unexpected error');
    expect(line(new SyntaxError('Unexpected token 6 in JSON at 61234.5'))).toBe('daily refused: unexpected error');
    expect(line('61234.5')).toBe('daily refused: unexpected error');
  });
});

// The entry as the job runs it: each refusal comes before any request.
const daily = (...args: string[]) =>
  spawnSync(process.execPath, ['--import', './tools/data/hooks.ts', 'tools/data/daily.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20_000,
  });

describe('the entry', () => {
  it.each([
    ['no arguments', []],
    ['no --store', ['--dry']],
    ['an unknown flag', ['--store', '.', '--since', '2026-01-01']],
    ['a positional', ['--store', '.', 'extra']],
    ['a --today that is not a date', ['--store', '.', '--today', '2026-02-30']],
  ])('refuses %s with the usage line', { timeout: 30_000 }, (_, args) => {
    const result = daily(...args);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('daily refused: usage\n');
    expect(result.status).toBe(1);
  });

  it('refuses a store inside this repository', { timeout: 30_000 }, () => {
    const result = daily('--store', join(root, 'node_modules', '.daily-store'), '--dry');
    expect(result.stderr).toBe('daily refused: --store is inside this repository\n');
    expect(result.status).toBe(1);
  });

  it('refuses a store that is not a folder', { timeout: 30_000 }, () => {
    const path = join(store, 'file');
    writeFileSync(path, '');
    const result = daily('--store', path, '--dry', '--today', TODAY);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('daily refused: --store is not a folder\n');
    expect(result.status).toBe(1);
  });
});
