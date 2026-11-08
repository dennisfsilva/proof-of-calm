// Four synthetic prototype states for the golden fixtures (docs/DOMAIN.md §7), built the way the
// prototype stored them: amounts as numbers in the pay currency, units at the coin's decimals, fees
// split by amount and rounded to cents, ids `p…`. Deterministic: the price path is a fixed wave.

type Kind = 'dca' | 'lump' | 'extra' | 'sell';

export type Purchase = {
  id: string;
  kind: Kind;
  date: string;
  coin: string;
  eur: number;
  units: number;
  fee: number | null;
  note: string;
  slot?: string;
};

export type GoldenState = {
  /** The fixture's file name in packages/core/test/golden. */
  name: string;
  /** The prototype's "today", with the clock at noon UTC. */
  today: string;
  /** Prices in the pay currency on `today`. */
  prices: Record<string, number>;
  state: {
    version: 4;
    settings: Record<string, unknown>;
    purchases: Purchase[];
    checks: { sell1: boolean; sell2: boolean; sell3: boolean };
    meta: Record<string, unknown>;
  };
};

const CATALOG: Record<string, { name: string; gecko: string; dec: number; color: string }> = {
  BTC: { name: 'Bitcoin', gecko: 'bitcoin', dec: 8, color: '#eb6834' },
  ETH: { name: 'Ethereum', gecko: 'ethereum', dec: 6, color: '#6250d6' },
  SOL: { name: 'Solana', gecko: 'solana', dec: 4, color: '#1baf7a' },
  LINK: { name: 'Chainlink', gecko: 'chainlink', dec: 3, color: '#2a78d6' },
};
const BASE_PRICE: Record<string, number> = { BTC: 52_000, ETH: 1_900, SOL: 120, LINK: 14 };
const TODAY_PRICES = { BTC: 60_000, ETH: 2_000, SOL: 150, LINK: 15 };

const coin = (id: string) => ({ id, ...CATALOG[id] });
const day = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000;
const round = (value: number, dp: number) => Number(value.toFixed(dp));

/** A made-up close: the coin's base price on a slow wave, so units differ from month to month. */
function price(id: string, date: string): number {
  return (BASE_PRICE[id] ?? 1) * (1 + 0.15 * Math.sin(day(date) / 37));
}

function builder() {
  let sequence = 0;
  const purchases: Purchase[] = [];
  /** One transaction: the amounts per coin and a fee split by amount, as the prototype's form did. */
  const add = (kind: Kind, date: string, amounts: Record<string, number>, fee: number | null, extra = {}) => {
    const total = Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
    for (const [id, eur] of Object.entries(amounts)) {
      sequence += 1;
      purchases.push({
        id: `p${(46_656 + sequence).toString(36)}`,
        kind,
        date,
        coin: id,
        eur,
        units: round(eur / price(id, date), CATALOG[id]?.dec ?? 4),
        fee: fee === null ? null : round((fee * eur) / total, 2),
        note: '',
        ...(kind === 'dca' ? { slot: date.slice(0, 7) } : {}),
        ...extra,
      });
    }
  };
  return { purchases, add };
}

const EMPTY_DATES = { sellFrom: '', sellTo: '', exitBy: '', peakFrom: '', peakTo: '', halving: '' };
const META = { updatedAt: 0, changedAt: 0, lastBackupAt: 0, theme: null, range: '30', setupDone: true };

/** Two coins in the first year, with late months, an extra buy and a sale. */
function twoCoins(): GoldenState {
  const { purchases, add } = builder();
  add('lump', '2026-01-01', { BTC: 350, ETH: 150 }, 1);
  for (const [slot, date, fee] of [
    ['2026-01', '2026-01-01', null],
    ['2026-02', '2026-02-02', 0.5],
    ['2026-04', '2026-04-01', null],
    ['2026-05', '2026-05-04', 0.5],
    ['2026-06', '2026-06-01', null],
    ['2026-07', '2026-07-01', null],
    ['2026-08', '2026-08-03', 0.5],
  ] as const) {
    add('dca', date, { BTC: 70, ETH: 30 }, fee, { slot });
  }
  add('extra', '2026-06-15', { BTC: 200 }, null, { note: 'dip' });
  add('sell', '2026-09-20', { ETH: 50 }, null, { units: 0.02, note: 'car' });
  return {
    name: 'two-coins',
    today: '2026-10-16',
    prices: { BTC: TODAY_PRICES.BTC, ETH: TODAY_PRICES.ETH },
    state: {
      version: 4,
      settings: {
        base: 'EUR',
        quote: 'USD',
        strategy: 'custom',
        monthly: 100,
        initial: 500,
        firstBuy: '2026-01-01',
        taxNote: '',
        coins: [coin('BTC'), coin('ETH')],
        split: { BTC: 70, ETH: 30 },
        dcaDay: 1,
        lastBuy: '2026-12-01',
        holdDays: 365,
        ...EMPTY_DATES,
        expect: { bear: 0.7, base: 2.3, bull: 3.5 },
      },
      purchases,
      checks: { sell1: false, sell2: false, sell3: false },
      meta: META,
    },
  };
}

/** The recommended cycle plan, started mid-month, with fees, a late month and a partial sale. */
function cyclePlan(): GoldenState {
  const { purchases, add } = builder();
  const split = { BTC: 400, ETH: 300, SOL: 150, LINK: 150 };
  for (let index = 0; index <= 16; index += 1) {
    const month = new Date(Date.UTC(2025, 5 + index, 1));
    const slot = month.toISOString().slice(0, 7);
    if (slot === '2026-02') continue;
    const date = index === 0 ? '2025-06-15' : `${slot}-${index % 3 === 0 ? '06' : '05'}`;
    add('dca', date, split, index % 2 === 0 ? 1 : null, { slot });
  }
  add('extra', '2026-03-12', { BTC: 250, SOL: 50 }, 0.3);
  add('sell', '2026-08-20', { SOL: 120 }, 0.12, { units: 0.75 });
  return {
    name: 'cycle-plan',
    today: '2026-10-16',
    prices: TODAY_PRICES,
    state: {
      version: 4,
      settings: {
        base: 'EUR',
        quote: 'USD',
        strategy: 'recommended',
        monthly: 1000,
        initial: 0,
        firstBuy: '2025-06-15',
        taxNote: '',
        coins: [coin('BTC'), coin('ETH'), coin('SOL'), coin('LINK')],
        split: { BTC: 40, ETH: 30, SOL: 15, LINK: 15 },
        dcaDay: 5,
        lastBuy: '2028-06-01',
        holdDays: 365,
        sellFrom: '2029-06-01',
        sellTo: '2029-10-31',
        peakFrom: '2029-09-01',
        peakTo: '2029-10-31',
        exitBy: '2029-12-31',
        halving: '2028-04-15',
        expect: { bear: 0.7, base: 2.3, bull: 3.5 },
      },
      purchases,
      checks: { sell1: false, sell2: false, sell3: false },
      meta: META,
    },
  };
}

/** Past the buy phase and inside the sell window, a third already sold. */
function sellWindow(): GoldenState {
  const { purchases, add } = builder();
  add('lump', '2024-01-10', { BTC: 600, ETH: 400 }, 2);
  for (let index = 0; index < 18; index += 1) {
    const month = new Date(Date.UTC(2024, index, 1));
    const slot = month.toISOString().slice(0, 7);
    add('dca', `${slot}-${index % 4 === 0 ? '11' : '10'}`, { BTC: 120, ETH: 80 }, index % 5 === 0 ? 0.4 : null, {
      slot,
    });
  }
  add('sell', '2026-07-15', { BTC: 1500 }, 3, { units: 0.025 });
  add('sell', '2026-09-16', { ETH: 900 }, null, { units: 0.4 });
  return {
    name: 'sell-window',
    today: '2026-10-16',
    prices: { BTC: TODAY_PRICES.BTC, ETH: TODAY_PRICES.ETH },
    state: {
      version: 4,
      settings: {
        base: 'EUR',
        quote: 'USD',
        strategy: 'custom',
        monthly: 200,
        initial: 1000,
        firstBuy: '2024-01-10',
        taxNote: '',
        coins: [coin('BTC'), coin('ETH')],
        split: { BTC: 60, ETH: 40 },
        dcaDay: 10,
        lastBuy: '2025-06-10',
        holdDays: 365,
        sellFrom: '2026-07-01',
        sellTo: '2026-12-31',
        exitBy: '2027-03-31',
        peakFrom: '',
        peakTo: '',
        halving: '',
        expect: { bear: 0.7, base: 2.3, bull: 3.5 },
      },
      purchases,
      checks: { sell1: true, sell2: false, sell3: false },
      meta: META,
    },
  };
}

/** The last buy past, November 2024 left open, today inside the sell window: the phase leads (§3.3). */
function lateInSell(): GoldenState {
  const { purchases, add } = builder();
  for (let index = 0; index < 12; index += 1) {
    const slot = new Date(Date.UTC(2024, 2 + index, 1)).toISOString().slice(0, 7);
    if (slot !== '2024-11') add('dca', `${slot}-10`, { BTC: 90, ETH: 60 }, index % 4 === 0 ? 0.3 : null, { slot });
  }
  return {
    name: 'late-in-sell',
    today: '2026-10-20',
    prices: { BTC: TODAY_PRICES.BTC, ETH: TODAY_PRICES.ETH },
    state: {
      version: 4,
      settings: {
        base: 'EUR',
        quote: 'USD',
        strategy: 'custom',
        monthly: 150,
        initial: 0,
        firstBuy: '2024-03-10',
        taxNote: '',
        coins: [coin('BTC'), coin('ETH')],
        split: { BTC: 60, ETH: 40 },
        dcaDay: 10,
        lastBuy: '2025-02-10',
        holdDays: 365,
        sellFrom: '2026-03-01',
        sellTo: '2026-12-31',
        exitBy: '2027-03-31',
        peakFrom: '',
        peakTo: '',
        halving: '',
        expect: { bear: 0.7, base: 2.3, bull: 3.5 },
      },
      purchases,
      checks: { sell1: false, sell2: false, sell3: false },
      meta: META,
    },
  };
}

export const STATES: readonly GoldenState[] = [twoCoins(), cyclePlan(), sellWindow(), lateInSell()];
