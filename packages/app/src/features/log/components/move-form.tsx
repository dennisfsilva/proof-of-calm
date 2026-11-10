import {
  type ActionError,
  decimal,
  ENTRY_NOTE_MAX_LENGTH,
  EntityIdSchema,
  type Entry,
  holdingContext,
  MAX_UNIT_DECIMALS,
  type Plan,
  type Result,
  UNDO_WINDOW_MS,
  type Units,
  VENUE_MAX_LENGTH,
} from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { DateInput, Input, NumericInput } from '@proofofcalm/ui/components/input';
import { RadioCard, RadioGroup } from '@proofofcalm/ui/components/radio-group';
import { Textarea } from '@proofofcalm/ui/components/textarea';
import { type ReactNode, useActionState, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { type ErrorMessage, errorMessage } from '../../../lib/errors';
import type { NumberInput } from '../../../lib/format';
import { useClock, useFormatters, useNumberInput, useRules, useServices, useSnapshot } from '../../../lib/services';
import { proseDigits } from '../lib/form';
import {
  initialMoveState,
  type MoveField,
  type MoveFieldIssue,
  type MoveFormState,
  movableCoins,
  moveDraft,
  moveErrorField,
  moveLines,
  moveMessage,
  moveSources,
  saveMoveOn,
  typedFee,
  typeSent,
  withSource,
} from '../lib/move-form';

export type MoveFormProps = {
  /** The live move to edit; null for a new one. */
  readonly editing: Entry | null;
  /** Called with the saved entries, or none when the move being edited was deleted meanwhile. */
  onDone(saved: readonly Entry[]): void;
};

/** The failure shows under `field` when the save named one, else by Save. */
type Outcome = {
  readonly issues: readonly MoveFieldIssue[];
  readonly failure: ErrorMessage | null;
  readonly field: MoveField | null;
};
const NOTHING: Outcome = { issues: [], failure: null, field: null };
/** Thrown inside the write, so a refused save writes nothing. */
const REFUSED = Symbol('refused');
const PLAN_DELETED: ErrorMessage = { key: 'log.form.planDeleted', values: {} };

/** Logs coins moved between two venues (ADR-0054): one coin, its source, its destination, the units sent and received. */
export function MoveForm(props: MoveFormProps) {
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const numberInput = useNumberInput();
  return plan === null || numberInput === null ? null : (
    <PlanMoveForm plan={plan} numberInput={numberInput} {...props} />
  );
}

type PlanMoveFormProps = MoveFormProps & { readonly plan: Plan; readonly numberInput: NumberInput };

function PlanMoveForm({ plan, numberInput: mounted, editing, onDone }: PlanMoveFormProps) {
  const t = useTranslations();
  const services = useServices();
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const format = useFormatters();
  const clock = useClock();
  const perVenue = holdingContext(plan, useRules()).lotScope === 'per-venue';
  // The number locale is read once, as the form opens (ADR-0034 Readings).
  const [numberInput] = useState(() => mounted);
  const ctx = { plan, entries, editing, numberInput };
  const [state, setState] = useState(() => initialMoveState(editing, ctx));
  const [ids] = useState(() => [EntityIdSchema.parse(crypto.randomUUID())]);
  const update = (change: (current: MoveFormState) => MoveFormState) =>
    setState((current) => withSource(change(current), ctx));
  const set = (patch: Partial<MoveFormState>) => update((current) => ({ ...current, ...patch }));

  const [outcome, submit, pending] = useActionState(async (): Promise<Outcome> => {
    // No venue holds the coin on the date, so no source is offered: the move sends more than the 0 units held, refused
    // at the units sent in the core's words, never as a source left unchosen with no card to show it on.
    const unheld = moveSources(state, ctx).length === 0;
    const draft = moveDraft(unheld ? { ...state, from: null } : state, numberInput);
    if (!draft.ok) return { ...NOTHING, issues: draft.error };
    if (unheld) {
      const { coin, sent, date } = draft.value;
      const error = { code: 'move-exceeds-held', coin, held: decimal<Units>('0'), sent } as const;
      return { issues: [], failure: moveMessage(error, plan, format, date), field: 'sent' };
    }
    const box: { result?: Result<Entry[], ActionError> | null } = {};
    try {
      // Saved in the write queue's turn, on the entries as stored then: another tab may have changed them.
      await services.domain.write((snapshot) => {
        if (snapshot.plan === null) throw REFUSED;
        const context = { plan: snapshot.plan, editing, ids, now: clock.now(), source: 'manual' as const };
        box.result = saveMoveOn(snapshot.entries, draft.value, context);
        if (box.result === null || !box.result.ok) throw REFUSED;
        return { entries: box.result.value };
      });
    } catch (error) {
      if (error !== REFUSED) return { ...NOTHING, failure: errorMessage(error) };
      if (box.result === undefined) return { ...NOTHING, failure: PLAN_DELETED };
    }
    const { result = null } = box;
    if (result?.ok === false) {
      const failure = moveMessage(result.error, plan, format, draft.value.date);
      return { issues: [], failure, field: moveErrorField(result.error) };
    }
    if (result === null) services.toasts.add({ title: t('log.move.deleted'), timeout: UNDO_WINDOW_MS });
    onDone(result?.ok === true ? result.value : []);
    return NOTHING;
  }, NOTHING);

  const say = (message: ErrorMessage) => t(message.key as Parameters<typeof t>[0], message.values);
  const refused = outcome.failure === null ? null : { field: outcome.field, text: say(outcome.failure) };
  const problem = (field: MoveField): string | null => {
    const issue = outcome.issues.find((each) => each.field === field);
    if (issue !== undefined) {
      return typeof issue.error === 'string' ? t(`log.move.issue.${issue.error}`) : say(errorMessage(issue.error));
    }
    return refused?.field === field ? refused.text : null;
  };
  // A refused save moves the focus to the first field it names, so the refusal is heard there; a radio group's root
  // takes no focus, so its checked card does, else its first, where the keyboard lands.
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const named = outcome === NOTHING ? null : form.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const cards =
      named?.getAttribute('role') === 'radiogroup' ? [...named.querySelectorAll<HTMLElement>('[role="radio"]')] : [];
    (cards.find((card) => card.getAttribute('aria-checked') === 'true') ?? cards[0] ?? named)?.focus();
  }, [outcome]);

  const decimals = plan.coins.find((coin) => coin.id === state.coin)?.decimals ?? MAX_UNIT_DECIMALS;
  const prose = (value: Units, ...others: Units[]) =>
    format.units(value, state.coin, proseDigits(decimals, value, ...others));
  const sources = moveSources(state, ctx);
  const drafted = moveDraft(state, numberInput);
  const fee = typedFee(state, numberInput);
  const lines = drafted.ok ? moveLines(drafted.value, ctx, perVenue) : null;
  const coins = movableCoins(ctx);
  const from = sources.findIndex((place) => place.venue === state.from);
  const units = (field: 'sent' | 'received', onValue: (typed: string) => void, after?: ReactNode) => (
    <Field invalid={problem(field) !== null}>
      <FieldLabel>{t(`log.move.${field}`)}</FieldLabel>
      <div className="flex gap-stack-sm">
        <NumericInput value={state[field]} onChange={(event) => onValue(event.target.value)} />
        {after}
      </div>
      <Problem text={problem(field)} />
    </Field>
  );

  return (
    <form ref={form} action={submit} className="flex flex-col gap-stack-md" noValidate>
      {coins.length > 1 && (
        <Choice
          legend={t('log.move.coin')}
          problem={problem('coin')}
          value={state.coin}
          onValue={(coin) => set({ coin })}
        >
          {coins.map((coin) => (
            <RadioCard key={coin} value={coin} title={coin} />
          ))}
        </Choice>
      )}
      <Field invalid={problem('date') !== null}>
        <FieldLabel>{t('log.move.date')}</FieldLabel>
        <DateInput value={state.date} onChange={(event) => set({ date: event.target.value })} />
        <FieldDescription>{t('log.move.dateHint')}</FieldDescription>
        <Problem text={problem('date')} />
      </Field>
      {sources.length > 0 && (
        <Choice
          legend={t('log.move.from')}
          problem={problem('from')}
          value={from === -1 ? '' : String(from)}
          onValue={(at) => set({ from: sources[Number(at)]?.venue })}
        >
          {sources.map((place, at) => (
            <RadioCard
              key={place.venue ?? ''}
              value={String(at)}
              title={place.venue ?? t('log.move.noVenue')}
              line={prose(place.units)}
            />
          ))}
        </Choice>
      )}
      <Field invalid={problem('to') !== null}>
        <FieldLabel>{t('log.move.to')}</FieldLabel>
        <Input value={state.to} maxLength={VENUE_MAX_LENGTH} onChange={(event) => set({ to: event.target.value })} />
        <FieldDescription>{t('log.move.toHint')}</FieldDescription>
        <Problem text={problem('to')} />
      </Field>
      {units(
        'sent',
        (typed) => update((current) => typeSent(current, typed)),
        <Button
          type="button"
          variant="secondary"
          disabled={from === -1}
          onClick={() => {
            const all = sources[from]?.units;
            if (all !== undefined) update((current) => typeSent(current, numberInput.format(all)));
          }}
        >
          {t('log.move.all')}
        </Button>,
      )}
      {units('received', (received) => set({ received, receivedTyped: true }))}
      {fee !== null && <p className="text-14">{t('log.move.fee', { units: prose(fee) })}</p>}
      {lines !== null && lines.short !== null && drafted.ok && (
        <p role="status" className="text-14">
          {t('log.move.sourceShort', {
            at: drafted.value.from === null ? 'none' : 'venue',
            from: drafted.value.from ?? '',
            to: drafted.value.to,
            held: prose(lines.short.held, lines.short.short),
            short: prose(lines.short.short, lines.short.held),
            date: format.date(drafted.value.date),
          })}
        </p>
      )}
      {lines?.same === true && drafted.ok && (
        <p role="status" className="text-14">
          {t('log.move.duplicate', { date: format.date(drafted.value.date) })}
        </p>
      )}
      <Field invalid={problem('note') !== null}>
        <FieldLabel>{t('log.move.note')}</FieldLabel>
        <Textarea
          value={state.note}
          maxLength={ENTRY_NOTE_MAX_LENGTH}
          onChange={(event) => set({ note: event.target.value })}
        />
        <Problem text={problem('note')} />
      </Field>
      {refused !== null && refused.field === null && (
        <p role="alert" className="text-13 text-negative">
          {refused.text}
        </p>
      )}
      <Button type="submit" disabled={pending} focusableWhenDisabled>
        {t('log.move.save')}
      </Button>
    </form>
  );
}

type ChoiceProps = {
  readonly legend: string;
  readonly problem: string | null;
  readonly value: string;
  onValue(value: string): void;
  readonly children: ReactNode;
};

/** A labelled radio group of packages/ui, never a native one (WebKit's hashed CSP), its refusal under it. */
function Choice({ legend, problem, value, onValue, children }: ChoiceProps) {
  const id = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-stack-xs">
      <legend id={`${id}-legend`} className="mb-stack-xs font-medium text-14 text-ink">
        {legend}
      </legend>
      <RadioGroup
        aria-labelledby={`${id}-legend`}
        aria-invalid={problem !== null || undefined}
        aria-describedby={problem === null ? undefined : `${id}-error`}
        value={value}
        onValueChange={onValue}
      >
        {children}
      </RadioGroup>
      {problem !== null && (
        <p id={`${id}-error`} className="text-13 text-negative">
          {problem}
        </p>
      )}
    </fieldset>
  );
}

/** A field's refusal, rendered only while there is one. */
function Problem({ text }: { readonly text: string | null }) {
  return text === null ? null : <FieldError>{text}</FieldError>;
}
