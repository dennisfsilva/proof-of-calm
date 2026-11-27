// Bitstamp's reader of its public daily closes (ADR-0036, Reading of 2026-11-23): yesterday's candle
// only, once a day per pair, and no candle dated before the pipeline's first run, so a missed day is
// not caught up. API v2's OHLC endpoint (www.bitstamp.net/api, OHLC data) with `step=86400`,
// `limit=1`, `start` at yesterday and the open candle excluded.
import { addDays, compareDates } from '@proofofcalm/core';
import type { StoreRow } from '@proofofcalm/data';
import * as z from 'zod/mini';
import type { Source } from './index.ts';
import { candleRow, dayStart, getJson, refused, utcToday } from './read.ts';

// A url_symbol of the trading-pairs listing (`btceur`), so nothing else reaches the URL.
const SYMBOL = /^[a-z0-9]{2,16}$/;
const SECONDS = /^\d{1,12}$/;

const BodySchema = z.object({
  data: z.object({ ohlc: z.array(z.object({ timestamp: z.string(), close: z.unknown() })) }),
});
// Bitstamp's error answers carry `errors`, `code` or `response_code` (its API's error format).
const ErrorSchema = z.union([
  z.object({ errors: z.unknown() }),
  z.object({ code: z.unknown() }),
  z.object({ response_code: z.unknown() }),
]);

export const bitstamp: Source = {
  exchange: 'bitstamp',
  async closes(pair, from, to, io) {
    if (!SYMBOL.test(pair)) throw new Error('refused: bitstamp unknown pair');
    const yesterday = addDays(utcToday(io.now()), -1);
    if (compareDates(yesterday, from) < 0 || compareDates(yesterday, to) > 0) return [];
    const query = new URLSearchParams({
      step: '86400',
      limit: '1',
      start: String(dayStart(yesterday)),
      exclude_current_candle: 'true',
    });
    const json = await getJson('bitstamp', pair, `https://www.bitstamp.net/api/v2/ohlc/${pair}/?${query}`, io);
    const body = BodySchema.safeParse(json);
    if (!body.success) throw refused('bitstamp', pair, ErrorSchema.safeParse(json).success ? 'error' : 'malformed');
    const rows = body.data.data.ohlc.map((candle) =>
      candleRow(SECONDS.test(candle.timestamp) ? Number.parseInt(candle.timestamp, 10) : null, candle.close),
    );
    if (rows.some((row) => row === null)) throw refused('bitstamp', pair, 'malformed');
    return rows.filter((row): row is StoreRow => row?.date === yesterday).slice(0, 1);
  },
};
