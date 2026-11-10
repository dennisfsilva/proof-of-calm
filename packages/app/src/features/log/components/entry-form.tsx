import {
  EntityIdSchema,
  type Entry,
  type FillField,
  holdingContext,
  isPositive,
  MINOR_UNITS,
  type MonthKey,
  type Plan,
  type TransactionKind,
  UNDO_WINDOW_MS,
} from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { DateInput, NumericInput } from '@proofofcalm/ui/components/input';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { type ErrorMessage, errorMessage } from '../../../lib/errors';
import type { NumberInput } from '../../../lib/format';
import { localesFor } from '../../../lib/i18n';
import {
  useClock,
  useFormatters,
  useNumberInput,
  usePrices,
  useRules,
  useServices,
  useSnapshot,
  useToday,
} from '../../../lib/services';
import { emptiedFills, withDate } from '../lib/dated';
import { draftBase, draftEntity, EntryFormDraftSchema, restoredState, sameForm } from '../lib/draft';
import {
  actionMessage,
  changedFields,
  type DetailField,
  detailFieldOf,
  editRow,
  type FieldIssue,
  type FormState,
  initialState,
  proseDigits,
  saveOn,
  toDraft,
} from '../lib/form';
import { reveal } from '../lib/reveal-box';
import { freshIds, storedSales } from '../lib/source';
import { namedWarnings, saleWarningKey } from '../lib/warning';
import { EntryDetails } from './entry-details';
import { FormHints } from './form-hints';

export type EntryFormProps = {
  /** A purchase or a sale (`sell`); an edit takes its kind from the entries. */
  readonly kind: TransactionKind;
  /** The live entries of the transaction to edit; empty for a new one. */
  readonly editing: readonly Entry[];
  /** The month a monthly buy is for; the focus slot when omitted. */
  readonly slot?: MonthKey;
  /**
   * Called with the saved entries, or with none when an entry being edited was deleted meanwhile; the host unmounts
   * the form after onDone (a new entry's ids are made once per mount).
   */
  onDone(saved: readonly Entry[]): void;
};

/** The failure shows under `field` when the save named one (a venue or note too long), else by Save. */
type Outcome = {
  readonly issues: readonly FieldIssue[];
  readonly failure: ErrorMessage | null;
  readonly field: DetailField | null;
};
const NOTHING: Outcome = { issues: [], failure: null, field: null };
/** Thrown inside the write, so a refused save writes nothing. */
const REFUSED = Symbol('refused');
/** Thrown inside the write when a new entry finds no plan stored; the form then says so by Save. */
const NO_PLAN = Symbol('no plan');
const NO_PLAN_MESSAGE: ErrorMessage = { key: 'log.form.planDeleted', values: {} };
/** The drafts adapter's name for this form (ADR-0020). */
const DRAFT_FORM = 'entry';

/** The Log form (ADR-0034): one row per coin, two of amount, units and price typed, the third filled. */
export function EntryForm(props: EntryFormProps) {
  const plan = useSnapshot((snapshot) => snapshot.plan);
  // The fields wait for the plan's number locale before they first mount: none while its country's rules load.
  // Once mounted, the form keeps that locale while open, through a later change of country (ADR-0034 Readings).
  const current = useNumberInput();
  const ready = plan === null ? null : current;
  const [frozen, setFrozen] = useState(ready);
  if (frozen === null && ready !== null) setFrozen(ready);
  if (frozen !== null && plan === null) setFrozen(null);
  const numberInput = plan === null ? null : (frozen ?? ready);
  return plan === null || numberInput === null ? null : (
    <PlanEntryForm plan={plan} numberInput={numberInput} {...props} />
  );
}

type PlanEntryFormProps = EntryFormProps & { readonly plan: Plan; readonly numberInput: NumberInput };

function PlanEntryForm({ plan, numberInput: mounted, kind, editing, slot, onDone }: PlanEntryFormProps) {
  const t = useTranslations();
  const services = useServices();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const today = useToday();
  const rules = useRules();
  const format = useFormatters();
  const clock = useClock();
  const live = usePrices().state?.snapshot ?? null;
  // The number locale and the prices are read once, as the form opens (ADR-0020 Readings): a language or price
  // change never rewrites what is on screen.
  const [numberLocale] = useState(() => localesFor(services.language, rules).numbers);
  const [numberInput] = useState(() => mounted);
  const currency = plan.payCurrency;
  // What was typed before the form was left comes back from the session draft while it fits, replayed over the form
  // as it opens now (`restoredState`); `initial` stays the form as it opens now, so a restored change still counts.
  const [opened] = useState(() => {
    const initial = initialState(kind, editing, slot, { plan, entries, today, prices: live, numberInput });
    const entity = draftEntity(initial, editing);
    const base = draftBase(editing);
    const draft = services.drafts.read(DRAFT_FORM, entity, EntryFormDraftSchema);
    const fit = { numberLocale, base, initial, numberInput, currency };
    return { initial, entity, base, state: restoredState(draft, fit) ?? initial };
  });
  const { initial, entity, base } = opened;
  const [state, setState] = useState(opened.state);
  const [ids] = useState(() => opened.state.rows.map(() => EntityIdSchema.parse(crypto.randomUUID())));
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Every change is kept for the session with the form as it opened, so a later opening replays only what was typed;
  // a form that reads as it opened is not kept, and neither is a draft that no longer fits.
  useEffect(() => {
    if (sameForm(state, initial)) services.drafts.clear(DRAFT_FORM, entity);
    else services.drafts.write(DRAFT_FORM, entity, { numberLocale, base, opened: initial, state });
  }, [services, initial, entity, base, numberLocale, state]);

  const [outcome, submit, pending] = useActionState(async (): Promise<Outcome> => {
    const draft = toDraft(state, numberInput);
    if (!draft.ok) return { ...NOTHING, issues: draft.error };
    const fresh = freshIds(ids, state.rows, editing);
    const box: { result?: ReturnType<typeof saveOn> } = {};
    try {
      // Saved in the write queue's turn, on the entries as stored then: another tab may have changed them.
      await services.domain.write((snapshot) => {
        // No plan stored (another tab deleted everything): refused, as every other writer does, so no entry is
        // stored without its plan and that tab's Undo still restores both (DOMAIN §6). The entries being edited
        // went with it, so an edit ends as one whose entry was deleted (no result: the toast, then closed).
        if (snapshot.plan === null) throw editing.length === 0 ? NO_PLAN : REFUSED;
        const context = {
          plan: snapshot.plan,
          editing,
          ids: fresh,
          now: clock.now(),
          source: 'manual' as const,
        };
        const result = saveOn(snapshot.entries, draft.value, { ...context, initial, current: state });
        box.result = result;
        if (result === null || !result.ok) throw REFUSED;
        return { entries: result.value };
      });
    } catch (error) {
      if (error === NO_PLAN) return { ...NOTHING, failure: NO_PLAN_MESSAGE };
      if (error !== REFUSED) return { ...NOTHING, failure: errorMessage(error) };
    }
    const { result = null } = box;
    if (result?.ok === false) {
      // A venue or note too long (a restored draft; the fields stop at their limits) is named under its field.
      const field = detailFieldOf(result.error);
      if (field !== null) setDetailsOpen(true);
      // A purchase edited or removed from under a later sale names that sale's coin (DOMAIN §3.7); one a later move's
      // fee needs is `fee-exceeds-held`, named by `actionMessage` with the move's date (ADR-0055).
      const failure =
        result.error.code === 'sell-exceeds-held' && draft.value.kind !== 'sell'
          ? { key: 'log.form.coversSale', values: { coin: result.error.coin } }
          : actionMessage(result.error, plan, format, draft.value.date);
      return { issues: [], failure, field };
    }
    // An entry being edited was deleted meanwhile: nothing is saved, so the edit never brings it back.
    if (result === null) services.toasts.add({ title: t('log.form.deleted'), timeout: UNDO_WINDOW_MS });
    services.drafts.clear(DRAFT_FORM, entity);
    onDone(result?.ok === true ? result.value : []);
    return NOTHING;
  }, NOTHING);

  const say = (message: ErrorMessage) => t(message.key as Parameters<typeof t>[0], message.values);
  const issueOf = (field: string) => outcome.issues.find((issue) => issue.field === field);
  const set = (patch: Partial<FormState>) => setState((current) => ({ ...current, ...patch }));
  const dated = (typed: string) => setState((current) => withDate(current, typed, initial, numberInput, currency));
  const type = (at: number, field: FillField, typed: string) =>
    setState((current) => editRow(current, at, field, typed, numberInput, currency));
  // On blur a readable value is written back in the locale's format (ADR-0034); money keeps two decimals.
  const tidy = (typed: string, digits: number) => {
    const parsed = typed.trim() === '' ? null : numberInput.parse(typed);
    return parsed?.ok === true ? numberInput.format(parsed.value, digits) : typed;
  };
  const tidyRow = (at: number, field: FillField, digits: number) =>
    setState((current) => ({
      ...current,
      rows: current.rows.map((row, index) => (index === at ? { ...row, [field]: tidy(row[field], digits) } : row)),
    }));
  const minor = MINOR_UNITS[currency];
  const sale = state.kind === 'sell';
  // Coins added (`held`) may have no cost and never a fee (DOMAIN §2.2); their date has no default to keep.
  const added = state.kind === 'held';
  const holding = holdingContext(plan, rules);
  // Where the venue decides the warning (per-venue lots), a sale shows it beside the units; coins added always do.
  const venueShown = added || (sale && holding.lotScope === 'per-venue');
  // A sale taking more units than are past the holding rule on its date says so, without blocking the save, which
  // replaces every entry edited, so none counts; each sale is read as the save stores it (DOMAIN §3.7).
  const drafted = sale ? toDraft(state, numberInput) : null;
  const venueChanged = changedFields(initial, state).venue;
  const warnings =
    drafted?.ok === true
      ? namedWarnings(
          plan,
          entries,
          storedSales(drafted.value, state.rows, editing, ids, venueChanged, clock.now()),
          drafted.value.date,
          holding,
          editing.map((entry) => entry.id),
        )
      : [];
  // A cleared or partly typed date input gives '': toDraft refuses it before the save.
  const dateIssue = issueOf('date') !== undefined;
  const failureAt = (field: DetailField | null) => (outcome.field === field ? outcome.failure : null);
  const venueFailure = failureAt('venue');
  const noteFailure = failureAt('note');
  const formFailure = failureAt(null);
  // A refused save puts its alert line above the focused Save, which it pushes down, out of a sheet's view: once the
  // line has rendered, the sheet scrolls the line and Save, with its whole ring, into view. Refused from a field (Enter
  // in the date), the focus moves to the line, scrolled by the least that shows it with its ring: a short sheet cannot
  // show the focused field and the line below the fields together; on the line it reads in view, Shift+Tab goes back
  // (docs/DESIGN.md §6).
  const end = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);
  const lineBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = end.current;
    const alert = line.current;
    if (formFailure === null || box === null) return;
    if (box.contains(document.activeElement)) reveal(box);
    else if (alert !== null && lineBox.current !== null) {
      alert.focus({ preventScroll: true });
      reveal(lineBox.current);
    }
  }, [formFailure]);
  // A save refused for a field (a venue or note one in the panel the save opened) moves the focus to the first field
  // marked invalid, so the refusal is heard there.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (outcome.issues.length === 0 && outcome.field === null) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [outcome]);

  const numberField = (
    field: string,
    label: string,
    value: string,
    onValue: (typed: string) => void,
    onBlur: () => void,
  ) => {
    const issue = issueOf(field);
    return (
      <Field key={field} invalid={issue !== undefined}>
        <FieldLabel>{label}</FieldLabel>
        <NumericInput value={value} onChange={(event) => onValue(event.target.value)} onBlur={onBlur} />
        {issue !== undefined && <FieldError>{say(errorMessage(issue.error))}</FieldError>}
      </Field>
    );
  };

  return (
    <form ref={form} action={submit} className="flex flex-col gap-stack-md" noValidate>
      <Field invalid={dateIssue}>
        <FieldLabel>{t('log.form.date')}</FieldLabel>
        <DateInput value={state.date} onChange={(event) => dated(event.target.value)} />
        {/* The reason to date late is a holding rule: none is claimed where the country has none (JURISDICTIONS §1). */}
        {added && (
          <FieldDescription>{t('log.form.heldDate', { rule: rules?.holdingRule.kind ?? 'none' })}</FieldDescription>
        )}
        {dateIssue && <FieldError>{t('log.form.dateInvalid')}</FieldError>}
      </Field>
      {state.slot !== null && <p className="text-14">{t('log.form.slot', { month: format.month(state.slot) })}</p>}
      <FormHints added={added} editing={editing} />
      {state.rows.map((row, at) => {
        const names = { coin: row.coin, currency };
        // A sale asks for the units sold first, then the money received; coins added, the units, then a cost if known.
        const amount = numberField(
          `rows.${at}.amount`,
          t(sale ? 'log.form.received' : added ? 'log.form.cost' : 'log.form.amount', names),
          row.amount,
          (typed) => type(at, 'amount', typed),
          () => tidyRow(at, 'amount', 2),
        );
        const units = numberField(
          `rows.${at}.units`,
          t(sale ? 'log.form.sold' : 'log.form.units', names),
          row.units,
          (typed) => type(at, 'units', typed),
          () => tidyRow(at, 'units', 0),
        );
        return (
          <fieldset key={row.source ?? row.coin} className="flex flex-col gap-stack-sm">
            <legend className="text-16">{row.coin}</legend>
            {sale || added ? [units, amount] : [amount, units]}
            {numberField(
              `rows.${at}.price`,
              t('log.form.price', names),
              row.price,
              (typed) => type(at, 'price', typed),
              () => tidyRow(at, 'price', minor),
            )}
          </fieldset>
        );
      })}
      {emptiedFills(state, initial) && <output className="text-13 text-ink-2">{t('log.form.earlierDate')}</output>}
      {warnings.map((warning, index) => {
        const decimals = state.rows.find((row) => row.coin === warning.coin)?.decimals ?? 0;
        // Prose figures (DESIGN §5 rule 7): both at the decimals the more precise one needs, the coin named once.
        const digits = proseDigits(decimals, warning.eligible, warning.sold);
        return (
          <p key={`${warning.coin}-${index}`} role="status" className="text-14">
            {t(saleWarningKey(plan.holdingRule), {
              // None past the rule says so, rather than "Only 0.000 of" (CONTENT-STYLE §3).
              share: isPositive(warning.eligible) ? 'some' : 'none',
              // A coin warned at two venues names each one, so each warning reads apart from the other.
              at: warning.at,
              venue: warning.venue ?? '',
              eligible: numberInput.format(warning.eligible, digits),
              sold: format.units(warning.sold, warning.coin, digits),
              date: format.date(drafted?.ok === true ? drafted.value.date : today),
            })}
          </p>
        );
      })}
      {/* LEGAL §4: the data line once, beside the holding status. */}
      {warnings.length > 0 && <p className="text-13 text-ink-2">{t('log.holding.note')}</p>}
      {!added &&
        numberField(
          'fee',
          t('log.form.fee', { currency }),
          state.fee,
          (fee) => set({ fee }),
          () => set({ fee: tidy(state.fee, 2) }),
        )}
      <EntryDetails
        venue={state.venue}
        note={state.note}
        venueError={venueFailure === null ? null : say(venueFailure)}
        noteError={noteFailure === null ? null : say(noteFailure)}
        venueShown={venueShown}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onChange={set}
      />
      {/* The alert line and Save, each grown by the focus ring's extent: a refused save scrolls one of them in. */}
      <div
        ref={end}
        className="-m-[calc(var(--focus-offset)+var(--focus-width))] flex flex-col gap-stack-md p-[calc(var(--focus-offset)+var(--focus-width))]"
      >
        {formFailure !== null && (
          <div
            ref={lineBox}
            className="-m-[calc(var(--focus-offset)+var(--focus-width))] p-[calc(var(--focus-offset)+var(--focus-width))]"
          >
            <p ref={line} role="alert" tabIndex={-1} className="text-13 text-negative">
              {say(formFailure)}
            </p>
          </div>
        )}
        {/* Focusable while pending: a disabled button loses the focus to the body once the save outlasts a frame,
            and a refused save keeps it on Save while the alert line speaks (docs/DESIGN.md §6). */}
        <Button type="submit" disabled={pending} focusableWhenDisabled>
          {t('log.form.save')}
        </Button>
      </div>
    </form>
  );
}
