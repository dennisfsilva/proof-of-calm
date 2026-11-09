// The red-day port's maths (docs/DOMAIN.md §3.11), loaded on demand by `./red-day`, so Today's entry carries none of
// it. The model reads each held coin's copy through the history port itself: the Portfolio's useHistories waits for
// a coin the route does not serve and fails as a whole, and this page names the coins it could not read instead.
import { COINS } from '@proofofcalm/content';
import { loadCycleDrawdowns } from '@proofofcalm/content/cycles';
import {
  addDays,
  type CalendarDate,
  type CoinId,
  type DrawdownPoint,
  daysBetween,
  defined,
  drawdowns,
  heldValueSeries,
  isPositive,
  nextBuyReminder,
  type PriceHistories,
  portfolio,
  RED_DAY,
  type RedDayEpisode,
  type RedDayFlag,
  redDay,
  redDayEpisode,
  type ValuePoint,
} from '@proofofcalm/core';
import { epochMs, todayIn } from '../adapters/clock';
import type { CachedHistory, HistorySource } from '../ports';
import type { PastFall, RedDayInput, RedDayModel } from './red-day-types';

const WINDOW_DAYS = 90;
/** The days a point's drawdown reads back for its 90-day high (core's drawdowns). */
const HIGH_DAYS = 90;
/** The days before today read first: an episode under way had a Red day in its last RED_DAY.episodeClearDays. */
const RECENT_DAYS = 14;
/** The days read before those, a block at a time, while the episode may have started earlier. */
const EARLIER_DAYS = 90;

/**
 * Lets the browser paint and answer input between the model's steps: Today asks on its load, and each step divides
 * exact decimals over a year of closes, so together they would be one long task (docs/ENGINEERING.md §4).
 */
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Whether the history route serves the coin: the coin catalogue is its allow-list (ADR-0036). */
const served = (coin: CoinId) => COINS.some((known) => known.id === coin);

/** The coin's name in the plan, else in the catalogue, else its id: a held coin can have left the plan. */
const nameOf = (plan: RedDayInput['plan'], coin: CoinId) =>
  (plan.coins.find((known) => known.id === coin) ?? COINS.find((known) => known.id === coin))?.name ?? coin;

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

type Flag = RedDayFlag & Pick<DrawdownPoint, 'sevenDay' | 'fromHigh90'>;

/**
 * The flags of the series' points dated from `from` until `until` (excluded), with their drawdowns, as drawdowns() over
 * the whole series gives them: a point's reads the points less than 90 days older and the latest one a week older or
 * more, so the slice starts at the last point 90 days or more before `from`.
 */
function flagsBetween(series: readonly ValuePoint[], from: CalendarDate, until?: CalendarDate): Flag[] {
  const reach = addDays(from, -HIGH_DAYS);
  const first = series.findIndex((point) => point.date > reach);
  if (first === -1) return [];
  const end = until === undefined ? -1 : series.findIndex((point) => point.date >= until);
  return drawdowns(series.slice(Math.max(0, first - 1), end === -1 ? series.length : end))
    .filter((point) => point.date >= from)
    .map((point) => ({ date: point.date, sevenDay: point.sevenDay, fromHigh90: point.fromHigh90, red: redDay(point) }));
}

/**
 * The episode under way on `today`, as redDayEpisode over the whole series finds it, and the flags read for it, the
 * series' last point among them. The last RECENT_DAYS go first; earlier blocks follow only while the episode could
 * have started before what was read, a pause apart: three exact divisions a point make the whole year one long task.
 */
export async function recentEpisode(
  series: readonly [ValuePoint, ...ValuePoint[]],
  today: CalendarDate,
): Promise<{ readonly episode: RedDayEpisode | null; readonly flags: readonly Flag[] }> {
  const last = series.at(-1) ?? series[0];
  const recent = addDays(today, -RECENT_DAYS);
  let from = recent < last.date ? recent : last.date;
  let flags = flagsBetween(series, from);
  for (;;) {
    const episode = redDayEpisode(flags, today);
    const whole = from <= series[0].date;
    if (episode === null || whole || daysBetween(from, episode.start) >= RED_DAY.episodeClearDays) {
      return { episode, flags };
    }
    await pause();
    const earlier = addDays(from, -EARLIER_DAYS);
    flags = [...flagsBetween(series, earlier, from), ...flags];
    from = earlier;
  }
}

export async function redDayModel(history: HistorySource, input: RedDayInput): Promise<RedDayModel> {
  const { plan, entries, today } = input;
  const nextBuy = nextBuyReminder(plan, entries, today)?.due ?? null;
  const held = portfolio(plan, entries).positions.filter((position) => isPositive(position.units));
  const none = {
    held: held.map(({ coin }) => ({ coin, name: nameOf(plan, coin) })),
    figure: null,
    episode: null,
    lastRed: null,
    nextBuy,
    buyDayToday: nextBuy === today,
  } as const;
  if (held.length === 0) return { state: 'nothing-held', ...none };

  // A coin outside the catalogue is never asked for: the history route would not answer it.
  const copies = await read(history, held.map((position) => position.coin).filter(served), input);
  if (copies === null) return { state: 'failed', ...none };
  const closed = new Set(copies.filter((copy) => copy.closes.length > 1).map((copy) => copy.coin));
  // Every held coin unserved or short of closes: no retry brings a figure, so this is not a failed read.
  if (closed.size === 0) return { state: 'no-history', ...none };
  const histories: PriceHistories = {
    currency: plan.payCurrency,
    coins: Object.fromEntries(copies.map((copy) => [copy.coin, copy.closes])),
  };
  const series = heldValueSeries(
    held.filter((position) => closed.has(position.coin)),
    histories,
  );
  const [first, ...rest] = series ?? [];
  if (first === undefined) return { state: 'no-history', ...none };

  await pause();
  const { episode, flags } = await recentEpisode([first, ...rest], today);
  const last = defined(flags.at(-1), 'the last point');
  const red = episode === null ? undefined : flags.find((point) => point.date === episode.last);
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
      shortWindow: rest.length + 1 < WINDOW_DAYS,
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
