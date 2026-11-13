// The exchange import's preview as data (docs/DOMAIN.md §3.13): the summary's counts, the held line, one item per
// entry of each section and the counted lines. The component words them; nothing here decides what is imported.
import { compareEntries, type Entry, type ExchangeImportPlan, liveEntries } from '@proofofcalm/core';

export type ExchangePreviewModel = ReturnType<typeof previewModel>;

const estimatesOf = (plan: ExchangeImportPlan) =>
  plan.replaced.reduce((count, item) => count + item.estimates.length, 0);

/**
 * The preview of `plan`; `ticked` is the plan the same file and Log give with `addHeld: true`, passed whenever the
 * held line shows unticked, so the line can count the estimates ticking would replace.
 */
export function previewModel(plan: ExchangeImportPlan, ticked: ExchangeImportPlan = plan) {
  const of = (kind: Entry['kind']) => plan.entries.filter((entry) => entry.kind === kind);
  const byId = new Map(plan.entries.map((entry) => [entry.id, entry]));
  const replacing = new Set(plan.replaced.flatMap((item) => item.by));
  const replaces = plan.replaced.flatMap(({ estimates, by }) => {
    const added = by.flatMap((id) => byId.get(id) ?? []);
    return estimates.map((estimate) => ({
      estimate,
      by: added,
      otherVenue: added.some((entry) => entry.venue !== estimate.venue),
    }));
  });
  const replaced = estimatesOf(plan);
  return {
    summary: {
      entries: plan.entries.length,
      monthly: of('dca').length,
      extra: of('extra').length,
      sales: of('sell').length,
      added: of('held').length,
      replaced,
    },
    noneInCurrency: plan.noneInCurrency,
    held: plan.held === null ? null : { ...plan.held, replaces: estimatesOf(ticked) - replaced },
    fills: of('dca').filter((entry) => !replacing.has(entry.id)),
    replaces,
    extra: of('extra'),
    sales: of('sell'),
    added: of('held'),
    recorded: plan.recorded,
    startingAmount: plan.startingAmount,
    withdrawals: plan.withdrawals,
    leftOut: plan.leftOut,
    counted: { imported: plan.imported, deleted: plan.deleted, unitsCut: plan.unitsCut, feesInCoin: plan.feesInCoin },
  };
}

/**
 * The venue field's first value (D7): the spelling of the latest live entry whose venue is `name`, ignoring case
 * and outer spaces, else `name`. Only an entry's venue counts, not a move's destination.
 */
export function defaultVenue(entries: readonly Entry[], name: string): string {
  const same = (venue: string | null) => venue?.trim().toLowerCase() === name.trim().toLowerCase();
  const latest = liveEntries(entries)
    .filter((entry) => same(entry.venue))
    .sort(compareEntries)
    .at(-1);
  return latest?.venue?.trim() ?? name;
}
