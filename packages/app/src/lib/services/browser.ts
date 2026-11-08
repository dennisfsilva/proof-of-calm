// The services over the browser's adapters (docs/ARCHITECTURE.md, ADR-0045 §9): IndexedDB for the plan,
// the device clock, the prices and the daily closes (IndexedDB's history cache first) from the API at
// the host's base, the web platform, drafts in
// sessionStorage, the one toast manager, the cross-tab channel, no analytics (ADR-0028), the rules
// of the plan's country from packages/content's generated rules file (ADR-0049: the profile with its
// card text loads only where something shows it), the generic profile's rules standing in for a
// country without one, and the country library over the profile loaders. The hosts' main.tsx calls it
// once and starts it after the first render.
import { GENERIC_COUNTRY, loadProfile, loadProfiles, loadRules } from '@proofofcalm/content';
import { createToastManager } from '@proofofcalm/ui/components/toast';
import {
  apiHistorySource,
  apiPriceSource,
  createApiClient,
  idbPlanStore,
  noAnalytics,
  sessionDrafts,
  systemClock,
  webPlatform,
} from '../adapters';
import { crossTabChannel } from '../store';
import { createCountries } from './countries';
import { createServices, type Services } from './create';

export function createBrowserServices({ apiBase }: { readonly apiBase: string }): Services {
  const clock = systemClock();
  const api = createApiClient({ baseUrl: apiBase, fetch: (input, init) => fetch(input, init) });
  const planStore = idbPlanStore({ clock });
  return createServices({
    planStore,
    clock,
    priceSource: apiPriceSource(api, clock),
    historySource: apiHistorySource(api, planStore.history, clock),
    platform: webPlatform(),
    drafts: sessionDrafts(),
    toasts: createToastManager(),
    analytics: noAnalytics,
    channel: crossTabChannel(),
    rules: async (code) => (await loadRules(code)) ?? loadRules(GENERIC_COUNTRY),
    countries: createCountries({ all: loadProfiles, one: loadProfile }, clock),
  });
}
