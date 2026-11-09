// The services (docs/ARCHITECTURE.md "Inside packages/app"; ADR-0019, ADR-0020, ADR-0042): what the
// screens need from the shell, composed once by the host from its adapters and handed down through the
// provider. The domain store asks the browser to keep the data after the first entry, the rules of the
// plan's country follow the plan, live prices are refreshed one request at a time, and today's date
// moves on the host's tick. Nothing here reads the clock, storage or the network itself: the ports do.
import type { CountryCode, CountryRules } from '@proofofcalm/core';
import type { ToastManager } from '@proofofcalm/ui/components/toast';
import type { StoreApi } from 'zustand/vanilla';
import type { Drafts } from '../adapters/drafts';
import { shouldFetchPrices } from '../adapters/price-source';
import { noAnalytics } from '../adapters/web-platform';
import type { UiLanguage } from '../i18n/locale';
import type { Analytics, Clock, HistorySource, PlanStore, Platform, PriceSource } from '../ports';
import { type CrossTabChannel, localOnly } from '../store/channel';
import { createDomainStore, type DomainStore } from '../store/domain';
import { createUiStore, type UiState } from '../store/ui';
import type { Countries } from './countries';
import { createRedDay } from './red-day';
import type { RedDayPort } from './red-day-types';

export type ServicesOptions = {
  readonly planStore: PlanStore;
  readonly clock: Clock;
  readonly priceSource: PriceSource;
  /** The daily closes for the Portfolio charts, the device cache first. */
  readonly historySource: HistorySource;
  readonly platform: Platform;
  readonly drafts: Drafts;
  readonly toasts: ToastManager;
  /** Default: counts nothing (noAnalytics). */
  readonly analytics?: Analytics;
  /** Default: this tab alone (localOnly). */
  readonly channel?: CrossTabChannel;
  /** The country profile for the plan's country; null for one the content has no profile for. */
  readonly rules: (country: CountryCode) => Promise<CountryRules | null>;
  /** The country library's models for the Learn screens (`./countries`). */
  readonly countries: Countries;
  /** Default: English. */
  readonly language?: UiLanguage;
};

export type Services = {
  readonly clock: Clock;
  readonly platform: Platform;
  readonly drafts: Drafts;
  readonly toasts: ToastManager;
  readonly analytics: Analytics;
  readonly language: UiLanguage;
  readonly domain: DomainStore;
  readonly ui: StoreApi<UiState>;
  readonly prices: {
    /**
     * Fetches the pay currency's prices when the client TTL says so. Never rejects: a failure, the API's
     * or this device's, lands in `ui.pricesFailure` (the host calls it from a timer and on focus).
     */
    refresh(): Promise<void>;
  };
  /** One coin's daily closes in one currency (the Portfolio charts); a failure is a value. */
  readonly history: HistorySource;
  /** Any country's rules, as the shell loads the plan's (the country change's select); null without a profile. */
  readonly rules: (country: CountryCode) => Promise<CountryRules | null>;
  /** The country library (the Learn screens): the list and one country's card as plain models. */
  readonly countries: Countries;
  /** The Red day page's figures and past falls as plain models, over the history source (`./red-day`). */
  readonly redDay: RedDayPort;
  /** Hydrates the snapshot, loads the plan country's rules and sets today. */
  start(): Promise<void>;
  /** Moves `today` on when the date changed in the user's zone (the host calls it on an interval and on focus). */
  tick(): void;
  dispose(): void;
};

export function createServices(options: ServicesOptions): Services {
  const { planStore, clock, priceSource, historySource, platform, drafts, toasts } = options;
  const analytics = options.analytics ?? noAnalytics;
  const language = options.language ?? 'en';
  const domain = createDomainStore(planStore, options.channel ?? localOnly, {
    afterWipe: () => drafts.clearAll(),
    now: () => clock.now(),
  });
  const ui = createUiStore({ today: clock.today() });

  // ADR-0019: persistence is asked for after the first entry, never on load. The ready snapshot going
  // from no entries to some is that moment, through a write or an import of this tab (another tab's
  // first write arrives the same way and asks too, harmlessly); hydration arrives from `loading`, so a
  // store opened with entries does not ask.
  const unsubscribePersist = domain.store.subscribe((state, previous) => {
    const first = previous.snapshot.entries.length === 0 && state.snapshot.entries.length > 0;
    if (previous.status === 'ready' && first) void platform.persistStorage().catch(() => undefined);
  });

  // The shell waits once, for the first ready snapshot and its country's rules (or no plan); a later
  // change of country never unmounts the screens again (ADR-0020 readings, "The first-boot gate").
  const boot = () => {
    const { status, snapshot } = domain.store.getState();
    const country = snapshot.plan?.country ?? null;
    if (ui.getState().booted || status !== 'ready') return;
    if (country === null || ui.getState().rules?.country === country) ui.getState().setBooted();
  };

  // The rules follow the plan's country: set once loaded, unless the country moved on meanwhile, and
  // cleared only when there is no plan; until the new ones load, the previous country's stay in the
  // store, which `useRules` hides and the formatters keep. A loader that throws (the profile's chunk did
  // not arrive) leaves no rules rather than a shell that never finishes booting.
  let wanted: CountryCode | null = null;
  let loading: Promise<void> = Promise.resolve();
  const follow = (country: CountryCode | null) => {
    if (country === wanted) return;
    wanted = country;
    if (country === null) {
      ui.getState().setRules(null);
      return;
    }
    loading = options
      .rules(country)
      .catch(() => null)
      .then((rules) => {
        if (wanted !== country) return;
        ui.getState().setRules({ country, rules });
        boot();
      });
  };
  const unsubscribeRules = domain.store.subscribe((state) => {
    if (state.status !== 'ready') return;
    follow(state.snapshot.plan?.country ?? null);
    boot();
  });

  const tick = () => {
    const today = clock.today();
    if (today !== ui.getState().today) ui.getState().setToday(today);
  };

  // The price source answers with a Result and the store persists before the snapshot changes
  // (ADR-0019 "Write order"), so a source that throws or a store that refuses the prices leaves the
  // snapshot as it was; the failure is held as a value like an API failure, and the next refresh runs.
  let inFlight: Promise<void> | null = null;
  const refresh = (): Promise<void> => {
    if (inFlight !== null) return inFlight;
    const { plan, prices } = domain.store.getState().snapshot;
    if (plan === null) return Promise.resolve();
    const currency = plan.payCurrency;
    if (!shouldFetchPrices(prices, { currency, now: clock.now() })) return Promise.resolve();
    inFlight = (async () => {
      try {
        const answer = await priceSource.latest(currency);
        if (!answer.ok) {
          ui.getState().setPricesFailure(answer.error);
          return;
        }
        await domain.write({ prices: answer.value });
        ui.getState().setPricesFailure(null);
      } catch {
        ui.getState().setPricesFailure({ kind: 'local' });
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };

  return {
    clock,
    platform,
    drafts,
    toasts,
    analytics,
    language,
    domain,
    ui,
    prices: { refresh },
    history: historySource,
    rules: options.rules,
    countries: options.countries,
    redDay: createRedDay(historySource),
    async start() {
      await domain.hydrate();
      await loading;
      tick();
    },
    tick,
    dispose() {
      unsubscribePersist();
      unsubscribeRules();
      domain.dispose();
    },
  };
}
