import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import cycles from '../cycles/drawdowns.json' with { type: 'json' };
import facts from '../facts/education.json' with { type: 'json' };
import { parseModule } from './loaders/modules.ts';
import { CycleDrawdownsSchema } from './schema/cycles.ts';
import { TemplateSchema } from './schema/template.ts';

// The template cards' bands and the risk module's bars quote the same falls (docs/EDUCATION.md §2 and §6,
// docs/CONTENT-OPS.md §7), so a template's row must appear in the cycles file unchanged.
const root = new URL('../', import.meta.url);
const templates = readdirSync(new URL('templates/', root))
  .filter((name) => name.endsWith('.json'))
  .map((name) => TemplateSchema.parse(JSON.parse(readFileSync(new URL(`templates/${name}`, root), 'utf8'))));
const row = (each: { coin: string; high: string; low: string; fall: string }) =>
  `${each.coin} ${each.high} ${each.low} ${each.fall}`;

// docs/CONTENT-OPS.md §7: facts a and b quote each fall to one decimal on the series they name, and the file rounds
// it to a whole percent on the series it names. The two series can differ; the fall and its two dates cannot.
const A = 'a.btc-drawdowns';
const B = 'b.alt-drawdowns';
const BITSTAMP = 'Bitstamp';
const COINBASE = 'Coinbase';
const CMC = 'CoinMarketCap';
// Each fall opens its own clause of the fact, and the words after `fact`'s key are that opening. A value holds every
// cycle's dates and figures, so a row is read inside its clause alone.
const FALLS = [
  { row: ['BTC', '2011-06-08', `Bitcoinity (Mt. Gox) and ${CMC}`], fact: [A, '2011, from', '−94 %', CMC] },
  { row: ['BTC', '2013-11-30', BITSTAMP], fact: [A, '2013 to 2015,', '−86.9 %', BITSTAMP] },
  { row: ['BTC', '2017-12-17', BITSTAMP], fact: [A, '2017 to 2018,', '−84.1 %', BITSTAMP] },
  { row: ['BTC', '2021-11-10', BITSTAMP], fact: [A, '2021 to 2022,', '−77.6 %', BITSTAMP] },
  { row: ['ETH', '2018-01-13', COINBASE], fact: [B, 'ETH 2018', '−94.3 %', COINBASE] },
  { row: ['ETH', '2021-11-10', COINBASE], fact: [B, 'ETH 2022', '−81.9 %', COINBASE] },
  { row: ['LINK', '2018-01-08', CMC], fact: [B, 'LINK 2018', '−88.7 %', CMC] },
  { row: ['LINK', '2021-05-10', BITSTAMP], fact: [B, 'LINK 2021', '−90.7 %', COINBASE] },
  { row: ['SOL', '2021-11-06', COINBASE], fact: [B, 'SOL', '−96.9 %', COINBASE] },
] as const;
// What follows the last row's clause of each fact: the current cycle, and the line on 16 Oct 2026.
const CLAUSE_STARTS = new RegExp(
  `(?=${[...FALLS.map(({ fact }) => fact[1]), 'current cycle,', 'On 16 Oct'].join('|')})`,
  'u',
);
const clauseOf = (value: string, opening: string) =>
  value.split(CLAUSE_STARTS).find((clause) => clause.startsWith(opening)) ?? '';
const asWritten = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
const written = (date: string) => asWritten.format(new Date(`${date}T00:00:00Z`));

// docs/CONTENT-STYLE.md §4 and docs/DESIGN.md §5: the module's dates are written by hand, so what lib/format does for a
// formatted date is done in the file. A line end in the source reads as a space, and `\s` would match the no-break one.
const MONTH = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec';
const BREAKS = [
  new RegExp(`\\d{1,2}[ \\n](?:${MONTH})`, 'gu'),
  new RegExp(`(?:${MONTH})[ \\n]\\d{4}`, 'gu'),
  /[ \n]%/gu,
  /\d[ \n](?:months|years)/gu,
];

describe('the cycles file (docs/EDUCATION.md §2 and §6)', () => {
  it('each row of drawdowns.json reads the same fall as facts a and b', () => {
    const { drawdowns } = CycleDrawdownsSchema.parse(cycles);
    expect(drawdowns.map(({ coin, high, publisher }) => [coin, high, publisher])).toEqual(FALLS.map(({ row }) => row));
    for (const [index, { fact }] of FALLS.entries()) {
      const [key, opening, figure, series] = fact;
      const { high = '', low = '', fall } = drawdowns[index] ?? {};
      const clause = clauseOf(facts.find((each) => each.key === key)?.value ?? '', opening);
      expect(clause).toMatch(new RegExp(`${series}[^%]*${figure}`, 'u'));
      expect(Math.round(Number(figure.replace(/[^\d.]/gu, '')))).toBe(Number(fall));
      expect(clause).toContain(written(high));
      expect(clause).toContain(written(low));
    }
  });

  it("cites Coinbase Exchange's daily candles for each Coinbase row, a request of at most 300 holding its date", () => {
    const { drawdowns } = CycleDrawdownsSchema.parse(cycles);
    const day = 86_400_000;
    const windowOf = (href: string, coin: string) => {
      const url = new URL(href);
      const [start = '', end = ''] = ['start', 'end'].map((key) => url.searchParams.get(key) ?? '');
      const daily = `${url.origin}${url.pathname}` === `https://api.exchange.coinbase.com/products/${coin}-USD/candles`;
      const midnight = [start, end].every((at) => at.endsWith('T00:00:00Z'));
      if (!daily || url.searchParams.get('granularity') !== '86400' || !midnight) return { start: '', end: '' };
      return { start: start.slice(0, 10), end: end.slice(0, 10) };
    };
    const holds = (url: string, coin: string, date: string) => {
      const { start, end } = windowOf(url, coin);
      return start <= date && date <= end && (Date.parse(end) - Date.parse(start)) / day < 300;
    };
    const coinbase = drawdowns.filter(({ publisher }) => publisher === COINBASE);
    expect(coinbase.map(({ coin, high }) => `${coin} ${high}`)).toEqual([
      'ETH 2018-01-13',
      'ETH 2021-11-10',
      'SOL 2021-11-06',
    ]);
    for (const { coin, high, low, source, lowSource } of coinbase) {
      expect(holds(source, coin, high), source).toBe(true);
      // One request holds both ends, or the low's window is its own (src/schema/drawdown.ts).
      const lowUrl = lowSource ?? source;
      expect(holds(lowUrl, coin, low), lowUrl).toBe(true);
      if (lowSource) expect(holds(source, coin, low), source).toBe(false);
    }
  });

  it('gives a coin that has not regained its high a low window from its low to the day the row was read', () => {
    // Fact b's line at the 16 Oct 2026 close: LINK is still below its 2021 high, while SOL passed it in Nov 2024.
    const unregained = ['LINK 2021-05-10'];
    const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    // The window one request returns: Bitstamp's `limit` candles of `step` seconds from `start`, or Coinbase's start to end.
    const windowOf = (href: string) => {
      const url = new URL(href);
      const param = (key: string) => url.searchParams.get(key) ?? '';
      if (url.hostname === 'www.bitstamp.net') {
        const start = Number(param('start')) * 1000;
        return { start: isoDay(start), end: isoDay(start + Number(param('step')) * Number(param('limit')) * 1000) };
      }
      if (url.hostname === 'api.exchange.coinbase.com')
        return { start: param('start').slice(0, 10), end: param('end').slice(0, 10) };
      return { start: '', end: '' };
    };
    const rows = CycleDrawdownsSchema.parse(cycles).drawdowns.filter(({ coin, high }) =>
      unregained.includes(`${coin} ${high}`),
    );
    expect(rows.map(({ coin, high }) => `${coin} ${high}`)).toEqual(unregained);
    for (const { low, lowSource = '', accessed } of rows) {
      const { start, end } = windowOf(lowSource);
      expect(start !== '' && start <= low && accessed <= end, lowSource).toBe(true);
    }
  });

  it('every template drawdown appears in the cycles file with the same coin, high, low and fall (the band and the bar say one thing)', () => {
    const rows = CycleDrawdownsSchema.parse(cycles).drawdowns.map(row);
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      for (const drawdown of template.drawdowns) expect(rows).toContain(row(drawdown));
    }
  });

  it('in the Cycles module a figure stays with its unit and a date stays whole', () => {
    const path = 'packages/content/learn/cycles.mdx';
    const module = parseModule(path, readFileSync(new URL('learn/cycles.mdx', root), 'utf8'));
    if (!module.ok) throw new Error(path);
    expect(BREAKS.flatMap((rule) => module.value.body.match(rule) ?? [])).toEqual([]);
    expect(module.value.body).toContain('9 Jul 2016');
    expect(module.value.body).toContain('−84.1 %, 17.3 months');
    expect(module.value.body).not.toMatch(/Mt\.[ \n]Gox/u);
    expect(module.value.words).toBeLessThan(400);
  });
});
