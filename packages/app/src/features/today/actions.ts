import {
  type Action,
  type ActionError,
  acknowledgeRuleChange,
  type BannerKey,
  actionsNow,
  type CountryCode,
  type CurrencyCode,
  compare,
  compareInstants,
  defaultFee,
  EntityIdSchema,
  type Entry,
  err,
  isOpen,
  liveEntries,
  ok,
  oneTapEntries,
  overCap,
  type PlannedPart,
  plannedParts,
  type Result,
  resumePlan,
  sameParts,
  withBannerKey,
} from '@proofofcalm/core';
import type { Services } from '../../lib/services';

// Today's actions (docs/DOMAIN.md §3.4, §6 "One-tap"), written through the domain store's queue on the
// snapshot of their turn, so a month another tab or an earlier tap recorded meanwhile gets nothing more.

export type TodayActions = {
  /**
   * Records the planned entries of a due or late action with the day's prices and the last fee and venue.
   * Writes nothing and gives back no entries once the action is no longer open; refuses first when its rows,
   * priced or not, would take the plan past `MAX_ENTRIES` live entries (`too-many-entries`), then with the coin
   * that has no price (`amount-and-units`, the form asks for its units) or with no part to record (`no-coins`).
   * `shown` is the parts the screen showed and their currency: when the plan as stored in the write's turn
   * plans another amount, other parts or pays in another currency (another tab changed it), it writes nothing
   * and refuses with `plan-changed`.
   */
  boughtAsPlanned(action: Action, shown: Shown): Promise<Result<readonly Entry[], ActionError>>;
  /**
   * Ends the pause in effect today on yesterday, or removes one that began today (docs/DOMAIN.md §6
   * "Resume"), on the plan as stored; refused, writing nothing, with `not-paused` when there is none and with
   * `buying-over` once buying ended (another tab ended it since the card rendered).
   * Plan's pause section has its own (plan/actions.ts), which takes a plan no longer paused as resumed.
   */
  resume(): Promise<Result<void, ActionError>>;
  /**
   * Records a rule-change notice as seen (docs/DOMAIN.md §3.12): one write of the plan as stored with the
   * version, its one record, which a change of country resets; the write stamps `prefs.changedAt`, so the
   * backup banner can follow. Writes nothing once the plan has seen the version or stands in another country
   * than the notice's (another tab moved it since the notice showed); a failed write throws.
   */
  dismissRuleChange(country: CountryCode, version: number): Promise<void>;
  /**
   * Records a banner key in this device's `prefs.dismissedBanners` (docs/DOMAIN.md §3.11), on the prefs as
   * stored: the key once, the red-day keys more than a year old dropped; preferences alone stamp no
   * `changedAt`. A failed write throws.
   */
  recordBanner(key: BannerKey): Promise<void>;
};

/** What the card showed for the action: the parts and the currency they are in. */
export type Shown = { readonly parts: readonly PlannedPart[]; readonly currency: CurrencyCode };

/** Thrown inside the write, so a tap that records nothing writes nothing. */
const NOTHING = Symbol('nothing');

export function todayActions({ domain, clock }: Pick<Services, 'domain' | 'clock'>): TodayActions {
  return {
    async boughtAsPlanned(action, shown) {
      const box: { result: Result<readonly Entry[], ActionError> } = { result: ok([]) };
      try {
        await domain.write(({ plan, entries, prices }) => {
          const today = clock.today();
          const open = (candidate: Action) =>
            candidate.kind === action.kind && candidate.slot === action.slot && isOpen(candidate.status);
          if (plan === null) throw NOTHING;
          const current = actionsNow(plan, entries, today).find(open);
          if (current === undefined) throw NOTHING;
          // The amounts recorded are the ones the person saw, or none: the plan as stored decides, and it
          // must still plan what the screen showed, in the currency it showed.
          if (
            shown.currency !== plan.payCurrency ||
            compare(current.plannedAmount, action.plannedAmount) !== 0 ||
            !sameParts(plannedParts(plan, current.plannedAmount), shown.parts)
          ) {
            box.result = err({ code: 'plan-changed' });
            throw NOTHING;
          }
          const live = liveEntries(entries);
          const drafts = oneTapEntries({
            plan,
            action: current,
            prices: prices?.snapshot ?? null,
            today,
            fee: defaultFee(live),
            ids: plan.coins.map(() => EntityIdSchema.parse(crypto.randomUUID())),
            now: clock.now(),
            venue: lastVenue(live),
          });
          // The same cap as the Log's save (§6, §9), before the prices: each draft is a row the tap or its form
          // would write, so a tap past the cap opens no form.
          const full = overCap(entries, [...entries, ...drafts]);
          const unpriced = drafts.find((draft) => draft.units === null);
          if (full !== null) box.result = err(full);
          else if (unpriced !== undefined) box.result = err({ code: 'amount-and-units', coin: unpriced.coin });
          else if (drafts.length === 0) box.result = err({ code: 'no-coins' });
          if (full !== null || unpriced !== undefined || drafts.length === 0) throw NOTHING;
          const recorded = drafts.flatMap(({ units, ...draft }): Entry[] =>
            units === null ? [] : [{ ...draft, units }],
          );
          box.result = ok(recorded);
          return { entries: recorded };
        });
      } catch (error) {
        if (error !== NOTHING) throw error;
      }
      return box.result;
    },
    async resume() {
      const box: { result: Result<void, ActionError> } = { result: ok(undefined) };
      try {
        await domain.write(({ plan }) => {
          if (plan === null) throw NOTHING;
          const resumed = resumePlan(plan, clock.today(), clock.now());
          if (!resumed.ok) {
            box.result = resumed;
            throw NOTHING;
          }
          return { plan: resumed.value };
        });
      } catch (error) {
        if (error !== NOTHING) throw error;
      }
      return box.result;
    },
    async dismissRuleChange(country, version) {
      await domain.write(({ plan }) => {
        if (plan === null || plan.country !== country || plan.countryRuleVersion >= version) return {};
        return { plan: acknowledgeRuleChange(plan, version, clock.now()) };
      });
    },
    async recordBanner(key) {
      await domain.write(({ prefs }) => ({
        prefs: { ...prefs, dismissedBanners: withBannerKey(prefs.dismissedBanners, key, clock.today()) },
      }));
    },
  };
}

/** The venue of the latest entry that named one, as the Log form remembers it; coins added (`held`) never count. */
function lastVenue(live: readonly Entry[]): string | null {
  let latest: Entry | null = null;
  for (const entry of live) {
    if (entry.venue === null || entry.kind === 'held') continue;
    const later =
      latest === null ||
      entry.date > latest.date ||
      (entry.date === latest.date && compareInstants(entry.createdAt, latest.createdAt) > 0);
    if (later) latest = entry;
  }
  return latest?.venue ?? null;
}
