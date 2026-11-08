import {
  type ActionError,
  type EndedBuying,
  EntityIdSchema,
  endBuying,
  err,
  type Instant,
  ok,
  type Plan,
  pauseOn,
  pausePlan,
  type Result,
  resumePlan,
  undoEndBuying,
} from '@proofofcalm/core';
import type { Services } from '../../lib/services';
import type { OwnPlanWrite } from '../../lib/store/domain';

// The Plan screen's writers (docs/DOMAIN.md §6 "Pause", "Resume", "End buying today"), through the domain
// store's queue on the plan as stored in its turn: a pause another tab wrote meanwhile that covers today
// stands for this one, any other it would overlap refuses it; a resume or an end of buying another tab wrote
// first stands for this one. One that stands for another tab's, and every refused end of buying or undo,
// writes nothing and reloads the plan as stored before it returns, so its caller sees that tab's change
// without waiting for the broadcast reload. Today's own Resume (today/actions.ts) still refuses a plan no
// longer paused.

/** What the Undo of an end of buying needs: what the end changed, the stamp it wrote and the plan it ended. */
export type EndUndo = EndedBuying & { readonly endedAt: Instant; readonly planId: Plan['id'] };

export type PlanActions = {
  /**
   * Pauses the plan from today until resumed, with no note. Refused, writing nothing, when it overlaps a
   * pause the plan has (`pauses-overlap`, an imported pause still to come); with no plan left, a plan
   * already paused today (another tab paused first) or an ended plan (another tab ended buying, which
   * `pausePlan` refuses with `buying-over`), it writes nothing, reloads the plan as stored and returns ok.
   */
  pause(): Promise<Result<void, ActionError>>;
  /**
   * Ends the pause `resumePlan` ends; with no plan left, or none to end (another tab resumed first), it
   * writes nothing, reloads the plan as stored and returns ok.
   */
  resume(): Promise<Result<void, ActionError>>;
  /**
   * Makes today the last buy day and returns what its undo needs. With no plan left, or a plan another tab
   * ended first, it writes nothing, reloads and returns ok(null); a refusal of `endBuying` (`before-first-buy`,
   * `buying-over`, which only another tab's edit causes here) writes nothing, reloads and returns it.
   */
  endBuying(): Promise<Result<EndUndo | null, ActionError>>;
  /**
   * The toast's Undo: brings back the last buy day the end replaced, for the latest end only. With no plan
   * left, a plan another tab wrote since the end, a write of this tab's since that changed the last buy day,
   * the end or the plan's id (`domain.ownPlanWrites`), or a plan changed since (`undoEndBuying` refuses), it
   * writes nothing, reloads and returns `plan-changed`.
   */
  undoEndBuying(before: EndUndo): Promise<Result<void, ActionError>>;
};

/** Thrown inside the write, so a refused pause writes nothing. */
const NOTHING = Symbol('nothing');

export function planActions({ domain, clock }: Pick<Services, 'domain' | 'clock'>): PlanActions {
  // The action stands for another tab's: it ends showing the plan as stored. A load that fails goes to the
  // domain store's failure, which the error surface words; the action itself was accepted, so it stays ok.
  const reload = () => domain.hydrate().catch(() => undefined);
  return {
    async pause() {
      const id = EntityIdSchema.parse(crypto.randomUUID());
      const box: { result: Result<void, ActionError>; reload: boolean } = { result: ok(undefined), reload: false };
      try {
        await domain.write(({ plan }) => {
          // Another tab paused first, or ended buying, before its broadcast reload: there is nothing to pause.
          if (plan === null || plan.endedBuyingOn !== null || pauseOn(plan, clock.today()) !== null) {
            box.reload = true;
            throw NOTHING;
          }
          const paused = pausePlan(plan, { from: clock.today(), until: null, note: '', id, now: clock.now() });
          if (!paused.ok) {
            box.result = paused;
            throw NOTHING;
          }
          return { plan: paused.value };
        });
      } catch (error) {
        if (error !== NOTHING) throw error;
      }
      if (box.reload) await reload();
      return box.result;
    },
    async resume() {
      try {
        await domain.write(({ plan }) => {
          if (plan === null) throw NOTHING;
          const resumed = resumePlan(plan, clock.today(), clock.now());
          // Its refusals, `not-paused` (another tab resumed first) and `buying-over` (another tab ended
          // buying), both leave no pause to end: write nothing and reload the plan as stored.
          if (!resumed.ok) throw NOTHING;
          return { plan: resumed.value };
        });
      } catch (error) {
        if (error !== NOTHING) throw error;
        await reload();
      }
      return ok(undefined);
    },
    async endBuying() {
      let result: Result<EndUndo | null, ActionError> = ok(null);
      try {
        await domain.write(({ plan }) => {
          // Another tab ended first: what the person asked for is true already.
          if (plan === null || plan.endedBuyingOn !== null) throw NOTHING;
          const today = clock.today();
          const ended = endBuying(plan, today, clock.now());
          if (!ended.ok) {
            result = ended;
            throw NOTHING;
          }
          result = ok({ lastBuy: plan.lastBuy, endedOn: today, endedAt: ended.value.updatedAt, planId: plan.id });
          return { plan: ended.value };
        });
      } catch (error) {
        if (error !== NOTHING) throw error;
        await reload();
      }
      return result;
    },
    async undoEndBuying(before) {
      try {
        await domain.write(({ plan }) => {
          // Another tab's end over its own edit of the last buy day passes the core's check, and so does this
          // tab's second end after a later last buy, or an import of another plan ended today: only this tab's
          // writes since the end that left the plan, its last buy day and its end as the end wrote them restore.
          if (plan === null) throw NOTHING;
          const since = domain.ownPlanWrites(before.endedAt, plan.updatedAt);
          const kept = (write: OwnPlanWrite) =>
            write.id === before.planId && write.lastBuy === before.endedOn && write.endedBuyingOn === before.endedOn;
          if (since === null || !since.every(kept)) throw NOTHING;
          const restored = undoEndBuying(plan, before, clock.now());
          if (!restored.ok) throw NOTHING;
          return { plan: restored.value };
        });
      } catch (error) {
        if (error !== NOTHING) throw error;
        await reload();
        return err({ code: 'plan-changed' });
      }
      return ok(undefined);
    },
  };
}
