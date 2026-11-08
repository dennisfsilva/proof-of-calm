// Runs the prototype's own functions in jsdom on one state (docs/DOMAIN.md §7). The clock is fixed at
// noon UTC on the state's day, the process runs in UTC, the network is refused, and the prices are the
// ones seeded into the prototype's cache, so the outputs depend on the state alone.
import { JSDOM, VirtualConsole } from 'jsdom';

export type PrototypeRun = {
  readonly state: unknown;
  /** YYYY-MM-DD */
  readonly today: string;
  /** Pay-currency prices by coin, as the prototype's cache holds them. */
  readonly prices: Readonly<Record<string, number>>;
  /** The pay currency's code in the prototype's cache, lower case. */
  readonly currency?: string;
};

// Browser APIs the prototype calls on load that jsdom lacks, and the fixed clock. Evaluated inside the
// window, so `Date` stays the window's own class.
const patch = (now: number) => `(() => {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(${now}); else super(...args); }
    static now() { return ${now}; }
  }
  globalThis.Date = FixedDate;
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
})();`;

// The prototype keeps everything inside one IIFE. One line added at its end, in memory, hands the
// view functions to the harness; the functions themselves run unchanged.
const VIEWS = [
  'ymd',
  'slotStatus',
  'nowActions',
  'phase',
  'planTotals',
  'portfolio',
  'eligibility',
  'transactions',
  'sellTranches',
];
const SCRIPT_END = /\}\)\(\);\s*<\/script>/g;

export function instrument(html: string): string {
  const last = [...html.matchAll(SCRIPT_END)].at(-1);
  if (last === undefined)
    throw new Error('The prototype script no longer ends with "})();"; update the golden harness');
  const expose = `globalThis.__golden = { ${VIEWS.join(', ')} };\n`;
  return `${html.slice(0, last.index)}${expose}${html.slice(last.index)}`;
}

// What the core is compared with: the prototype's views, dates written as YYYY-MM-DD.
const EXTRACT = `(() => {
  const { ymd, slotStatus, nowActions, phase, planTotals, portfolio, eligibility, transactions, sellTranches } = globalThis.__golden;
  const day = (value) => (value ? ymd(value) : null);
  const p = portfolio();
  const e = eligibility();
  return JSON.stringify({
    slots: slotStatus().map((slot) => ({ key: slot.key, due: day(slot.due), done: slot.done, late: slot.late })),
    actions: nowActions().map((action) => ({
      type: action.type,
      slot: action.slot === undefined ? null : action.slot,
      due: day(action.due),
      eur: action.eur,
      late: Boolean(action.late),
      done: Boolean(action.done),
    })),
    phase: phase().key,
    totals: planTotals(),
    portfolio: {
      per: p.per.map((x) => ({
        id: x.id, units: x.units, bought: x.bought, sold: x.sold, invested: x.invested, proceeds: x.proceeds,
        fees: x.fees, price: x.price, value: x.value, avg: x.avg, pnl: x.pnl, pnlPct: x.pnlPct, buys: x.buys, sells: x.sells,
      })),
      invested: p.invested, proceeds: p.proceeds, value: p.value, pnl: p.pnl, pnlPct: p.pnlPct,
      fees: p.fees, buys: p.buys, sells: p.sells, priced: p.priced,
    },
    eligibility: { share: e.share, allBy: day(e.allBy), any: e.any },
    transactions: transactions().map((tx) => ({
      key: tx.key, kind: tx.kind, date: tx.date, total: tx.total, fees: tx.fees, elig: day(tx.elig),
      items: tx.items.map((item) => ({ coin: item.coin, eur: item.eur, units: item.units })),
    })),
    tranches: sellTranches().map((tranche) => ({ k: tranche.k, when: day(tranche.when) })),
  });
})()`;

export function runPrototype(html: string, run: PrototypeRun): unknown {
  process.env.TZ = 'UTC';
  const now = Date.parse(`${run.today}T12:00:00Z`);
  const currency = run.currency ?? 'eur';
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    // jsdom reports the APIs it does not implement (canvas, layout) the same way; only real errors count.
    if (!error.message.startsWith('Not implemented')) errors.push(error.message);
  });
  const dom = new JSDOM(instrument(html), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://prototype.invalid/',
    virtualConsole,
    beforeParse(window) {
      window.eval(patch(now));
      window.localStorage.setItem('dcaplan.v1', JSON.stringify(run.state));
      const prices = Object.fromEntries(
        Object.entries(run.prices).map(([coin, price]) => [coin, { [currency]: price }]),
      );
      window.localStorage.setItem(
        'dcaplan.cache.v4',
        JSON.stringify({ prices, updatedAt: now, charts: {}, manual: true }),
      );
    },
  });
  try {
    if (errors.length > 0) throw new Error(`The prototype failed to load: ${errors.join('; ')}`);
    return JSON.parse(String(dom.window.eval(EXTRACT)));
  } finally {
    dom.window.close();
  }
}
