// Settings' writers (docs/ARCHITECTURE.md "Inside packages/app"): the plan tabs' save (docs/DOMAIN.md §6
// "Edit the plan"), the country change (§6 "Change country") and the Data section's (docs/DOMAIN.md §3.13). For the data section the core builds the files and the import, the platform saves a file, the domain store writes the rows.
// A JSON backup records `lastBackupAt` (the backup line), unless it left out rows from a newer version;
// the CSV log is not a backup and does not. An import is refused while such rows exist (§3.13).
// Both exports count `export_downloaded` (ADR-0028), the one event an export has. Every read and write runs in
// the domain store's queue, on the snapshot as earlier writes and the other tabs' changes left it.

import type { ProfileCode } from '@proofofcalm/content';
import {
  applyImport,
  type BackupFile,
  type CalendarDate,
  type CoinId,
  type CountryRules,
  type CurrencyAnswer,
  changeCountry,
  currencyQuestion,
  EntityIdSchema,
  type Entry,
  err,
  exportBackup,
  exportFileName,
  holdingContext,
  type ImportMode,
  type ImportNote,
  type ImportRefusal,
  type ImportResult,
  type Instant,
  importPrototype,
  logCsv,
  ok,
  type Plan,
  type PlanIssue,
  planIssues,
  type Result,
  stampAfter,
  writtenBackup,
} from '@proofofcalm/core';
import { BRAND } from '../../lib/brand';
import { reportError } from '../../lib/errors';
import type { Snapshot, WipedRows } from '../../lib/ports';
import type { Services } from '../../lib/services';
import { downloadTaxYear, type TaxYearWords } from './tax-year';

/** Saved and recorded; not saved (no plan, or the platform could not); saved, but its date not stored. */
type ExportOutcome = 'saved' | 'not-saved' | 'date-not-stored';
/**
 * What an import did: a plan replaced, a plan taken onto a device without one, or entries added; or why it applied
 * nothing and wrote nothing (Add missing from a file in another pay currency, or more entries than a plan holds,
 * docs/DOMAIN.md §3.13, or rows from a newer version on this device).
 */
export type ImportOutcome =
  | { readonly kind: 'replaced' | 'imported' | 'added'; readonly result: ImportResult }
  | { readonly kind: 'refused'; readonly refusal: DataRefusal };
/** Why an import applied nothing: the core's refusals, and the one only the stored rows can give. */
export type DataRefusal = ImportRefusal | { readonly code: 'newer-rows' };
/**
 * A note of the report as Settings words it: the core's, two with the value of the plan taken that their words
 * name, and the purchases Add missing stored of a coin this plan does not list.
 */
export type ReportNote =
  | Exclude<ImportNote, { readonly code: 'last-buy-defaulted' | 'buy-day-clamped' }>
  | { readonly code: 'last-buy-defaulted'; readonly date: CalendarDate }
  | { readonly code: 'buy-day-clamped'; readonly day: number }
  | { readonly code: 'coin-not-in-plan'; readonly coin: CoinId; readonly count: number };
/** A prototype import's outcome with the report of what it adjusted, or the issues of a plan it cannot take. */
export type PrototypeOutcome =
  | (ImportOutcome & { readonly report: readonly ReportNote[] })
  | { readonly kind: 'invalid'; readonly issues: readonly string[] };

export type DataActions = {
  exportJson(): Promise<ExportOutcome>;
  /** Saves the log as CSV; false when there is no plan or the platform could not save it. */
  exportCsv(): Promise<boolean>;
  /** Saves the file of the tax year ending in `endingIn`, its header in `words` (./tax-year); false as exportCsv. */
  exportTaxYear(endingIn: number, words: TaxYearWords): Promise<boolean>;
  /** Applies the file to what the device holds and writes the plan and the entries in one write. */
  importBackup(file: BackupFile, mode: ImportMode): Promise<ImportOutcome>;
  /**
   * Imports an export of the DCA plan page (docs/DOMAIN.md §7) as a backup is imported. The plan's country
   * when a plan exists, else `country`, confirmed by the person (ADR-0014): the import never guesses one.
   */
  importPrototype(json: unknown, mode: ImportMode, country: ProfileCode | null): Promise<PrototypeOutcome>;
  /**
   * "Delete everything": the plan, the entries and what the device keeps beside them go at once; the rows
   * come back for the undo. Null when nothing is left to delete, so a second press keeps the first undo.
   */
  deleteEverything(): Promise<WipedRows | null>;
  /** The undo: false when another tab started or imported a plan since, which then stays. */
  undoDelete(rows: WipedRows): Promise<boolean>;
};

/**
 * The snapshot and the moment in its turn in the queue: an empty write stores nothing and tells no other
 * tab. A write queued behind it stamps a later `changedAt` than this moment (docs/DOMAIN.md §3.11).
 */
async function current(services: Services): Promise<{ snapshot: Snapshot; now: Instant }> {
  let read: { snapshot: Snapshot; now: Instant } | null = null;
  await services.domain.write((snapshot) => {
    read = { snapshot, now: services.clock.now() };
    return {};
  });
  if (read === null) throw new Error('the queued read did not run');
  return read;
}

/** Whether live rows a newer version wrote are on this device: an export leaves them out. */
const leavesRowsOut = ({ newer }: Snapshot) => newer.plans + newer.entries > 0;

/** Whether any row a newer version wrote is on this device, a tombstone included: an import is refused. */
const holdsNewerRows = (snapshot: Snapshot) => leavesRowsOut(snapshot) || snapshot.newerTombstones > 0;

export function dataActions(services: Services): DataActions {
  const { domain, platform, clock, analytics, ui } = services;
  const today = () => ui.getState().today;

  return {
    async exportJson() {
      const { snapshot, now } = await current(services);
      const { plan, entries } = snapshot;
      if (plan === null) return 'not-saved';
      const file = writtenBackup(exportBackup(plan, entries, now));
      const name = exportFileName(BRAND.slug, 'backup', today());
      const saved = await platform.download(name, `${JSON.stringify(file, null, 2)}\n`, 'application/json');
      if (!saved) return 'not-saved';
      analytics.count('export_downloaded');
      try {
        // A copy without the newer rows is no backup of them, so the banner keeps asking for one.
        await domain.write((snapshot) =>
          leavesRowsOut(snapshot) ? {} : { prefs: { ...snapshot.prefs, lastBackupAt: now } },
        );
        return 'saved';
      } catch (error) {
        reportError(error);
        return 'date-not-stored';
      }
    },
    async exportCsv() {
      const { plan, entries } = (await current(services)).snapshot;
      if (plan === null) return false;
      // After a change of country the previous country's rules stay loaded until the new ones arrive.
      const loaded = ui.getState().rules;
      const rules = loaded !== null && loaded.country === plan.country ? loaded.rules : null;
      const name = exportFileName(BRAND.slug, 'log', today());
      const saved = await platform.download(name, logCsv(plan, entries, holdingContext(plan, rules)), 'text/csv');
      if (saved) analytics.count('export_downloaded');
      return saved;
    },
    async exportTaxYear(endingIn, words) {
      const { plan, entries } = (await current(services)).snapshot;
      return plan !== null && downloadTaxYear(services, { plan, entries }, endingIn, words);
    },
    async importBackup(file, mode) {
      let outcome: ImportOutcome | null = null;
      await domain.write((snapshot) => {
        if (holdsNewerRows(snapshot)) {
          outcome = { kind: 'refused', refusal: { code: 'newer-rows' } };
          return {};
        }
        const result = applyImport(snapshot, file, mode, clock.now());
        if (result.refused !== null) {
          outcome = { kind: 'refused', refusal: result.refused };
          return {};
        }
        const kind = snapshot.plan === null ? 'imported' : mode === 'add-missing' ? 'added' : 'replaced';
        outcome = { kind, result };
        // Adding nothing changes nothing: a write would stamp changedAt and bring the backup banner back.
        if (kind === 'added' && result.added === 0) return {};
        return { plan: result.plan, entries: result.entries };
      });
      if (outcome === null) throw new Error('the import did not run');
      return outcome;
    },
    async importPrototype(json, mode, confirmed) {
      // The rules load before the write; a plan whose country another tab changed meanwhile loads them again.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const country = (await current(services)).snapshot.plan?.country ?? confirmed;
        if (country === null) throw new Error('a prototype import with no plan needs a confirmed country');
        const rules = await services.rules(country);
        if (rules === null) throw new Error(`no rules for ${country}`);
        const purchases = (json as { readonly purchases?: unknown }).purchases;
        const ids = (Array.isArray(purchases) ? purchases : []).map(() => EntityIdSchema.parse(crypto.randomUUID()));
        let outcome: PrototypeOutcome | null = null;
        await domain.write((snapshot) => {
          if (holdsNewerRows(snapshot)) {
            outcome = { kind: 'refused', refusal: { code: 'newer-rows' }, report: [] };
            return {};
          }
          if ((snapshot.plan?.country ?? confirmed) !== country) return {};
          const now = clock.now();
          const planId = snapshot.plan?.id ?? EntityIdSchema.parse(crypto.randomUUID());
          const input = { planId, country, countryRuleVersion: rules.status.version, ids, now, today: today() };
          const read = importPrototype(json, input);
          if (!read.ok) {
            outcome = { kind: 'invalid', issues: read.error.code === 'invalid-plan' ? read.error.issues : [] };
            return {};
          }
          const { plan, entries, prefs, report } = read.value;
          const result = applyImport(snapshot, exportBackup(plan, entries, now), mode, now);
          if (result.refused !== null) {
            outcome = { kind: 'refused', refusal: result.refused, report: [] };
            return {};
          }
          const kind = snapshot.plan === null ? 'imported' : mode === 'add-missing' ? 'added' : 'replaced';
          if (kind === 'added' && snapshot.plan !== null) {
            const here = new Set(snapshot.entries.map((entry) => entry.id));
            const added = result.entries.filter((entry) => !here.has(entry.id));
            outcome = { kind, result, report: keptPlanReport(report, snapshot.plan, added) };
            return result.added === 0 ? {} : { entries: result.entries };
          }
          outcome = { kind, result, report: takenPlanReport(report, result.plan) };
          // The plan taken brings the device preferences of the page with it (§7); Add missing keeps this one's.
          return { plan: result.plan, entries: result.entries, prefs: { ...snapshot.prefs, ...prefs } };
        });
        if (outcome !== null) return outcome;
      }
      throw new Error('the plan’s country kept changing during the import');
    },
    deleteEverything: () => domain.wipe(),
    undoDelete: (rows) => domain.restore(rows),
  };
}

/** The plan taken: every note holds, the last buy and the buy day named as that plan has them. */
function takenPlanReport(report: readonly ImportNote[], plan: Plan): ReportNote[] {
  return report.map((note) =>
    note.code === 'last-buy-defaulted'
      ? { code: note.code, date: plan.lastBuy }
      : note.code === 'buy-day-clamped'
        ? { code: note.code, day: plan.buyDay }
        : note,
  );
}

/**
 * Add missing keeps this plan, so only the notes on the file's purchases hold (docs/DOMAIN.md §7); the purchases
 * it stored of a coin this plan does not list are named per coin, in the alphabet's order.
 */
function keptPlanReport(report: readonly ImportNote[], plan: Plan, added: readonly Entry[]): ReportNote[] {
  const listed = new Set<CoinId>(plan.coins.map((coin) => coin.id));
  const unlisted = new Map<CoinId, number>();
  for (const entry of added) if (!listed.has(entry.coin)) unlisted.set(entry.coin, (unlisted.get(entry.coin) ?? 0) + 1);
  const coins = [...unlisted].sort(([a], [b]) => (a < b ? -1 : 1));
  return [
    ...report.filter((note) => 'count' in note),
    ...coins.map(([coin, count]) => ({ code: 'coin-not-in-plan' as const, coin, count })),
  ];
}

/** What the plan tabs change: Plan's amounts and dates, Coins & split's coins and split, Hold & sell's rule and window. */
export type PlanEdit = Partial<
  Pick<
    Plan,
    | 'monthlyAmount'
    | 'startingAmount'
    | 'firstBuy'
    | 'buyDay'
    | 'lastBuy'
    | 'coins'
    | 'split'
    | 'holdingRule'
    | 'sellWindow'
  >
>;

/** A save refused because another tab changed a field it sends since the tab opened the plan; the plan as stored. */
export type PlanChanged = { readonly code: 'plan-changed'; readonly plan: Plan };

/** Structural equality of plan field values (decimal strings, dates, coins, the split), key order aside. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const [x, y] = [a as Record<string, unknown>, b as Record<string, unknown>];
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((key) => key in y && same(x[key], y[key]));
}

/**
 * Writes the fields onto the plan as stored in the save's turn, so another tab's change to the other fields
 * is kept, or refuses with every issue of the plan they make and writes nothing. With `opened`, the plan as the
 * tab opened it, a field it sends that another tab changed since refuses with the plan as stored (`plan-changed`)
 * and writes nothing. No field writes nothing and gives that plan. With no plan left (deleted in another tab) it
 * saves nothing and has no issue to show. A last buy day other than the stored one clears an ended plan's end.
 */
export async function savePlan(
  { domain, clock }: Pick<Services, 'domain' | 'clock'>,
  fields: PlanEdit,
  opened?: Plan,
): Promise<Result<Plan, PlanIssue[] | PlanChanged>> {
  let result: Result<Plan, PlanIssue[] | PlanChanged> | null = null;
  await domain.write(({ plan }) => {
    if (plan === null) {
      result = err([]);
      return {};
    }
    const keys = Object.keys(fields) as (keyof PlanEdit)[];
    if (keys.length === 0) {
      result = ok(plan);
      return {};
    }
    if (opened !== undefined && keys.some((key) => !same(plan[key], opened[key]))) {
      result = err({ code: 'plan-changed', plan });
      return {};
    }
    // An ended plan's last buy is its end day (docs/DOMAIN.md §2): an edit that moves the last buy day clears the
    // end, so buying runs to the new day as on any plan; an edit that leaves the last buy day keeps it.
    const moved = fields.lastBuy !== undefined && fields.lastBuy !== plan.lastBuy;
    const next: Plan = {
      ...plan,
      ...fields,
      ...(moved ? { endedBuyingOn: null } : {}),
      updatedAt: stampAfter(clock.now(), plan.updatedAt),
    };
    const issues = planIssues(next);
    result = issues.length > 0 ? err(issues) : ok(next);
    return issues.length > 0 ? {} : { plan: next };
  });
  if (result === null) throw new Error('the save did not run');
  return result;
}

/** Whether the change of country wrote the plan: nothing to change writes nothing. */
type CountryWrite = { readonly written: boolean };

/**
 * What the country change re-derives or measures the window by (the last buy's eligibility), which another tab
 * must not have moved since the section opened the plan.
 */
const REDERIVED = ['country', 'payCurrency', 'displayCurrency', 'holdingRule', 'sellWindow', 'lastBuy'] as const;

/**
 * The change of country (docs/DOMAIN.md §6 "Change country") on the plan as stored in the write's turn: refused
 * with that plan (`plan-changed`) when another tab moved the country, a currency, the holding rule, the window or
 * the last buy since `opened`; a window the new rule makes early saves only with `acceptEarly`, which then marks it accepted;
 * any other issue refuses with every issue. Nothing to change writes nothing (`written: false`, so the caller
 * announces nothing); no plan left saves nothing. `currency` is the person's answer to the currency question
 * (ADR-0053), or null when the screen asked none: if the stored entries now need one (another tab logged an amount),
 * the change is refused as `plan-changed`; with no question asked, the currencies follow the country. An answer stands
 * even when the stored entries no longer need it (another tab deleted them): `keep` relabels nothing, so it is never
 * wrong, and the person's word is never swapped for another.
 */
export async function changeCountryOf(
  { domain, clock }: Pick<Services, 'domain' | 'clock'>,
  rules: CountryRules,
  opened: Plan,
  acceptEarly: boolean,
  currency: CurrencyAnswer | null,
): Promise<Result<CountryWrite, PlanChanged | PlanIssue[]>> {
  let result: Result<CountryWrite, PlanChanged | PlanIssue[]> | null = null;
  await domain.write(({ plan, entries }) => {
    if (plan === null) {
      result = err([]);
      return {};
    }
    const unasked = currency === null && currencyQuestion(plan, entries, rules) !== null;
    if (unasked || REDERIVED.some((key) => !same(plan[key], opened[key]))) {
      result = err({ code: 'plan-changed', plan });
      return {};
    }
    const change = changeCountry(plan, rules, clock.now(), currency ?? 'country');
    if (change.changes.length === 0) {
      result = ok({ written: false });
      return {};
    }
    const window = change.plan.sellWindow;
    const accepted = acceptEarly && window !== null && change.issues.includes('sell-window-before-eligibility');
    const next: Plan = accepted ? { ...change.plan, sellWindow: { ...window, acceptedEarlyOpen: true } } : change.plan;
    const issues = planIssues(next);
    result = issues.length > 0 ? err(issues) : ok({ written: true });
    return issues.length > 0 ? {} : { plan: next };
  });
  if (result === null) throw new Error('the change of country did not run');
  return result;
}
