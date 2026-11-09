// The red-day port's maths (docs/DOMAIN.md §3.11), loaded on demand by `./red-day`, so Today's entry carries none of
// it. The model reads each held coin's copy through the history port itself: the Portfolio's useHistories waits for
// a coin the route does not serve and fails as a whole, and this page names the coins it could not read instead.
import { COINS } from '@proofofcalm/content';
import { loadCycleDrawdowns } from '@proofofcalm/content/cycles';
import {
  type CalendarDate,
  type CoinId,
  drawdowns,
  heldValueSeries,
  isPositive,
  nextBuyReminder,
  type PriceHistories,
  portfolio,
  redDay,
  redDayEpisode,
} from '@proofofcalm/core';
import { epochMs, todayIn } from '../adapters/clock';
import type { CachedHistory, HistorySource } from '../ports';
import type { PastFall, RedDayInput, RedDayModel } from './red-day-types';

const WINDOW_DAYS = 90;

/** Whether the history route serves the coin: the coin catalogue is its allow-list (ADR-0036). */
const served = (coin: CoinId) => COINS.some((known) => known.id === coin);

/**
 * The complete closes of a copy: the route dates the live price at the fetch with that UTC day, so every point on
 * or after the fetch's UTC day goes, and so does every point after the user's today.
 */
function completeCloses(copy: CachedHistory, today: CalendarDate): CachedHistory['closes'] {
  const fetchDay = todayIn(epochMs(copy.fetchedAt), 'UTC');
  return copy.closes.filter(([date]) => date < fetchDay && date <= today);
}

/** The copies of the served coins, or null when a read fails: one coin's failure is the whole figure's. */
async function read(history: HistorySource, coins: readonly CoinId[], input: RedDayInput) {
  try {
    const answers = await Promise.all(coins.map((coin) => history.closes(coin, input.plan.payCurrency)));
    if (answers.some((answer) => !answer.ok)) return null;
    return answers.flatMap((answer) =>
      answer.ok ? [{ coin: answer.value.coin, closes: completeCloses(answer.value, input.today) }] : [],
    );
  } catch {
    return null;
  }
}

export async function redDayModel(history: HistorySource, input: RedDayInput): Promise<RedDayModel> {
  const { plan, entries, today } = input;
  const nextBuy = nextBuyReminder(plan, entries, today)?.due ?? null;
  const none = { figure: null, episode: null, lastRed: null, nextBuy, buyDayToday: nextBuy === today } as const;
  const held = portfolio(plan, entries).positions.filter((position) => isPositive(position.units));
  if (held.length === 0) return { state: 'nothing-held', ...none };

  // A coin outside the catalogue is never asked for: the history route would not answer it.
  const copies = await read(history, held.map((position) => position.coin).filter(served), input);
  if (copies === null) return { state: 'failed', ...none };
  const closed = new Set(copies.filter((copy) => copy.closes.length > 1).map((copy) => copy.coin));
  const histories: PriceHistories = {
    currency: plan.payCurrency,
    coins: Object.fromEntries(copies.map((copy) => [copy.coin, copy.closes])),
  };
  const series = heldValueSeries(
    held.filter((position) => closed.has(position.coin)),
    histories,
  );
  const points = series === null ? [] : drawdowns(series);
  const [first, last] = [points[0], points.at(-1)];
  if (first === undefined || last === undefined) return { state: 'failed', ...none };

  const episode = redDayEpisode(
    points.map((point) => ({ date: point.date, red: redDay(point) })),
    today,
  );
  const red = episode === null ? undefined : points.find((point) => point.date === episode.last);
  return {
    ...none,
    state: episode === null ? 'clear' : 'episode',
    figure: {
      coins: held.map((position) => position.coin).filter((coin) => closed.has(coin)),
      missing: held.map((position) => position.coin).filter((coin) => !closed.has(coin)),
      sevenDay: last.sevenDay,
      fromHigh90: last.fromHigh90,
      first: first.date,
      last: last.date,
      currency: plan.payCurrency,
      shortWindow: points.length < WINDOW_DAYS,
    },
    episode,
    lastRed: red === undefined ? null : { date: red.date, sevenDay: red.sevenDay, fromHigh90: red.fromHigh90 },
  };
}

let falls: readonly PastFall[] | undefined;

/** The cycles file's rows of each coin passed, in that order; the file passes its schema in CI, so a refusal throws. */
export async function pastFalls(coins: readonly CoinId[]): Promise<readonly PastFall[]> {
  if (falls === undefined) {
    const loaded = loadCycleDrawdowns();
    if (!loaded.ok) throw new Error(`cycles/drawdowns.json: ${loaded.error.join('; ')}`);
    falls = loaded.value.map((row) => ({
      coin: row.coin as CoinId,
      high: row.high as CalendarDate,
      low: row.low as CalendarDate,
      fall: row.fall as PastFall['fall'],
      publisher: row.publisher,
    }));
  }
  const rows = falls;
  return coins.flatMap((coin) => rows.filter((row) => row.coin === coin));
}
