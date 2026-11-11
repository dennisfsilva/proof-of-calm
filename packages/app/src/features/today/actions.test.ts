// @vitest-environment node
import { countryRules, loadProfile } from '@proofofcalm/content';
import {
  type Action,
  actionsNow,
  bannerFor,
  type CalendarDate,
  type CountryRules,
  changeCountry,
  compare,
  EntityIdSchema,
  MAX_ENTRIES,
  type Money,
  type Plan,
  plannedParts,
  primaryAction,
  recordedAmounts,
  ruleChangeNotice,
  sum,
} from '@proofofcalm/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPlanStore } from '../../lib/adapters/memory-store';
import type { Snapshot } from '../../lib/ports';
import type { Services } from '../../lib/services';
import { fixtureNowMs, fixtureSnapshot } from '../../lib/services/fixtures';
import { createTestServices, FIXTURE_PRICES } from '../../lib/services/testing';
import { crossTabChannel } from '../../lib/store/channel';
import { todayActions } from './actions';

// "Bought as planned" (docs/DOMAIN.md §3.4, §6 "One-tap") over the fixture plan on 20 October 2026, whose
// October buy (5 October, 100 € split 70/30 over BTC and ETH) is late.

const NOW = fixtureNowMs('buy');
const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
});

async function tab(options: { snapshot?: Snapshot; priced?: boolean; shared?: ReturnType<typeof memoryPlanStore> }) {
  const { snapshot = fixtureSnapshot(), priced = true, shared } = options;
  const prices = priced ? FIXTURE_PRICES : { ...FIXTURE_PRICES, snapshot: noEth() };
  const planStore = shared ?? memoryPlanStore({ ...snapshot, prices });
  const services = createTestServices({
    planStore,
    nowMs: NOW,
    ...(shared !== undefined && {
      channel: crossTabChannel({ name: 'today-actions-test', tabId: crypto.randomUUID() }),
    }),
  });
  await services.start();
  disposers.push(() => services.dispose());
  return { services, planStore, actions: todayActions(services) };
}

function noEth() {
  const prices = Object.fromEntries(Object.entries(FIXTURE_PRICES.snapshot.prices).filter(([coin]) => coin !== 'ETH'));
  return { ...FIXTURE_PRICES.snapshot, prices } as typeof FIXTURE_PRICES.snapshot;
}

const october = (services: Services) => {
  const { plan, entries } = services.domain.store.getState().snapshot;
  if (plan === null) throw new Error('no plan');
  const action = primaryAction(actionsNow(plan, entries, services.ui.getState().today));
  if (action === null) throw new Error('no action');
  return action;
};
/** What the card shows for the action, the parts and their currency, from the plan as the tab has it. */
const partsOf = (services: Services, action: Action) => {
  const { plan } = services.domain.store.getState().snapshot;
  if (plan === null) throw new Error('no plan');
  return { parts: plannedParts(plan, action.plannedAmount), currency: plan.payCurrency };
};
const oneTaps = (snapshot: Snapshot) => snapshot.entries.filter((entry) => entry.source === 'one-tap');

describe('boughtAsPlanned', () => {
  it('records one entry per coin, dated today for the slot, summing to the monthly amount', async () => {
    const { services, planStore, actions } = await tab({});
    const action = october(services);
    expect(action).toMatchObject({ slot: '2026-10', status: 'late' });
    const result = await actions.boughtAsPlanned(action, partsOf(services, action));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.map((entry) => [entry.coin, entry.amount, entry.date, entry.slot])).toEqual([
      ['BTC', '70', '2026-10-20', '2026-10'],
      ['ETH', '30', '2026-10-20', '2026-10'],
    ]);
    expect(compare(sum(recordedAmounts(result.value)), '100' as Money)).toBe(0);
    // The store keeps its entries in id order.
    const stored = oneTaps(planStore.current());
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(expect.arrayContaining([...result.value]));
  });

  // A wallet's name never becomes a one-tap's venue: coins added (`held`) are not where the plan buys.
  it('takes the venue of the latest purchase, not of coins added later', async () => {
    const snapshot = fixtureSnapshot();
    const bought = snapshot.entries.map((entry) => ({ ...entry, venue: 'Bitvavo' }));
    const [first] = bought;
    if (first === undefined) throw new Error('no entry');
    const ledger = {
      ...first,
      id: EntityIdSchema.parse(crypto.randomUUID()),
      kind: 'held' as const,
      date: '2026-10-01' as CalendarDate,
      slot: null,
      amount: null,
      fee: null,
      venue: 'Ledger',
    };
    const { services, actions } = await tab({ snapshot: { ...snapshot, entries: [...bought, ledger] } });
    const action = october(services);
    const result = await actions.boughtAsPlanned(action, partsOf(services, action));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.map((entry) => entry.venue)).toEqual(['Bitvavo', 'Bitvavo']);
  });

  // The edit form's estimate line says the fee and venue come from the latest purchase or sale that recorded one.
  it('takes the fee and venue of a later sale', async () => {
    const snapshot = fixtureSnapshot();
    const [first] = snapshot.entries;
    if (first === undefined) throw new Error('no entry');
    const sale = {
      ...first,
      id: EntityIdSchema.parse(crypto.randomUUID()),
      kind: 'sell' as const,
      date: '2026-10-10' as CalendarDate,
      slot: null,
      fee: '1.50' as Money,
      venue: 'Kraken',
    };
    const { services, actions } = await tab({ snapshot: { ...snapshot, entries: [...snapshot.entries, sale] } });
    const action = october(services);
    const result = await actions.boughtAsPlanned(action, partsOf(services, action));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.map((entry) => [entry.venue, entry.fee])).toEqual([
      ['Kraken', '1.05'],
      ['Kraken', '0.45'],
    ]);
  });

  it('two tabs tapping the same month write one set', async () => {
    const shared = memoryPlanStore({ ...fixtureSnapshot(), prices: FIXTURE_PRICES });
    const [a, b] = [await tab({ shared }), await tab({ shared })];
    const action = october(b.services);
    const first = await a.actions.boughtAsPlanned(october(a.services), partsOf(a.services, action));
    expect(first.ok && first.value).toHaveLength(2);
    await vi.waitFor(() => expect(oneTaps(b.services.domain.store.getState().snapshot)).toHaveLength(2));
    // Tab b still shows the month open: its tap finds the slot recorded and writes nothing.
    const second = await b.actions.boughtAsPlanned(action, partsOf(b.services, action));
    expect(second).toEqual({ ok: true, value: [] });
    expect(oneTaps(shared.current())).toHaveLength(2);
  });

  it('two taps in one tab write one set', async () => {
    const { services, planStore, actions } = await tab({});
    const action = october(services);
    const shown = partsOf(services, action);
    const results = await Promise.all([actions.boughtAsPlanned(action, shown), actions.boughtAsPlanned(action, shown)]);
    expect(results.map((result) => result.ok && result.value.length)).toEqual([2, 0]);
    expect(oneTaps(planStore.current())).toHaveLength(2);
  });

  it.each([
    ['the monthly amount', { monthlyAmount: '120' as Money }],
    ['only the split', { split: { BTC: '50', ETH: '50' } as Plan['split'] }],
  ])('another tab changes %s after this tab showed the month: the tap refuses and writes nothing', async (_, edit) => {
    const shared = memoryPlanStore({ ...fixtureSnapshot(), prices: FIXTURE_PRICES });
    const [a, b] = [await tab({ shared }), await tab({ shared })];
    // Tab a shows October's action and its parts (100 €, 70/30).
    const action = october(a.services);
    const shown = partsOf(a.services, action);
    // Tab b saves the plan as Settings' savePlan writes it: the fields onto the plan as stored, in its turn.
    await b.services.domain.write(({ plan }) => (plan === null ? {} : { plan: { ...plan, ...edit } }));
    await vi.waitFor(() => expect(a.services.domain.store.getState().snapshot.plan).toMatchObject(edit));
    const result = await a.actions.boughtAsPlanned(action, shown);
    expect(result).toEqual({ ok: false, error: { code: 'plan-changed' } });
    expect(oneTaps(shared.current())).toHaveLength(0);
  });

  it('another tab replaces the plan with a USD plan of the same amounts: the tap refuses and writes nothing', async () => {
    const shared = memoryPlanStore({ ...fixtureSnapshot(), prices: FIXTURE_PRICES });
    const [a, b] = [await tab({ shared }), await tab({ shared })];
    // Tab a shows 100 € split 70/30; tab b's plan becomes 100 $ split 70/30, the same parts in another currency.
    const action = october(a.services);
    const shown = partsOf(a.services, action);
    expect(shown.currency).toBe('EUR');
    await b.services.domain.write(({ plan }) => (plan === null ? {} : { plan: { ...plan, payCurrency: 'USD' } }));
    await vi.waitFor(() => expect(a.services.domain.store.getState().snapshot.plan?.payCurrency).toBe('USD'));
    expect(partsOf(a.services, action).parts).toEqual(shown.parts);
    const result = await a.actions.boughtAsPlanned(action, shown);
    expect(result).toEqual({ ok: false, error: { code: 'plan-changed' } });
    expect(oneTaps(shared.current())).toHaveLength(0);
  });

  it('a plan at 10,000 live entries: the tap refuses with the cap and writes nothing', async () => {
    const { services, planStore, actions } = await tab({ snapshot: atTheCap() });
    const before = planStore.current().entries;
    const action = october(services);
    const result = await actions.boughtAsPlanned(action, partsOf(services, action));
    expect(result).toEqual({ ok: false, error: { code: 'too-many-entries', max: MAX_ENTRIES } });
    expect(planStore.current().entries).toEqual(before);
  });

  it('a plan at 10,000 live entries and a coin with no price: the cap refuses first, nothing written', async () => {
    const { services, planStore, actions } = await tab({ snapshot: atTheCap(), priced: false });
    const before = planStore.current().entries;
    const action = october(services);
    const result = await actions.boughtAsPlanned(action, partsOf(services, action));
    expect(result).toEqual({ ok: false, error: { code: 'too-many-entries', max: MAX_ENTRIES } });
    expect(planStore.current().entries).toEqual(before);
  });

  it('a coin with no price: no tap, nothing written, the coin named for the form', async () => {
    const { services, planStore, actions } = await tab({ priced: false });
    const before = planStore.current().entries;
    const action = october(services);
    const result = await actions.boughtAsPlanned(action, partsOf(services, action));
    expect(result).toEqual({ ok: false, error: { code: 'amount-and-units', coin: 'ETH' } });
    expect(planStore.current().entries).toEqual(before);
  });
});

/** The fixture filled with extra buys to the cap; October stays open, so only the cap refuses the tap. */
function atTheCap(): Snapshot {
  const snapshot = fixtureSnapshot();
  const [first] = snapshot.entries;
  if (first === undefined) throw new Error('no entry');
  const live = snapshot.entries.filter((entry) => entry.deletedAt === null).length;
  const extras = Array.from({ length: MAX_ENTRIES - live }, () => ({
    ...first,
    id: EntityIdSchema.parse(crypto.randomUUID()),
    kind: 'extra' as const,
    slot: null,
    deletedAt: null,
  }));
  return { ...snapshot, entries: [...snapshot.entries, ...extras] };
}

// Resume (docs/DOMAIN.md §6 "Resume") from Today or Plan, on 20 October 2026.
describe('todayActions.resume', () => {
  const withPause = (from: string): Snapshot => {
    const snapshot = fixtureSnapshot();
    const pause = { id: '00000000-0000-4000-8000-000000003000', from, until: null, note: '' } as Plan['pauses'][number];
    return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, pauses: [pause] } };
  };

  it('ends a pause that began before today on yesterday, so today asks for a buy again', async () => {
    const { planStore, actions } = await tab({ snapshot: withPause('2026-10-01') });
    expect(await actions.resume()).toEqual({ ok: true, value: undefined });
    expect(planStore.current().plan?.pauses).toMatchObject([{ from: '2026-10-01', until: '2026-10-19' }]);
  });

  it('removes a pause that began today', async () => {
    const { planStore, actions } = await tab({ snapshot: withPause('2026-10-20') });
    expect((await actions.resume()).ok).toBe(true);
    expect(planStore.current().plan?.pauses).toEqual([]);
  });

  it('refuses with not-paused when no pause is in effect or to come, and writes nothing', async () => {
    const { planStore, actions } = await tab({});
    const before = planStore.current().plan;
    expect(await actions.resume()).toEqual({ ok: false, error: { code: 'not-paused' } });
    expect(planStore.current().plan).toEqual(before);
  });
});

describe('todayActions.dismissRuleChange (docs/DOMAIN.md §3.11, §3.12)', () => {
  const seenUpTo = (countryRuleVersion: number): Snapshot => {
    const snapshot = fixtureSnapshot();
    return { ...snapshot, plan: snapshot.plan && { ...snapshot.plan, countryRuleVersion } };
  };
  /** A country's rules at `version`, so a test can move a profile on as a release would. */
  const rulesAt = async (code: 'PT' | 'DE', version: number): Promise<CountryRules> => {
    const profile = await loadProfile(code);
    if (profile === null) throw new Error(`no ${code} profile`);
    const rules = countryRules(profile);
    return { ...rules, status: { ...rules.status, version } };
  };

  it('stores the version on the plan alone and stamps the change for the backup banner', async () => {
    const { planStore, actions } = await tab({ snapshot: seenUpTo(1) });
    const before = planStore.current().prefs.changedAt;
    await actions.dismissRuleChange('PT', 2);
    const { plan, prefs } = planStore.current();
    if (plan === null) throw new Error('no plan');
    expect(plan.countryRuleVersion).toBe(2);
    expect(prefs.dismissedBanners).toEqual([]);
    expect(prefs.changedAt).not.toBe(before);
    expect(ruleChangeNotice(plan, await rulesAt('PT', 2))).toBeNull();
  });

  it('a dismissal in one country leaves the next country’s same version to be announced', async () => {
    const { services, planStore, actions } = await tab({ snapshot: seenUpTo(1) });
    const germany = await rulesAt('DE', 1);
    await actions.dismissRuleChange('PT', 2);
    await services.domain.write(({ plan }) =>
      plan === null ? {} : { plan: changeCountry(plan, germany, services.clock.now(), 'country').plan },
    );
    const { plan, prefs } = planStore.current();
    if (plan === null) throw new Error('no plan');
    expect(plan).toMatchObject({ country: 'DE', countryRuleVersion: 1 });
    const ruleChange = ruleChangeNotice(plan, await rulesAt('DE', 2));
    expect(ruleChange?.version).toBe(2);
    const today = '2026-10-20' as CalendarDate;
    const banner = bannerFor({
      today,
      redDay: null,
      ruleChange,
      annualReview: false,
      backupNeeded: false,
      dismissed: prefs.dismissedBanners,
    });
    expect(banner?.kind).toBe('rule-change');
  });

  it('works on the plan as stored, keeping what another tab wrote since this tab loaded it', async () => {
    const shared = memoryPlanStore(seenUpTo(1));
    const a = await tab({ shared });
    const b = await tab({ shared });
    const plan = shared.current().plan;
    if (plan === null) throw new Error('no plan');
    await a.services.domain.write({ plan: { ...plan, why: 'From tab a' } });
    await b.actions.dismissRuleChange('PT', 2);
    expect(shared.current().plan).toMatchObject({ why: 'From tab a', countryRuleVersion: 2 });
  });

  it('a plan another tab moved to another country writes nothing and keeps that country’s version', async () => {
    const shared = memoryPlanStore(seenUpTo(1));
    const [a, b] = [await tab({ shared }), await tab({ shared })];
    const germany = await rulesAt('DE', 1);
    // Tab b still shows Portugal's version 2: tab a's move reaches the store before b's broadcast reload lands.
    await a.services.domain.write(({ plan }) =>
      plan === null ? {} : { plan: changeCountry(plan, germany, a.services.clock.now(), 'country').plan },
    );
    const before = shared.current();
    await b.actions.dismissRuleChange('PT', 2);
    expect(shared.current().plan).toMatchObject({ country: 'DE', countryRuleVersion: 1 });
    expect(shared.current()).toEqual(before);
  });

  it('a second dismissal writes nothing', async () => {
    const { planStore, actions } = await tab({ snapshot: seenUpTo(1) });
    await actions.dismissRuleChange('PT', 2);
    const once = planStore.current();
    await actions.dismissRuleChange('PT', 2);
    expect(planStore.current()).toEqual(once);
  });

  it('a plan that has seen a later version writes nothing and keeps it', async () => {
    const { planStore, actions } = await tab({ snapshot: seenUpTo(3) });
    const before = planStore.current();
    await actions.dismissRuleChange('PT', 2);
    expect(planStore.current()).toEqual(before);
  });

  it('with no plan stored writes nothing', async () => {
    const { planStore, actions } = await tab({ snapshot: { ...fixtureSnapshot(), plan: null, entries: [] } });
    await actions.dismissRuleChange('PT', 2);
    expect(planStore.current().prefs.dismissedBanners).toEqual([]);
  });

  it('a failed write throws and stores nothing', async () => {
    const planStore = memoryPlanStore(seenUpTo(1));
    const refusing = { ...planStore, update: () => Promise.reject(new Error('disk full')) };
    const services = createTestServices({ planStore: refusing, nowMs: NOW });
    await services.start();
    disposers.push(() => services.dispose());
    await expect(todayActions(services).dismissRuleChange('PT', 2)).rejects.toThrow('disk full');
    expect(planStore.current().plan?.countryRuleVersion).toBe(1);
  });
});

describe('todayActions.recordBanner (docs/DOMAIN.md §3.11)', () => {
  const withKeys = (dismissedBanners: string[]): Snapshot => {
    const snapshot = fixtureSnapshot();
    return { ...snapshot, prefs: { ...snapshot.prefs, dismissedBanners } };
  };

  it('appends the key once, on the prefs as stored, and stamps nothing', async () => {
    const { planStore, actions } = await tab({ snapshot: withKeys(['backup-needed:2026-09-01']) });
    const before = planStore.current().prefs.changedAt;
    await actions.recordBanner('red-day:2026-10-15');
    await actions.recordBanner('red-day:2026-10-15');
    const { prefs } = planStore.current();
    expect(prefs.dismissedBanners).toEqual(['backup-needed:2026-09-01', 'red-day:2026-10-15']);
    expect(prefs.changedAt).toBe(before);
  });

  it('drops the red-day keys more than 365 days before today', async () => {
    const { planStore, actions } = await tab({ snapshot: withKeys(['red-day:2025-10-19', 'red-day:2025-10-20']) });
    await actions.recordBanner('red-day:2026-10-15');
    expect(planStore.current().prefs.dismissedBanners).toEqual(['red-day:2025-10-20', 'red-day:2026-10-15']);
  });

  it('keeps a key another tab recorded since this tab loaded', async () => {
    const shared = memoryPlanStore(fixtureSnapshot());
    const [a, b] = [await tab({ shared }), await tab({ shared })];
    await a.actions.recordBanner('red-day:2026-10-15');
    await b.actions.recordBanner('backup-needed:2026-10-20');
    expect(shared.current().prefs.dismissedBanners).toEqual(['red-day:2026-10-15', 'backup-needed:2026-10-20']);
  });
});
