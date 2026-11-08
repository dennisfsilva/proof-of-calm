// The importer for the prototype's localStorage['dcaplan.v1'] (docs/DOMAIN.md §7). Pure: it takes the
// parsed JSON, keeps the tolerance of the prototype's normalize() and reports every adjustment it makes
// to what the prototype showed as a coded note, which the shell words.
// size-lint-allow: the prototype's format in one place
import { ENTRY_NOTE_MAX_LENGTH } from '../constants';
import {
  type CalendarDate,
  type Instant,
  instantFromEpochMs,
  parseCalendarDate,
  parseMonthKey,
} from '../dates/calendar';
import { eligibleFrom } from '../holding/eligible-from';
import { isRecord, type JsonObject } from '../json';
import { CURRENCIES, type CurrencyCode } from '../money/currency';
import {
  abs,
  compare,
  fromFloat,
  isPositive,
  isZero,
  type Money,
  minus,
  type Percent,
  plus,
  type Ratio,
  sum,
  type Units,
} from '../money/decimal';
import { defined, err, ok, type Result } from '../result';
import { BACKUP_FORMAT } from '../schema/backup';
import type { Coin } from '../schema/coin';
import type { Entry, EntryKind } from '../schema/entry';
import type { HoldingRule } from '../schema/holding-rule';
import type { CoinId, CountryCode, EntityId } from '../schema/ids';
import {
  type Expectations,
  PLAN_SCHEMA_VERSION,
  type Plan,
  PlanSchema,
  type References,
  type SellWindow,
  type Split,
} from '../schema/plan';
import type { ChartRange, Prefs } from '../schema/prefs';

export type PrototypeImportInput = {
  readonly planId: EntityId;
  /** Confirmed by the user; the import never guesses a country (ADR-0014). */
  readonly country: CountryCode;
  readonly countryRuleVersion: number;
  /** Fresh ids for the entries whose prototype id cannot be kept, one for each. */
  readonly ids: readonly EntityId[];
  readonly now: Instant;
  /** The first buy of a file with neither a first-buy date nor entries, as the prototype did. */
  readonly today: CalendarDate;
};

type CountCode =
  | 'entries-dropped'
  | 'entries-rounded'
  | 'monthly-without-month'
  | 'fees-dropped'
  | 'notes-shortened'
  | 'ids-regenerated';

export type ImportNote =
  | { readonly code: 'coins-defaulted' }
  | { readonly code: 'coin-added'; readonly coin: CoinId }
  | { readonly code: 'split-from-dca-split' }
  | { readonly code: 'split-normalised'; readonly coin: CoinId; readonly from: Percent; readonly to: Percent }
  | { readonly code: 'currency-defaulted'; readonly field: 'payCurrency' | 'displayCurrency' }
  | { readonly code: 'starting-amount-from-steps' }
  | { readonly code: 'plan-amounts-rounded' }
  | { readonly code: 'first-buy-from-entries' }
  | { readonly code: 'last-buy-defaulted' }
  | { readonly code: 'buy-day-clamped' }
  | { readonly code: 'hold-days-defaulted' }
  | { readonly code: 'sell-window-dropped' }
  | { readonly code: 'sell-window-accepted-early' }
  | { readonly code: 'expectation-dropped'; readonly key: keyof Expectations }
  | { readonly code: 'tax-note-dropped' }
  | { readonly code: CountCode; readonly count: number };

export type PrototypeImport = {
  readonly plan: Plan;
  readonly entries: readonly Entry[];
  readonly prefs: Pick<Prefs, 'theme' | 'chartRange' | 'lastBackupAt'>;
  readonly report: readonly ImportNote[];
};

export type PrototypeImportError =
  | { readonly code: 'not-prototype' }
  | { readonly code: 'invalid-plan'; readonly issues: readonly string[] };

/** Which importer a parsed file is for. */
export function recogniseImport(json: unknown): 'backup' | 'prototype' | null {
  if (!isRecord(json)) return null;
  if (json.format === BACKUP_FORMAT) return 'backup';
  return Array.isArray(json.purchases) ? 'prototype' : null;
}

// The prototype's DEFAULTS and RECOMMENDED settings, which normalize() merged under every file.
const DEFAULT_SETTINGS: JsonObject = {
  base: 'EUR',
  quote: 'USD',
  monthly: 1000,
  initial: 0,
  dcaDay: 1,
  lastBuy: '2028-06-01',
  holdDays: 365,
  sellFrom: '2029-06-01',
  sellTo: '2029-10-31',
  peakFrom: '2029-09-01',
  peakTo: '2029-10-31',
  exitBy: '2029-12-31',
  halving: '2028-04-15',
};
const DEFAULT_LAST_BUY = '2028-06-01' as CalendarDate;
const DEFAULT_EXPECT: JsonObject = { bear: 0.7, base: 2.3, bull: 3.5 };
const RECOMMENDED_SPLIT: JsonObject = { BTC: 40, ETH: 30, SOL: 15, LINK: 15 };
// The recommended coins, with the decimals of docs/DESIGN.md §5; colours follow the palette.
const KNOWN_COINS: readonly Coin[] = [
  { id: 'BTC' as CoinId, name: 'Bitcoin', geckoId: 'bitcoin', decimals: 8 },
  { id: 'ETH' as CoinId, name: 'Ethereum', geckoId: 'ethereum', decimals: 6 },
  { id: 'SOL' as CoinId, name: 'Solana', geckoId: 'solana', decimals: 4 },
  { id: 'LINK' as CoinId, name: 'Chainlink', geckoId: 'chainlink', decimals: 4 },
];
const RANGES: Readonly<Record<string, ChartRange>> = { '7': '7d', '30': '30d', '90': '90d', '365': '1y' };
const COIN_ID = /^[A-Z0-9.$-]{1,12}$/;
const GECKO_ID = /^[a-z0-9-]{1,60}$/;
const PROTOTYPE_ID = /^p[a-z0-9]+$/;
/** The prototype's own kinds; any other, `held` included, comes in as `extra` (docs/DOMAIN.md §7). */
const PROTOTYPE_KINDS = ['dca', 'lump', 'extra', 'sell'] as const satisfies readonly EntryKind[];
const DATE_START = /^(\d{4})-(\d{2})(?:-(\d{2}))?/;
const MAX_HOLD_DAYS = 36_500;
const SPLIT_TOLERANCE = '0.01' as Percent;

/** `+value` in the prototype, when it is finite. */
function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** The prototype's pd(): `YYYY-MM-DD` or `YYYY-MM` at the start of a string. */
function readDate(value: unknown): CalendarDate | null {
  const match = typeof value === 'string' ? DATE_START.exec(value) : null;
  return match === null ? null : parseCalendarDate(`${match[1]}-${match[2]}-${match[3] ?? '01'}`);
}

/** Whether rounding a number to `dp` places changed it. */
const rounded = (value: number, dp: number) => compare(fromFloat(value, dp), fromFloat(value, 30)) !== 0;

function makeCoin(id: string, raw: JsonObject): Coin {
  const known = KNOWN_COINS.find((coin) => coin.id === id);
  const gecko = String(raw.gecko ?? '')
    .trim()
    .toLowerCase();
  const decimals = Math.round(Number(raw.dec));
  const color = typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : null;
  return {
    id: id as CoinId,
    name:
      String(raw.name ?? '')
        .trim()
        .slice(0, 40) ||
      known?.name ||
      id,
    geckoId: GECKO_ID.test(gecko) ? gecko : (known?.geckoId ?? id.toLowerCase().replace(/[^a-z0-9-]/g, '-')),
    decimals: Number.isFinite(decimals) ? Math.min(10, Math.max(0, decimals)) : (known?.decimals ?? 4),
    ...(color === null ? {} : { color }),
  };
}

/** The prototype's normCoin(), knowing only the four recommended coins beyond what the file says. */
function readCoins(settings: JsonObject): Coin[] {
  const coins: Coin[] = [];
  for (const raw of Array.isArray(settings.coins) ? settings.coins : []) {
    const id = isRecord(raw)
      ? String(raw.id ?? '')
          .trim()
          .toUpperCase()
          .slice(0, 12)
      : '';
    if (isRecord(raw) && COIN_ID.test(id) && !coins.some((coin) => coin.id === id)) coins.push(makeCoin(id, raw));
  }
  return coins;
}

function readFee(value: unknown): { readonly fee: number | null; readonly dropped: boolean } {
  if (value === null || value === undefined || value === '') return { fee: null, dropped: false };
  const fee = finite(value);
  return fee !== null && fee >= 0 ? { fee, dropped: false } : { fee: null, dropped: true };
}

function readEntries(
  purchases: readonly unknown[],
  input: PrototypeImportInput,
): { entries: Entry[]; counts: Record<CountCode, number> } {
  const counts: Record<CountCode, number> = {
    'entries-dropped': 0,
    'entries-rounded': 0,
    'monthly-without-month': 0,
    'fees-dropped': 0,
    'notes-shortened': 0,
    'ids-regenerated': 0,
  };
  const used = new Set<string>();
  let fresh = 0;
  const entries: Entry[] = [];
  for (const purchase of purchases) {
    const raw = isRecord(purchase) ? purchase : {};
    const eur = finite(raw.eur);
    const quantity = finite(raw.units);
    const coin = String(raw.coin ?? '').toUpperCase();
    const date = readDate(raw.date);
    if (eur === null || quantity === null || !COIN_ID.test(coin) || date === null) {
      counts['entries-dropped'] += 1;
      continue;
    }
    const amount = fromFloat<Money>(Math.abs(eur), 2);
    const units = fromFloat<Units>(Math.abs(quantity), 10);
    if (!isPositive(amount) || !isPositive(units)) {
      counts['entries-dropped'] += 1;
      continue;
    }
    const { fee, dropped } = readFee(raw.fee);
    if (dropped) counts['fees-dropped'] += 1;
    const changed = [rounded(eur, 2), rounded(quantity, 10), fee !== null && rounded(fee, 2)];
    if (changed.some(Boolean)) counts['entries-rounded'] += 1;
    let kind: EntryKind = PROTOTYPE_KINDS.find((candidate) => candidate === raw.kind) ?? 'extra';
    const slot = kind === 'dca' && typeof raw.slot === 'string' ? parseMonthKey(raw.slot) : null;
    if (kind === 'dca' && slot === null) {
      counts['monthly-without-month'] += 1;
      kind = 'extra';
    }
    const note = String(raw.note ?? '');
    if (note.length > ENTRY_NOTE_MAX_LENGTH) counts['notes-shortened'] += 1;
    const keep = typeof raw.id === 'string' && PROTOTYPE_ID.test(raw.id) && !used.has(raw.id);
    if (!keep) counts['ids-regenerated'] += 1;
    const id = keep ? (raw.id as EntityId) : defined(input.ids[fresh++], 'a fresh id');
    used.add(id);
    entries.push({
      id,
      kind,
      date,
      coin: coin as CoinId,
      amount,
      units,
      fee: fee === null ? null : fromFloat<Money>(fee, 2),
      note: note.slice(0, ENTRY_NOTE_MAX_LENGTH),
      slot,
      venue: null,
      source: 'import-prototype',
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    });
  }
  return { entries, counts };
}

type SplitPart = { readonly coin: CoinId; readonly value: number; readonly share: Percent };

/** The split per coin, closing a rounding residue of at most 0.01 on the largest share (§7). */
function readSplit(settings: JsonObject, coins: readonly Coin[], notes: ImportNote[]): SplitPart[] {
  if (!isRecord(settings.split) && isRecord(settings.dcaSplit)) notes.push({ code: 'split-from-dca-split' });
  const source = isRecord(settings.split)
    ? settings.split
    : isRecord(settings.dcaSplit)
      ? settings.dcaSplit
      : RECOMMENDED_SPLIT;
  const parts = coins.map((coin): SplitPart => {
    const value = Math.max(0, finite(source[coin.id]) ?? 0);
    return { coin: coin.id, value, share: fromFloat<Percent>(value, 4) };
  });
  const residue = minus('100' as Percent, sum(parts.map((part) => part.share)));
  if (isZero(residue) || compare(abs(residue), SPLIT_TOLERANCE) > 0) return parts;
  const largest = parts.reduce(
    (best, part) => (compare(part.share, best.share) > 0 ? part : best),
    parts[0] as SplitPart,
  );
  const to = plus(largest.share, residue);
  notes.push({ code: 'split-normalised', coin: largest.coin, from: largest.share, to });
  return parts.map((part) => (part === largest ? { ...part, share: to } : part));
}

/** The prototype's isRecommended(): the four coins with shares within 0.01 of 40/30/15/15. */
function isRecommended(parts: readonly SplitPart[]): boolean {
  return (
    parts.length === Object.keys(RECOMMENDED_SPLIT).length &&
    Object.entries(RECOMMENDED_SPLIT).every(([coin, share]) =>
      parts.some((part) => part.coin === coin && Math.abs(part.value - Number(share)) < 0.01),
    )
  );
}

function readCurrency(
  value: unknown,
  fallback: CurrencyCode,
  field: 'payCurrency' | 'displayCurrency',
  notes: ImportNote[],
): CurrencyCode {
  const code = CURRENCIES.find((currency) => currency === value);
  if (code !== undefined) return code;
  notes.push({ code: 'currency-defaulted', field });
  return fallback;
}

function readSellWindow(merged: JsonObject, lastBuy: CalendarDate, rule: HoldingRule, notes: ImportNote[]) {
  const [opens, closes, exitBy] = [merged.sellFrom, merged.sellTo, merged.exitBy].map(readDate);
  if (
    opens === null ||
    closes === null ||
    exitBy === null ||
    opens === undefined ||
    closes === undefined ||
    exitBy === undefined
  ) {
    if ([opens, closes, exitBy].some((value) => value !== null)) notes.push({ code: 'sell-window-dropped' });
    return null;
  }
  // The prototype let a window open before the last purchase passed the rule; keep it, accepted.
  const early = opens < eligibleFrom(lastBuy, rule);
  if (early) notes.push({ code: 'sell-window-accepted-early' });
  const window: SellWindow = { opens, closes, exitBy, ...(early ? { acceptedEarlyOpen: true as const } : {}) };
  return window;
}

/** Prototype JSON → a valid plan, its entries, the device preferences and the report of adjustments. */
export function importPrototype(
  json: unknown,
  input: PrototypeImportInput,
): Result<PrototypeImport, PrototypeImportError> {
  if (!isRecord(json) || !Array.isArray(json.purchases)) return err({ code: 'not-prototype' });
  const settings = isRecord(json.settings) ? json.settings : {};
  const merged: JsonObject = { ...DEFAULT_SETTINGS, ...settings };
  const notes: ImportNote[] = [];

  const listed = readCoins(settings);
  if (listed.length === 0) notes.push({ code: 'coins-defaulted' });
  const coins = listed.length === 0 ? [...KNOWN_COINS] : listed;
  const { entries, counts } = readEntries(json.purchases, input);
  for (const entry of entries) {
    if (coins.some((coin) => coin.id === entry.coin)) continue;
    coins.push(makeCoin(entry.coin, {}));
    notes.push({ code: 'coin-added', coin: entry.coin });
  }

  const parts = readSplit(settings, coins, notes);
  const payCurrency = readCurrency(merged.base, 'EUR', 'payCurrency', notes);
  const displayCurrency = readCurrency(merged.quote, 'USD', 'displayCurrency', notes);

  const fromSteps = (settings.initial === undefined || settings.initial === null) && Array.isArray(settings.lumpSteps);
  if (fromSteps) notes.push({ code: 'starting-amount-from-steps' });
  const steps: readonly unknown[] = Array.isArray(settings.lumpSteps) ? settings.lumpSteps : [];
  const initial = fromSteps
    ? steps.reduce<number>((total, step) => {
        const eur = isRecord(step) ? finite(step.eur) : null;
        return eur !== null && eur > 0 ? total + eur : total;
      }, 0)
    : Math.max(0, finite(merged.initial) ?? 0);
  const monthly = Math.max(0, finite(merged.monthly) ?? 0);
  if (rounded(monthly, 2) || rounded(initial, 2)) notes.push({ code: 'plan-amounts-rounded' });

  const fileFirst = readDate(merged.firstBuy);
  const earliest = entries.reduce<CalendarDate | null>(
    (min, entry) => (min === null || entry.date < min ? entry.date : min),
    null,
  );
  const absent = settings.firstBuy === undefined || settings.firstBuy === null;
  const fromEntries = earliest !== null && (fileFirst === null || absent);
  if (fromEntries) notes.push({ code: 'first-buy-from-entries' });
  const firstBuy = fromEntries ? earliest : (fileFirst ?? input.today);
  const fileLast = readDate(merged.lastBuy);
  if (fileLast === null) notes.push({ code: 'last-buy-defaulted' });
  const lastBuy = fileLast ?? DEFAULT_LAST_BUY;

  const day = finite(merged.dcaDay);
  const buyDay = Math.min(28, Math.max(1, Math.round(day || 1)));
  if (day !== buyDay) notes.push({ code: 'buy-day-clamped' });
  const hold = finite(merged.holdDays);
  const holdValid = hold !== null && hold > 0;
  if (!holdValid) notes.push({ code: 'hold-days-defaulted' });
  const holdingRule: HoldingRule = {
    kind: 'days',
    days: holdValid ? Math.min(MAX_HOLD_DAYS, Math.max(1, Math.round(hold))) : 365,
    effect: 'exempt',
  };
  const sellWindow = readSellWindow(merged, lastBuy, holdingRule, notes);

  const references = Object.fromEntries(
    (['peakFrom', 'peakTo', 'halving'] as const).flatMap((key) => {
      const value = readDate(merged[key]);
      return value === null ? [] : [[key, value]];
    }),
  ) as References;
  const expect: JsonObject = { ...DEFAULT_EXPECT, ...(isRecord(settings.expect) ? settings.expect : {}) };
  const expectations: Expectations = {};
  for (const key of ['bear', 'base', 'bull'] as const) {
    const value = finite(expect[key]);
    if (value !== null && value >= 0) expectations[key] = fromFloat<Ratio>(value, 6);
    else notes.push({ code: 'expectation-dropped', key });
  }
  if (typeof merged.taxNote === 'string' && merged.taxNote.trim() !== '') notes.push({ code: 'tax-note-dropped' });
  for (const [code, count] of Object.entries(counts) as [CountCode, number][]) {
    if (count > 0) notes.push({ code, count });
  }

  const checks = isRecord(json.checks) ? json.checks : {};
  const meta = isRecord(json.meta) ? json.meta : {};
  const backup = finite(meta.lastBackupAt);
  const parsed = PlanSchema.safeParse({
    id: input.planId,
    schemaVersion: PLAN_SCHEMA_VERSION,
    country: input.country,
    countryRuleVersion: input.countryRuleVersion,
    payCurrency,
    displayCurrency,
    coins,
    split: Object.fromEntries(parts.map((part) => [part.coin, part.share])) as Split,
    monthlyAmount: fromFloat<Money>(monthly, 2),
    startingAmount: fromFloat<Money>(initial, 2),
    firstBuy,
    buyDay,
    lastBuy,
    holdingRule,
    sellWindow,
    references,
    expectations,
    pauses: [],
    skips: [],
    endedBuyingOn: null,
    sellChecks: { part1: Boolean(checks.sell1), part2: Boolean(checks.sell2), part3: Boolean(checks.sell3) },
    why: '',
    templateId: isRecommended(parts) ? 'cycle-plan' : null,
    // The prototype never showed the plan-creation disclosure: nothing is recorded (docs/DOMAIN.md §2.1).
    riskAcknowledgedAt: null,
    riskWordingVersion: 0,
    createdAt: input.now,
    updatedAt: input.now,
  });
  if (!parsed.success) {
    return err({
      code: 'invalid-plan',
      issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }
  return ok({
    plan: parsed.data,
    entries,
    prefs: {
      theme: meta.theme === 'light' || meta.theme === 'dark' ? meta.theme : 'system',
      // Only a range of its own: `__proto__`, `constructor` or `toString` falls back as any unknown value does.
      chartRange: (Object.hasOwn(RANGES, String(meta.range)) ? RANGES[String(meta.range)] : undefined) ?? '30d',
      lastBackupAt: backup !== null && backup > 0 ? instantFromEpochMs(Math.round(backup)) : null,
    },
    report: notes,
  });
}
