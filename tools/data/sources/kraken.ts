// Kraken's reader: its public OHLC endpoint, daily candles of a spot pair (ADR-0036, Reading of
// 2026-11-27). The endpoint gives up to 720 of the latest candles, the last one the running day's
// (docs.kraken.com, Get OHLC Data), so one read fills up to two years and a missed day heals on the
// next run. The runner paces it at one request a second (`../pace.ts`).
import { compareDates } from '@proofofcalm/core';
import { type StoreRow, StoreRowsSchema } from '@proofofcalm/data';
import * as z from 'zod/mini';
import { candleRow, dayStart, getJson, refused, utcToday } from './read.ts';
import type { Source } from './source.ts';

// An altname of the AssetPairs listing (`XBTEUR`), so nothing else reaches the URL.
const SYMBOL = /^[A-Z0-9]{2,16}$/;

// `error` is a list of strings; `result` holds one series under Kraken's own pair name, and `last`.
const BodySchema = z.object({
  error: z.array(z.string()),
  result: z.optional(z.record(z.string(), z.unknown())),
});

export const kraken: Source = {
  exchange: 'kraken',
  async closes(pair, from, to, io) {
    if (!SYMBOL.test(pair)) throw new Error('refused: kraken unknown pair');
    const query = new URLSearchParams({ pair, interval: '1440', since: String(dayStart(from) - 1) });
    const body = BodySchema.safeParse(
      await getJson('kraken', pair, `https://api.kraken.com/0/public/OHLC?${query}`, io),
    );
    if (!body.success) throw refused('kraken', pair, 'malformed');
    if (body.data.error.length > 0) throw refused('kraken', pair, 'error');
    const series = Object.entries(body.data.result ?? {}).filter(([key]) => key !== 'last');
    const candles = series.length === 1 ? series[0]?.[1] : undefined;
    if (!Array.isArray(candles)) throw refused('kraken', pair, 'malformed');
    const today = utcToday(io.now());
    const rows: StoreRow[] = [];
    // The last candle is the running one, whatever its date.
    for (const candle of candles.slice(0, -1)) {
      const row = Array.isArray(candle) ? candleRow(candle[0], candle[4]) : null;
      if (row === null) throw refused('kraken', pair, 'malformed');
      const inRange = compareDates(row.date, from) >= 0 && compareDates(row.date, to) <= 0;
      if (inRange && compareDates(row.date, today) < 0) rows.push(row);
    }
    if (!StoreRowsSchema.safeParse(rows).success) throw refused('kraken', pair, 'malformed');
    return rows;
  },
};
