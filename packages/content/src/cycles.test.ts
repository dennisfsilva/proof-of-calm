import { readdirSync, readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
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
// A row of the file as [coin, high, publisher], and the clause that quotes it as [key, opening, figure, series].
type Fall = {
  readonly row: readonly [string, string, string];
  readonly fact: readonly [string, string, string, string];
};
type Drawdown = {
  readonly coin: string;
  readonly high: string;
  readonly low: string;
  readonly fall: string;
  readonly publisher: string;
};
type Read = (key: string) => string;
// Each fall opens its own clause of the fact, and the words after `fact`'s key are that opening. A value holds every
// cycle's dates and figures, so a row is read inside its clause alone.
const FALLS = [
  { row: ['BTC', '2011-06-08', `Bitcoinity (Mt. Gox) and ${CMC}`], fact: [A, '2011, from', '−94.0 %', CMC] },
  { row: ['BTC', '2013-11-30', BITSTAMP], fact: [A, '2013 to 2015,', '−86.9 %', BITSTAMP] },
  { row: ['BTC', '2017-12-17', BITSTAMP], fact: [A, '2017 to 2018,', '−84.1 %', BITSTAMP] },
  { row: ['BTC', '2021-11-10', BITSTAMP], fact: [A, '2021 to 2022,', '−77.6 %', BITSTAMP] },
  { row: ['ETH', '2018-01-13', COINBASE], fact: [B, 'ETH 2018', '−94.3 %', COINBASE] },
  { row: ['ETH', '2021-11-10', COINBASE], fact: [B, 'ETH 2022', '−81.9 %', COINBASE] },
  { row: ['LINK', '2018-01-08', CMC], fact: [B, 'LINK 2018', '−88.7 %', CMC] },
  { row: ['LINK', '2021-05-10', BITSTAMP], fact: [B, 'LINK 2021', '−90.7 %', COINBASE] },
  { row: ['SOL', '2021-11-06', COINBASE], fact: [B, 'SOL (Coinbase)', '−96.9 %', COINBASE] },
] as const satisfies readonly Fall[];
// A FALLS literal that a merged review replaced, until the log PR writes its new value here (docs/CONTENT-OPS.md §8
// steps 4 and 5). Each key is the literal's `<coin> <high>`; each value is the whole entry that replaces it. The
// owner's session PR adds the entry to main, which reads the literal until the review merges and `now` after; the
// agent's branch cannot change this file (CI's guard). The log PR writes `now` into FALLS and removes the entry. When `now` moves a
// high, it also writes the new `<coin> <high>` in place of the old one in UNREGAINED_KEYS, which reads the old key
// through the entry only while the entry stays. The Coinbase rows come from the held falls' publishers, so a changed
// publisher moves its row in or out of them with the entry and leaves no list to edit.
const unloggedFalls: ReadonlyMap<string, Fall> = new Map([]);
// The coins fact b's 16 Oct 2026 line names as still below their high.
const UNREGAINED_KEYS = ['LINK 2021-05-10'];

// What follows the last row's clause of each fact: the current cycle, and the line at the 16 Oct 2026 close. Fact b
// names its coins by ticker in its opening too, so SOL's clause opens with its series, read as plain text.
const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const clauseStarts = (falls: readonly Fall[]) =>
  new RegExp(
    `(?=${[...falls.map(({ fact }) => fact[1]), 'current cycle,', 'At the close on 16 Oct'].map(literally).join('|')})`,
    'u',
  );
const clauseOf = (value: string, opening: string, starts: RegExp) =>
  value.split(starts).find((clause) => clause.startsWith(opening)) ?? '';
const figureIn = ([, , figure, series]: Fall['fact']) =>
  new RegExp(`${literally(series)}[^%]*${literally(figure)}`, 'u');
const keyOf = ({ row: [coin, high] }: Fall) => `${coin} ${high}`;

/** FALLS with each pending entry's `now` in its literal's place where the file's row and its fact's clause read `now`. */
function heldFalls(
  falls: readonly Fall[],
  drawdowns: readonly Drawdown[],
  factValue: Read,
  pending: ReadonlyMap<string, Fall>,
): Fall[] {
  const starts = clauseStarts([...falls, ...pending.values()]);
  return falls.map((literal, index) => {
    const now = pending.get(keyOf(literal));
    const { coin, high, publisher } = drawdowns[index] ?? {};
    if (now === undefined || !isDeepStrictEqual([coin, high, publisher], now.row)) return literal;
    return figureIn(now.fact).test(clauseOf(factValue(now.fact[0]), now.fact[1], starts)) ? now : literal;
  });
}

/** The keys of `pending` that name no literal of `falls`, or whose entry its literal already reads. */
function staleFalls(falls: readonly Fall[], pending: ReadonlyMap<string, Fall>): string[] {
  return [...pending]
    .filter(([key, now]) => {
      const literal = falls.find((each) => keyOf(each) === key);
      return literal === undefined || isDeepStrictEqual(literal, now);
    })
    .map(([key]) => key);
}

/** Each `<coin> <high>` of a literal as its held fall writes it, so a list of literal keys follows a held high. */
function heldKeys(keys: readonly string[], falls: readonly Fall[], held: readonly Fall[]): string[] {
  return keys.map((key) => {
    const now = held[falls.findIndex((each) => keyOf(each) === key)];
    return now === undefined ? key : keyOf(now);
  });
}
/** The keys that name no literal of `falls`: a log PR wrote a moved high into FALLS and kept the old key. */
function strayKeys(keys: readonly string[], falls: readonly Fall[]): string[] {
  return keys.filter((key) => !falls.some((each) => keyOf(each) === key));
}
/** The `<coin> <high>` of each held fall on Coinbase's series: the rows the Coinbase test reads its windows from. */
function coinbaseKeys(held: readonly Fall[]): string[] {
  return held.filter(({ row }) => row[2] === COINBASE).map(keyOf);
}
const held = () => heldFalls(FALLS, CycleDrawdownsSchema.parse(cycles).drawdowns, factValue, unloggedFalls);

/** Each row of `drawdowns` is the fall at its index: the same row, and its fact's clause reads its figure and dates. */
function expectFallsRead(falls: readonly Fall[], drawdowns: readonly Drawdown[], factValue: Read) {
  const starts = clauseStarts(falls);
  expect(drawdowns.map(({ coin, high, publisher }) => [coin, high, publisher])).toEqual(falls.map(({ row }) => row));
  for (const [index, { fact }] of falls.entries()) {
    const [key, opening, figure] = fact;
    const { high = '', low = '', fall } = drawdowns[index] ?? {};
    const clause = clauseOf(factValue(key), opening, starts);
    expect(clause).toMatch(figureIn(fact));
    expect(Math.round(Number(figure.replace(/[^\d.]/gu, '')))).toBe(Number(fall));
    expect(clause).toContain(written(high));
    expect(clause).toContain(written(low));
  }
}
const factValue: Read = (key) => facts.find((each) => each.key === key)?.value ?? '';

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
    expectFallsRead(held(), drawdowns, factValue);
  });

  // A stale entry: the log PR wrote `now` into FALLS and kept the entry, or the literal it names is gone.
  it('the unloggedFalls list names only FALLS literals, each with an entry that differs from it', () => {
    expect(staleFalls(FALLS, unloggedFalls)).toEqual([]);
  });

  it('the unregained key list names only FALLS literals', () => {
    const fix = 'write the new `<coin> <high>` in place of the old one (docs/CONTENT-OPS.md §8 step 5)';
    expect(strayKeys(UNREGAINED_KEYS, FALLS), fix).toEqual([]);
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
    expect(coinbase.map(({ coin, high }) => `${coin} ${high}`)).toEqual(coinbaseKeys(held()));
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
    const unregained = heldKeys(UNREGAINED_KEYS, FALLS, held());
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
    // The parts in one sentence, the closing month after a semicolon (brand's proposal on #239).
    expect(module.value.body.replace(/[ \n]+/gu, ' ')).toContain(
      'marks thirds in its first and third months; the rest in its closing month.',
    );
    expect(module.value.words).toBeLessThan(400);
  });

  it("keeps Cycles' idea free of a historic pattern, since Learn's index rows show it with no source", () => {
    const path = 'packages/content/learn/cycles.mdx';
    const module = parseModule(path, readFileSync(new URL('learn/cycles.mdx', root), 'utf8'));
    if (!module.ok) throw new Error(path);
    // docs/LEGAL.md §3 item 6: an index row or a sheet's title carries no past-performance line.
    expect(module.value.idea).toBe('4 cycles are 4 data points, not a law.');
    expect(module.value.idea).not.toMatch(/\b(?:19|20)\d\d\b|years apart|so far/u);
  });

  it("ends Cycles' source line in LEGAL §4's intraday form, from the first high in the file to fact a's date", () => {
    const path = 'packages/content/learn/cycles.mdx';
    const module = parseModule(path, readFileSync(new URL('learn/cycles.mdx', root), 'utf8'));
    if (!module.ok) throw new Error(path);
    const highs = CycleDrawdownsSchema.parse(cycles).drawdowns.flatMap(({ coin, high }) =>
      coin === 'BTC' ? [high] : [],
    );
    const [first = ''] = highs.toSorted();
    const last = facts.find(({ key }) => key === A)?.date ?? '';
    // One space for each line end and no-break space, so a line that wraps reads as written; a blank line, which would
    // end the paragraph before the element, reads as two and does not match.
    const prose = module.value.body.replaceAll(/[ \n]/gu, ' ');
    expect(prose).toContain(
      `Mt. Gox, CoinMarketCap, and Bitstamp intraday highs and lows in US dollars, ${written(first)} to ${written(last)}; ` +
        "the falls are Proof of Calm's own computation. <PastPerformance />",
    );
  });
});

// Literal rows, clauses and entries, never the live files: a review may change any of those.
describe('a FALLS literal with a pending entry (docs/CONTENT-OPS.md §8 steps 4 and 5)', () => {
  const btc: Fall = { row: ['BTC', '2017-12-17', BITSTAMP], fact: ['x.one', '2017 to 2018,', '−84.1 %', BITSTAMP] };
  const link: Fall = { row: ['LINK', '2021-05-10', BITSTAMP], fact: ['x.one', 'LINK 2021', '−90.7 %', COINBASE] };
  const falls = [btc, link];
  // A review moves BTC's clause to −84.2 % (its row's fall stays 84), or LINK's high a day on.
  const btcNow: Fall = { row: btc.row, fact: ['x.one', '2017 to 2018,', '−84.2 %', BITSTAMP] };
  const linkNow: Fall = { row: ['LINK', '2021-05-11', BITSTAMP], fact: link.fact };
  const file = (linkHigh = '2021-05-10'): Drawdown[] => [
    { coin: 'BTC', high: '2017-12-17', low: '2018-12-15', fall: '84', publisher: BITSTAMP },
    { coin: 'LINK', high: linkHigh, low: '2023-06-10', fall: '91', publisher: BITSTAMP },
  ];
  const clauses =
    (figure: string, linkHigh = '10 May 2021'): Read =>
    () =>
      `2017 to 2018, Bitstamp: 17 Dec 2017 to 15 Dec 2018, ${figure}. ` +
      `LINK 2021, Coinbase: ${linkHigh} to 10 Jun 2023, −90.7 %. At the close on 16 Oct 2026, nothing.`;
  const none: ReadonlyMap<string, Fall> = new Map();
  const pending = (...entries: [string, Fall][]): ReadonlyMap<string, Fall> => new Map(entries);
  const check =
    (rows: Drawdown[], read: Read, entries: ReadonlyMap<string, Fall>, literals = falls) =>
    () =>
      expectFallsRead(heldFalls(literals, rows, read, entries), rows, read);

  it('data at the literal passes', () => {
    expect(check(file(), clauses('−84.1 %'), none)).not.toThrow();
  });

  it('a changed figure with no entry fails', () => {
    expect(check(file(), clauses('−84.2 %'), none)).toThrow(/to match/u);
  });

  it("data at the entry's now passes", () => {
    expect(check(file(), clauses('−84.2 %'), pending(['BTC 2017-12-17', btcNow]))).not.toThrow();
  });

  it("data one character off the entry's now fails, in the clause or in the row", () => {
    expect(check(file(), clauses('−84.3 %'), pending(['BTC 2017-12-17', btcNow]))).toThrow(/to match/u);
    const offRow = pending(['LINK 2021-05-10', { row: ['LINK', '2021-05-12', BITSTAMP], fact: link.fact }]);
    expect(check(file('2021-05-11'), clauses('−84.1 %', '11 May 2021'), offRow)).toThrow(/to deeply equal/u);
  });

  it('the old data with the entries present passes (main before the merge)', () => {
    const both = pending(['BTC 2017-12-17', btcNow], ['LINK 2021-05-10', linkNow]);
    expect(check(file(), clauses('−84.1 %'), both)).not.toThrow();
  });

  it('a high-date change passes with its entry, and fails the whole-array comparison without it', () => {
    const moved = clauses('−84.1 %', '11 May 2021');
    expect(check(file('2021-05-11'), moved, pending(['LINK 2021-05-10', linkNow]))).not.toThrow();
    expect(check(file('2021-05-11'), moved, none)).toThrow(/to deeply equal/u);
  });

  it("the log PR's updated literal is stale while its entry stays, and passes once it is removed", () => {
    expect(staleFalls([btcNow, link], pending(['BTC 2017-12-17', btcNow]))).toEqual(['BTC 2017-12-17']);
    expect(staleFalls([btc, linkNow], pending(['LINK 2021-05-10', linkNow]))).toEqual(['LINK 2021-05-10']);
    expect(staleFalls([btcNow, linkNow], none)).toEqual([]);
    expect(check(file('2021-05-11'), clauses('−84.2 %', '11 May 2021'), none, [btcNow, linkNow])).not.toThrow();
  });

  it("a literal's key reads as its held entry's, so a key list follows a high-date change", () => {
    const keys = ['LINK 2021-05-10', 'BTC 2017-12-17', 'SOL 2021-11-06'];
    expect(heldKeys(keys, falls, [btc, link])).toEqual(keys);
    expect(heldKeys(keys, falls, [btcNow, linkNow])).toEqual(['LINK 2021-05-11', 'BTC 2017-12-17', 'SOL 2021-11-06']);
  });

  it("a listed key whose high no literal holds is stray, as after a log PR that kept a moved high's old key", () => {
    const keys = ['LINK 2021-05-10', 'BTC 2017-12-17'];
    expect(strayKeys(keys, falls)).toEqual([]);
    expect(strayKeys(keys, [btc, linkNow])).toEqual(['LINK 2021-05-10']);
    expect(strayKeys(['LINK 2021-05-11', 'BTC 2017-12-17'], [btc, linkNow])).toEqual([]);
  });

  it('an entry that differs from the literal it names is not stale', () => {
    expect(staleFalls(falls, pending(['BTC 2017-12-17', btcNow], ['LINK 2021-05-10', linkNow]))).toEqual([]);
  });
});

// A review moves ETH's 2021 row from Coinbase's series to Bitstamp's, or LINK's 2021 row from Bitstamp's to Coinbase's.
// Main stays green in each state: main with the entry, the merged review (the flip changes no row or clause) and the
// log PR, which writes `now` into the literals and removes the entry.
describe('a publisher change through an entry (docs/CONTENT-OPS.md §8 steps 4 and 5)', () => {
  const eth: Fall = { row: ['ETH', '2021-11-10', COINBASE], fact: ['x.two', 'ETH 2022', '−81.9 %', COINBASE] };
  const link: Fall = { row: ['LINK', '2021-05-10', BITSTAMP], fact: ['x.two', 'LINK 2021', '−90.7 %', COINBASE] };
  const ethNow: Fall = { row: ['ETH', '2021-11-10', BITSTAMP], fact: ['x.two', 'ETH 2022', '−81.9 %', BITSTAMP] };
  const linkNow: Fall = { row: ['LINK', '2021-05-10', COINBASE], fact: link.fact };
  const file = (ethOn: string, linkOn: string): Drawdown[] => [
    { coin: 'ETH', high: '2021-11-10', low: '2022-06-18', fall: '82', publisher: ethOn },
    { coin: 'LINK', high: '2021-05-10', low: '2023-06-10', fall: '91', publisher: linkOn },
  ];
  const clauses =
    (ethSeries: string): Read =>
    () =>
      `ETH 2022 (${ethSeries}): 10 Nov 2021 to 18 Jun 2022, −81.9 %. ` +
      'LINK 2021 (Coinbase): 10 May 2021 to 10 Jun 2023, −90.7 %. At the close on 16 Oct 2026, nothing.';
  const ethMoves: ReadonlyMap<string, Fall> = new Map([['ETH 2021-11-10', ethNow]]);
  const linkMoves: ReadonlyMap<string, Fall> = new Map([['LINK 2021-05-10', linkNow]]);
  const none: ReadonlyMap<string, Fall> = new Map();
  /** The cycles tests' reads of one state: the whole-array tie, the stale check and the Coinbase rows' keys. */
  const route = (rows: Drawdown[], read: Read, entries: ReadonlyMap<string, Fall>, literals: readonly Fall[]) => {
    const held = heldFalls(literals, rows, read, entries);
    expectFallsRead(held, rows, read);
    expect(staleFalls(literals, entries)).toEqual([]);
    const onCoinbase = rows
      .filter(({ publisher }) => publisher === COINBASE)
      .map(({ coin, high }) => `${coin} ${high}`);
    expect(onCoinbase).toEqual(coinbaseKeys(held));
  };

  it.each([
    {
      state: 'ETH to Bitstamp: main with the entry',
      rows: file(COINBASE, BITSTAMP),
      series: COINBASE,
      entries: ethMoves,
      literals: [eth, link],
    },
    {
      state: 'ETH to Bitstamp: the merged review',
      rows: file(BITSTAMP, BITSTAMP),
      series: BITSTAMP,
      entries: ethMoves,
      literals: [eth, link],
    },
    {
      state: 'ETH to Bitstamp: the log PR',
      rows: file(BITSTAMP, BITSTAMP),
      series: BITSTAMP,
      entries: none,
      literals: [ethNow, link],
    },
    {
      state: 'LINK to Coinbase: main with the entry',
      rows: file(COINBASE, BITSTAMP),
      series: COINBASE,
      entries: linkMoves,
      literals: [eth, link],
    },
    {
      state: 'LINK to Coinbase: the merged review',
      rows: file(COINBASE, COINBASE),
      series: COINBASE,
      entries: linkMoves,
      literals: [eth, link],
    },
    {
      state: 'LINK to Coinbase: the log PR',
      rows: file(COINBASE, COINBASE),
      series: COINBASE,
      entries: none,
      literals: [eth, linkNow],
    },
  ])('$state passes', ({ rows, series, entries, literals }) => {
    route(rows, clauses(series), entries, literals);
  });

  it('a publisher change with no entry fails the whole-array comparison', () => {
    expect(() => route(file(BITSTAMP, BITSTAMP), clauses(BITSTAMP), none, [eth, link])).toThrow(/to deeply equal/u);
    expect(() => route(file(COINBASE, COINBASE), clauses(COINBASE), none, [eth, link])).toThrow(/to deeply equal/u);
  });
});
