// Services over fakes, for the tests, the stories and the shell's test: a memory plan store, a clock
// fixed on 2026-10-20 10:00 UTC in Lisbon or at `nowMs`, a price source that answers one fixed state
// fetched at the clock's time, a history source whose closes end on the clock's date, a platform that
// records what it was asked, drafts over a Map, the toast manager, no rules and the country library over
// the profiles loaded once.
import { type CountryProfile, loadProfiles } from '@proofofcalm/content';
import { type CalendarDate, type CoinId, ok, type Percent, type Price, type PriceSnapshot } from '@proofofcalm/core';
import { createToastManager } from '@proofofcalm/ui/components/toast';
import { systemClock } from '../adapters/clock';
import { sessionDrafts } from '../adapters/drafts';
import { memoryPlanStore } from '../adapters/memory-store';
import { NAMESPACE_LOADERS } from '../i18n/namespaces';
import type { CachedHistory, HistorySource, Platform, PriceSource, PricesState, Snapshot } from '../ports';
import { createCountries, type ProfileLoaders } from './countries';
import { createServices, type Services, type ServicesOptions } from './create';
import type { RedDayModel, RedDayPort } from './red-day-types';

export const TEST_NOW_MS = Date.UTC(2026, 9, 20, 10);
/** TEST_NOW_MS's date in Lisbon, the test clock's today. */
export const TEST_TODAY = '2026-10-20' as CalendarDate;

/** Live prices fetched at the test clock's time, so a refresh right after is within the client TTL. */
export const TEST_PRICES: PricesState = {
  snapshot: {
    at: '2026-10-20T09:59:30.000Z' as PriceSnapshot['at'],
    prices: { BTC: { EUR: '60000.12' as Price, USD: '70000' as Price } } as PriceSnapshot['prices'],
    change24h: { BTC: '-1.25' as Percent } as PriceSnapshot['change24h'] & object,
  },
  currency: 'EUR',
  fetchedAt: '2026-10-20T10:00:00.000Z' as PricesState['fetchedAt'],
  stale: false,
  source: 'live',
};

/** TEST_PRICES with ETH as well, so both coins of the fixture plan (./fixtures) have a value. */
export const FIXTURE_PRICES: PricesState = {
  ...TEST_PRICES,
  snapshot: {
    ...TEST_PRICES.snapshot,
    prices: {
      ...TEST_PRICES.snapshot.prices,
      ETH: { EUR: '2500.5' as Price, USD: '2900' as Price },
    } as PriceSnapshot['prices'],
  },
};

export type RecordingPlatform = Platform & {
  readonly calls: {
    persist: number;
    readonly shares: { readonly title: string; readonly text?: string; readonly url?: string }[];
    readonly downloads: { readonly name: string; readonly content: string; readonly type: string }[];
    reloads: number;
  };
};

export function recordingPlatform({ installed = false }: { readonly installed?: boolean } = {}): RecordingPlatform {
  const calls: RecordingPlatform['calls'] = { persist: 0, shares: [], downloads: [], reloads: 0 };
  return {
    native: false,
    calls,
    async share(data) {
      calls.shares.push(data);
      return true;
    },
    async download(name, content, type) {
      calls.downloads.push({ name, content, type });
      return true;
    },
    async persistStorage() {
      calls.persist += 1;
      return true;
    },
    reload() {
      calls.reloads += 1;
    },
    installed: () => installed,
  };
}

const DAY_MS = 86_400_000;
const instantAt = (ms: number) => new Date(ms).toISOString() as PricesState['fetchedAt'];

/**
 * The state as fetched at `nowMs`: `fetchedAt` and the snapshot's `at` move by the same distance, so
 * TEST_PRICES at TEST_NOW_MS comes back as it is.
 */
export function pricesAt(state: PricesState, nowMs: number): PricesState {
  const shift = nowMs - Date.parse(state.fetchedAt);
  const at = instantAt(Date.parse(state.snapshot.at) + shift) as PriceSnapshot['at'];
  return { ...state, snapshot: { ...state.snapshot, at }, fetchedAt: instantAt(nowMs) };
}

export function fixedPriceSource(state: PricesState = TEST_PRICES, nowMs = TEST_NOW_MS): PriceSource {
  const fetched = pricesAt(state, nowMs);
  return { latest: async (currency) => ok({ ...fetched, currency }) };
}

/** Three daily closes of BTC fetched at the test clock's time; the source answers them for any coin and currency. */
export const TEST_HISTORY: CachedHistory = {
  coin: 'BTC' as CachedHistory['coin'],
  currency: 'EUR',
  closes: [
    ['2026-10-18', '58000'],
    ['2026-10-19', '59500.5'],
    ['2026-10-20', '60000.12'],
  ] as unknown as CachedHistory['closes'],
  fetchedAt: '2026-10-20T10:00:00.000Z' as CachedHistory['fetchedAt'],
};

/** The closes moved to the UTC days ending on `nowMs`'s date, fetched at `nowMs`: TEST_HISTORY at TEST_NOW_MS. */
function fixedHistorySource(history: CachedHistory = TEST_HISTORY, nowMs = TEST_NOW_MS): HistorySource {
  const last = history.closes.length - 1;
  const closes = history.closes.map(([, close], index) => [
    instantAt(nowMs - (last - index) * DAY_MS).slice(0, 10),
    close,
  ]) as unknown as CachedHistory['closes'];
  const fetched: CachedHistory = { ...history, closes, fetchedAt: instantAt(nowMs) };
  return { closes: async (coin, currency) => ok({ ...fetched, coin, currency }) };
}

/** A sessionStorage over a Map, for the drafts. */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'> {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    key: (index) => [...items.keys()][index] ?? null,
  };
}

/** The fixture plan's coins as the red-day model names them (./fixtures). */
const FIXTURE_HELD: RedDayModel['held'] = [
  { coin: 'BTC' as CoinId, name: 'Bitcoin' },
  { coin: 'ETH' as CoinId, name: 'Ethereum' },
];

/** A red-day port whose model answers at once that no episode is under way, over the fixture plan's coins. */
export function clearRedDay(): RedDayPort {
  const model: RedDayModel = {
    state: 'clear',
    held: FIXTURE_HELD,
    figure: null,
    episode: null,
    lastRed: null,
    nextBuy: null,
    buyDayToday: false,
  };
  return { model: async () => model, pastFalls: async () => [] };
}

/**
 * A red-day port whose model answers an episode under way since 15 Oct 2026, its last Red day `lastRed.date`,
 * over the `held` coins (Bitcoin alone by default); `answer` replaces the model's promise (one that never settles,
 * or rejects).
 */
export function episodeRedDay(
  lastRed: NonNullable<RedDayModel['lastRed']>,
  held: RedDayModel['held'] = FIXTURE_HELD.slice(0, 1),
  answer?: () => Promise<RedDayModel>,
): RedDayPort {
  const model: RedDayModel = {
    state: 'episode',
    held,
    figure: {
      coins: held.map(({ coin }) => coin),
      missing: [],
      sevenDay: lastRed.sevenDay,
      fromHigh90: lastRed.fromHigh90,
      first: '2026-07-22' as CalendarDate,
      last: lastRed.date,
      currency: 'EUR',
      shortWindow: false,
    },
    episode: { start: '2026-10-15' as CalendarDate, last: lastRed.date },
    lastRed,
    nextBuy: null,
    buyDayToday: false,
  };
  return { model: answer ?? (async () => model), pastFalls: async () => [] };
}

export type TestServicesOptions = Partial<ServicesOptions> & {
  readonly snapshot?: Snapshot;
  readonly nowMs?: number;
};

let profiles: Promise<CountryProfile[]> | undefined;

/** The profile loaders over the files read once per module (the round trip of each import() under Vitest, ./testing-modules). */
function profilesInMemory(): ProfileLoaders {
  const all = () => (profiles ??= loadProfiles());
  return { all, one: async (code) => (await all()).find((profile) => profile.code === code) ?? null };
}

export function createTestServices(overrides: TestServicesOptions = {}): Services {
  const { snapshot, nowMs = TEST_NOW_MS, ...options } = overrides;
  const storage = memoryStorage();
  const clock = options.clock ?? systemClock('Europe/Lisbon', () => nowMs);
  return createServices({
    planStore: memoryPlanStore(snapshot),
    clock,
    priceSource: fixedPriceSource(TEST_PRICES, nowMs),
    historySource: fixedHistorySource(TEST_HISTORY, nowMs),
    platform: recordingPlatform(),
    drafts: sessionDrafts(() => storage),
    toasts: createToastManager(),
    rules: async () => null,
    countries: createCountries(profilesInMemory(), clock),
    ...options,
  });
}

let preloaded: Promise<void> | undefined;

/**
 * Loads every module the product reaches with import() below the features: the lazy message namespaces
 * and the jurisdiction profiles, with the feature modules a test names (a lazy screen, the log behind
 * Today's sheets). Vite transforms each module on its first request, which under load takes longer than a
 * findBy waits (1 s); a test or story that awaits this first finds each import() answered from the module
 * cache, so its findBy waits on renders only. It registers no namespace and resolves no lazy component: a
 * lazy screen still shows its fallback on its first render.
 */
export function preloadLazyModules(features: readonly (() => Promise<unknown>)[] = []): Promise<void> {
  preloaded ??= Promise.all([...Object.values(NAMESPACE_LOADERS).map((load) => load()), loadProfiles()]).then(
    () => undefined,
  );
  return Promise.all([preloaded, ...features.map((load) => load())]).then(() => undefined);
}
