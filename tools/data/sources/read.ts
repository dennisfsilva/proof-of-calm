// What the readers share: one GET with no header of its own, the UTC day of a candle, an exact close,
// and the refusal. A reader throws `refused: <exchange> <pair> <status>`, the status one of
// `rate limited`, `unreachable`, `http <code>`, `error` or `malformed`, with no cause attached: the
// exchange's body, a parser's snippet and a fetch error's URL never reach the message.
import { type CalendarDate, epochDay, fromEpochDay, type Price, parseDecimal } from '@proofofcalm/core';
import { type Exchange, type StoreRow, StoreRowSchema } from '@proofofcalm/data';
import { RateLimited } from '../pace.ts';
import type { SourceIo } from './source.ts';

const DAY_SECONDS = 86_400;
const TIMEOUT_MS = 30_000;

export const refused = (exchange: Exchange, pair: string, status: string): Error =>
  new Error(`refused: ${exchange} ${pair} ${status}`);

/** The UTC day of a time; `now` is the caller's clock. */
export const utcToday = (now: Date): CalendarDate => fromEpochDay(Math.floor(now.getTime() / 1000 / DAY_SECONDS));

/** The epoch second a UTC day starts. */
export const dayStart = (date: CalendarDate): number => epochDay(date) * DAY_SECONDS;

// A candle's time in whole epoch seconds that starts a UTC day; anything else is null.
function utcDay(seconds: unknown): CalendarDate | null {
  if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds % DAY_SECONDS !== 0) return null;
  return fromEpochDay(seconds / DAY_SECONDS);
}

const EXPONENT = /^(\d+)(?:\.(\d+))?[eE]([+-]?\d{1,2})$/;

// A close as a plain decimal string, an exponent moved by its digits and never through `Number`; a
// number from the JSON is already a float, so it is refused with anything else that is not a string.
function exactClose(value: unknown): Price | null {
  if (typeof value !== 'string') return null;
  const match = EXPONENT.exec(value);
  if (match === null) return parseDecimal<Price>(value);
  const [, whole = '', fraction = '', exponent = '0'] = match;
  const digits = whole + fraction;
  const point = whole.length + Number.parseInt(exponent, 10);
  const plain =
    point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + '0'.repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return parseDecimal<Price>(plain.replace(/^0+(?=\d)/, ''));
}

/** A candle as a store row: its time starts a UTC day and its close is above zero, or null. */
export function candleRow(seconds: unknown, close: unknown): StoreRow | null {
  const row = StoreRowSchema.safeParse({ date: utcDay(seconds), close: exactClose(close) });
  return row.success ? row.data : null;
}

/** The parsed JSON of one GET, or a refusal naming only the status. */
export async function getJson(exchange: Exchange, pair: string, url: string, io: SourceIo): Promise<unknown> {
  let response: Response;
  try {
    response = await io.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw refused(exchange, pair, error instanceof RateLimited ? 'rate limited' : 'unreachable');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw refused(exchange, pair, response.status === 429 ? 'rate limited' : `http ${response.status}`);
  }
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw refused(exchange, pair, 'unreachable');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw refused(exchange, pair, 'malformed');
  }
}
