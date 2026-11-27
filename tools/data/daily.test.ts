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
import { dayStart, utcToday } from './sources/read.ts';
import type { Source, SourceIo } from './sources/source.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const TODAY = '2026-11-27' as CalendarDate;
const YESTERDAY = addDays(TODAY, -1);

// Every line the job may print (daily.md, Output).
const CLOSED = [
  /^(kraken|bitstamp) (EUR|USD): \d+ pairs, \d+ added, \d+ revised, \d+ failed( \(dry: nothing written\))?$/,
  /^(kraken|bitstamp|coinbase): off$/,
  /^kraken: stopped after 3 unreachable$/,
  /^refused: (kraken|bitstamp) [A-Za-z0-9]{1,24} (rate limited|unreachable|http \d{3}|error|malformed|out of window|unexpected error)$/,
  /^refused: closes\/(kraken|bitstamp)\/[A-Z0-9]{1,12}-(EUR|USD)\.csv (is malformed|rows are malformed|cannot be (read|written) \([A-Z][A-Z0-9_]{0,31}\))$/,
];

const count = (exchange: Exchange, quote: 'EUR' | 'USD') =>
  Object.values(PAIRS).filter((venues) => venues[exchange]?.[quote] !== undefined).length;
const symbols = (exchange: Exchange, quote: 'EUR' | 'USD') =>
  Object.values(PAIRS).flatMap((venues) => venues[exchange]?.[quote] ?? []);
// The store's pair names in the job's order (`BTC-EUR`).
const pairs = (exchange: Exchange, quote: 'EUR' | 'USD') =>
  Object.entries(PAIRS).flatMap(([coin, venues]) =>
    venues[exchange]?.[quote] === undefined ? [] : [`${coin}-${quote}`],
  );

// The daily step's own timeout in the store's workflow (closes-store.yml), in milliseconds.
const STEP_TIMEOUT_MS =
  Number(
    /- name: Append the closes\n(?: {8}.*\n)*? {8}timeout-minutes: (\d+)\n/.exec(
      readFileSync(join(root, 'tools/data/closes-store.yml'), 'utf8').replaceAll('\r\n', '\n'),
    )?.[1] ?? Number.NaN,
  ) * 60_000;

type Request = { url: URL; at: number };

// Synthetic exchanges. Kraken: the three complete days before the clock's UTC day and the running one,
// or, stalled, no answer until the try's timeout. Bitstamp: the daily candle of the day it is asked for,
// or, for its first `bitstampDown` requests, no answer until the try's timeout.
function exchanges(
  options: { bitstampDown?: number; close?: string; fail?: string; start?: string; stall?: boolean } = {},
) {
  const close = options.close ?? '1.5';
  const requests: Request[] = [];
  let clock = Date.parse(options.start ?? `${TODAY}T01:17:00Z`);
  let timeouts = 0;
  let bitstampDown = options.bitstampDown ?? 0;
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
        if (options.stall) {
          clock += REQUEST_TIMEOUT_MS;
          throw new DOMException('The operation timed out.', 'TimeoutError');
        }
        const pair = url.searchParams.get('pair') ?? '';
        if (pair === options.fail) return new Response('', { status: 500 });
        const days = [-3, -2, -1, 0].map((offset) => dayStart(addDays(utcToday(new Date(clock)), offset)));
        return Response.json({
          error: [],
          result: { [pair]: days.map((day) => [day, '1', '1', '1', close]), last: 0 },
        });
      }
      if (url.hostname === 'www.bitstamp.net') {
        if (bitstampDown > 0) {
          bitstampDown -= 1;
          clock += REQUEST_TIMEOUT_MS;
          throw new DOMException('The operation timed out.', 'TimeoutError');
        }
        const start = url.searchParams.get('start') ?? '';
        return Response.json({ data: { pair: 'X/Y', ohlc: [{ timestamp: start, close }] } });
      }
      throw new Error('no network in tests');
    },
  };
  return {
    io,
    requests,
    timeouts: () => timeouts,
    elapsed: () => clock - Date.parse(options.start ?? `${TODAY}T01:17:00Z`),
  };
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
  it('fills every pair, Bitstamp first, then Kraken, and prints one line per exchange and quote', async () => {
    const { clean, out, err } = await run(exchanges().io);
    expect(err).toEqual([]);
    expect(out).toEqual([
      summary('bitstamp', 'EUR', count('bitstamp', 'EUR')),
      summary('bitstamp', 'USD', count('bitstamp', 'USD')),
      summary('kraken', 'EUR', 3 * count('kraken', 'EUR')),
      summary('kraken', 'USD', 3 * count('kraken', 'USD')),
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
    // A fresh pacer for Kraken: its first request does not wait for Bitstamp's next slot.
    expect(kraken[0]?.at).toBe(bitstamp.at(-1)?.at);
    expect(timeouts()).toBe(requests.length);
  });

  it('adds nothing on a second run, and counts a revised close without writing it', async () => {
    await run(exchanges().io);
    const before = readFileSync(file('kraken', 'ETH-USD'), 'utf8');
    const again = await run(exchanges().io);
    expect(again.out[2]).toBe(summary('kraken', 'EUR', 0));
    const revised = await run(exchanges({ close: '2.5' }).io);
    expect(revised.out[2]).toBe(summary('kraken', 'EUR', 0, 3 * count('kraken', 'EUR')));
    expect(revised.out[0]).toBe(summary('bitstamp', 'EUR', 0, count('bitstamp', 'EUR')));
    expect(readFileSync(file('kraken', 'ETH-USD'), 'utf8')).toBe(before);
  });

  it('writes nothing under --dry and says so on each count line', async () => {
    const { clean, out } = await run(exchanges().io, { dry: true });
    expect(out[2]).toBe(summary('kraken', 'EUR', 3 * count('kraken', 'EUR'), 0, 0, ' (dry: nothing written)'));
    expect(out[1]).toBe(summary('bitstamp', 'USD', count('bitstamp', 'USD'), 0, 0, ' (dry: nothing written)'));
    expect(clean).toBe(true);
    expect(existsSync(join(store, 'closes'))).toBe(false);
  });

  it('counts a failed pair, prints its refusal and still writes every other pair', async () => {
    const { clean, out, err } = await run(exchanges({ fail: 'XBTEUR' }).io);
    expect(err).toEqual(['refused: kraken XBTEUR http 500']);
    expect(out[2]).toBe(summary('kraken', 'EUR', 3 * (count('kraken', 'EUR') - 1), 0, 1));
    expect(out[3]).toBe(summary('kraken', 'USD', 3 * count('kraken', 'USD')));
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
    expect(out[0]).toBe('bitstamp: off');
    expect(clean).toBe(false);
  });

  it('stops Kraken after 3 unreachable pairs, counting the rest as failed, with Bitstamp’s day kept', async () => {
    const { io, requests, elapsed } = exchanges({ stall: true });
    const { clean, out, err } = await run(io);
    const unread = symbols('kraken', 'EUR').slice(0, 3);
    expect(err).toEqual([
      ...unread.map((symbol) => `refused: kraken ${symbol} unreachable`),
      'kraken: stopped after 3 unreachable',
    ]);
    expect(out).toEqual([
      summary('bitstamp', 'EUR', count('bitstamp', 'EUR')),
      summary('bitstamp', 'USD', count('bitstamp', 'USD')),
      summary('kraken', 'EUR', 0, 0, count('kraken', 'EUR')),
      summary('kraken', 'USD', 0, 0, count('kraken', 'USD')),
      'coinbase: off',
    ]);
    expect(clean).toBe(false);
    expect(requests.filter(({ url }) => url.hostname === 'api.kraken.com')).toHaveLength(3);
    expect(readFileSync(file('bitstamp', 'ETH-EUR'), 'utf8')).toBe(`date,close\n${YESTERDAY},1.5\n`);
    expect(existsSync(join(store, 'closes', 'kraken'))).toBe(false);
    // Well inside the daily step's own timeout, so the commit step keeps Bitstamp's day.
    expect(STEP_TIMEOUT_MS).toBeGreaterThan(0);
    expect(elapsed()).toBeLessThan(STEP_TIMEOUT_MS / 2);
  });

  it.each([3, 4])(
    'never stops Bitstamp, whose day cannot be read again: after %i unreachable pairs it reads the rest',
    async (down) => {
      const { io, requests } = exchanges({ bitstampDown: down, stall: true });
      const { clean, out, err } = await run(io);
      const unreachable = symbols('bitstamp', 'EUR').slice(0, down);
      expect(err).toEqual([
        ...unreachable.map((symbol) => `refused: bitstamp ${symbol} unreachable`),
        ...symbols('kraken', 'EUR')
          .slice(0, 3)
          .map((symbol) => `refused: kraken ${symbol} unreachable`),
        'kraken: stopped after 3 unreachable',
      ]);
      expect(out.slice(0, 2)).toEqual([
        summary('bitstamp', 'EUR', count('bitstamp', 'EUR') - down, 0, down),
        summary('bitstamp', 'USD', count('bitstamp', 'USD')),
      ]);
      expect(clean).toBe(false);
      const bitstamp = requests.filter(({ url }) => url.hostname === 'www.bitstamp.net');
      expect(bitstamp).toHaveLength(count('bitstamp', 'EUR') + count('bitstamp', 'USD'));
      expect(requests.filter(({ url }) => url.hostname === 'api.kraken.com')).toHaveLength(3);
      const pairs = Object.entries(PAIRS).filter(([, venues]) => venues.bitstamp?.EUR !== undefined);
      expect(existsSync(file('bitstamp', `${pairs[down - 1]?.[0]}-EUR`))).toBe(false);
      expect(readFileSync(file('bitstamp', `${pairs[down]?.[0]}-EUR`), 'utf8')).toBe(`date,close\n${YESTERDAY},1.5\n`);
    },
  );

  it('counts only consecutive unreachable pairs: another answer resets the count', async () => {
    let calls = 0;
    const flaky: Source = {
      exchange: 'kraken',
      closes: async (pair) => {
        calls += 1;
        if (calls % 3 === 0) return [];
        throw new Error(`refused: kraken ${pair} unreachable`);
      },
    };
    const { clean, out, err } = await run(exchanges().io, {}, { kraken: flaky, bitstamp: null, coinbase: null });
    expect(calls).toBe(count('kraken', 'EUR') + count('kraken', 'USD'));
    expect(err).not.toContain('kraken: stopped after 3 unreachable');
    expect(out[1]).toMatch(/^kraken EUR: \d+ pairs, 0 added, 0 revised, \d+ failed$/);
    expect(clean).toBe(false);
  });

  it.each([
    ['a week in the past', -7],
    ['yesterday, at 01:17 UTC', -1],
  ])('fails every Bitstamp pair, unread, when --today is %s, and Kraken still runs', async (_, offset) => {
    const { io, requests } = exchanges();
    const { clean, out, err } = await run(io, { today: addDays(TODAY, offset) });
    expect(err).toEqual(
      [...symbols('bitstamp', 'EUR'), ...symbols('bitstamp', 'USD')].map(
        (symbol) => `refused: bitstamp ${symbol} out of window`,
      ),
    );
    expect(out[0]).toBe(summary('bitstamp', 'EUR', 0, 0, count('bitstamp', 'EUR')));
    expect(out[1]).toBe(summary('bitstamp', 'USD', 0, 0, count('bitstamp', 'USD')));
    expect(clean).toBe(false);
    expect(requests.filter(({ url }) => url.hostname === 'www.bitstamp.net')).toHaveLength(0);
    expect(existsSync(join(store, 'closes', 'bitstamp'))).toBe(false);
  });

  it('reads the entry’s yesterday across midnight, and Kraken keeps only complete days of its window', async () => {
    const tomorrow = addDays(TODAY, 1);
    const first = exchanges({ start: `${TODAY}T23:59:30Z` });
    const { clean, out } = await run(first.io);
    expect(clean).toBe(true);
    const bitstamp = first.requests.filter(({ url }) => url.hostname === 'www.bitstamp.net');
    // The clock passes midnight among Bitstamp's requests and before Kraken's.
    expect(utcToday(new Date(bitstamp[0]?.at ?? 0))).toBe(TODAY);
    expect(utcToday(new Date(bitstamp.at(-1)?.at ?? 0))).toBe(tomorrow);
    for (const { url } of bitstamp) expect(url.searchParams.get('start')).toBe(String(dayStart(YESTERDAY)));
    expect(out[1]).toBe(summary('bitstamp', 'USD', count('bitstamp', 'USD')));
    expect(readFileSync(file('bitstamp', 'BTC-USD'), 'utf8')).toBe(`date,close\n${YESTERDAY},1.5\n`);
    // Kraken answers by the real clock: today's candle is complete but after the window, tomorrow's runs.
    const window = [-2, -1].map((offset) => `${addDays(TODAY, offset)},1.5\n`);
    expect(readFileSync(file('kraken', 'BTC-EUR'), 'utf8')).toBe(`date,close\n${window.join('')}`);
    // The next day's run adds the day the window left out: nothing complete is lost.
    const next = await run(exchanges({ start: `${tomorrow}T01:17:00Z` }).io, { today: tomorrow });
    expect(next.out[2]).toBe(summary('kraken', 'EUR', count('kraken', 'EUR')));
    expect(readFileSync(file('kraken', 'BTC-EUR'), 'utf8')).toBe(`date,close\n${window.join('')}${TODAY},1.5\n`);
    expect(readFileSync(file('bitstamp', 'BTC-USD'), 'utf8')).toBe(`date,close\n${YESTERDAY},1.5\n${TODAY},1.5\n`);
  });

  // A store refusal fails its pair only: Bitstamp's later pairs, whose day cannot be read again, and
  // every Kraken pair are still read and written.
  it.each([
    [
      'a malformed store file',
      (pair: string) => writeFileSync(file('bitstamp', pair), '<<<<<<< HEAD\ndate,close\n'),
      (pair: string) => `refused: closes/bitstamp/${pair}.csv is malformed`,
      0,
    ],
    [
      'a store file that cannot be written',
      // The temporary file's path is a folder with a file in it, on Windows and Linux alike.
      (pair: string) => mkdirSync(join(`${file('bitstamp', pair)}.tmp`, 'held'), { recursive: true }),
      (pair: string) => new RegExp(`^refused: closes/bitstamp/${pair}\\.csv cannot be written \\([A-Z]`),
      1,
    ],
  ])('fails only the pair of %s and reads every later pair of both exchanges', async (_, spoil, refusal, read) => {
    const pair = pairs('bitstamp', 'EUR')[3] ?? '';
    mkdirSync(join(store, 'closes', 'bitstamp'), { recursive: true });
    spoil(pair);
    const { io, requests } = exchanges();
    const { clean, out, err } = await run(io);
    expect(err).toHaveLength(1);
    expect(err[0]).toMatch(refusal(pair));
    expect(out).toEqual([
      summary('bitstamp', 'EUR', count('bitstamp', 'EUR') - 1, 0, 1),
      summary('bitstamp', 'USD', count('bitstamp', 'USD')),
      summary('kraken', 'EUR', 3 * count('kraken', 'EUR')),
      summary('kraken', 'USD', 3 * count('kraken', 'USD')),
      'coinbase: off',
    ]);
    expect(clean).toBe(false);
    const reads = (host: string) => requests.filter(({ url }) => url.hostname === host).length;
    expect(reads('www.bitstamp.net')).toBe(count('bitstamp', 'EUR') + count('bitstamp', 'USD') - 1 + read);
    expect(reads('api.kraken.com')).toBe(count('kraken', 'EUR') + count('kraken', 'USD'));
    const later = [...pairs('bitstamp', 'EUR').slice(4), ...pairs('bitstamp', 'USD')];
    for (const kept of later)
      expect(readFileSync(file('bitstamp', kept), 'utf8')).toBe(`date,close\n${YESTERDAY},1.5\n`);
    expect(existsSync(file('kraken', 'BTC-EUR'))).toBe(true);
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
