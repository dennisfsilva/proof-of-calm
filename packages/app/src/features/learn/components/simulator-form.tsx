import { COINS } from '@proofofcalm/content';
import { type CalendarDate, type CoinId, decimalPlaces, type Percent, type Plan } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { DateInput, NumericInput } from '@proofofcalm/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@proofofcalm/ui/components/select';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters, useNumberInput } from '../../../lib/services';
import { fillFromPlan, type PlanFill } from '../lib/plan-fill';
import { buyDayFor, type DefaultWindow } from '../lib/simulator-dates';
import {
  type ClosesByCoin,
  type FieldError as FormError,
  readForm,
  type SimulatorFields,
  type SimulatorInputs,
} from '../lib/simulator-form';
import { type CoinSplitValue, readShares } from '../lib/split';
import { CoinEditor } from './coin-editor';

// The simulator's form (docs/EDUCATION.md §7, #14's V1 to V3): the fill from the plan, the coins, the amount, the
// buy day, the dates and the fee, in that order, run only by its button. The split opens empty; the dates follow
// the closes' window and the buy day the start until the person sets them. A refused run shows each error by its
// field and focuses the first one; a change after a run calls onEdit, which ends the result shown.

export type SimulatorFormProps = {
  /** Each chosen coin's closes, 'none' for a coin with none; a coin still loading is absent. */
  readonly closes: ClosesByCoin;
  readonly window: DefaultWindow | null;
  readonly plan: Plan | null;
  /** The chosen coins, whenever they change, so the screen loads their closes. */
  readonly onCoins: (ids: CoinId[]) => void;
  readonly onRun: (input: SimulatorInputs) => void;
  readonly onEdit: () => void;
};

/** The whole catalogue by name: the simulator is not bound to the plan's coins. */
const CATALOGUE = [...COINS].sort((a, b) => a.name.localeCompare(b.name, 'en'));
const DAYS = Array.from({ length: 28 }, (_, index) => index + 1);
const EMPTY: CoinSplitValue = { coins: [], shares: {} };

/** The fields as typed; a null buy day or date still follows the start or the window. */
type Draft = Omit<SimulatorFields, 'buyDay' | 'start' | 'end'> & {
  readonly buyDay: number | null;
  readonly start: CalendarDate | '' | null;
  readonly end: CalendarDate | '' | null;
};

export function SimulatorForm({ closes, window, plan, onCoins, onRun, onEdit }: SimulatorFormProps) {
  const t = useTranslations('learn.simulator.form');
  const p = useTranslations('plan');
  const input = useTranslations('errors.input');
  const f = useFormatters();
  const numberInput = useNumberInput();
  const fillLine = useId();
  const form = useRef<HTMLFormElement>(null);
  const ran = useRef(false);
  const [draft, setDraft] = useState<Draft>({
    split: EMPTY,
    amount: '',
    buyDay: null,
    start: null,
    end: null,
    fee: '0',
  });
  const [line, setLine] = useState<PlanFill['line']>(null);
  const [checked, setChecked] = useState(false);
  const [refusals, setRefusals] = useState(0);
  /** The refused field and, for the split, the row of its first coin in error (-1: the first control). */
  const target = useRef<{ field: FormError['field']; row: number } | null>(null);

  const start = draft.start ?? window?.start ?? '';
  const fields: SimulatorFields = {
    ...draft,
    start,
    end: draft.end ?? window?.end ?? '',
    buyDay: draft.buyDay ?? (start === '' ? 1 : buyDayFor(start)),
  };
  const result = numberInput === null ? null : readForm(fields, closes, numberInput);
  const errors = checked && result !== null && !result.ok ? result.error : [];

  // After a refusal, the first field in error takes the focus: a share's row by its coin, else its first control.
  useEffect(() => {
    if (refusals === 0 || target.current === null) return;
    const { field, row } = target.current;
    const wrapper = form.current?.querySelector(`[data-field="${field}"]`);
    const rowElement = row < 0 ? null : wrapper?.querySelector('ul')?.children[row];
    (rowElement ?? wrapper)?.querySelector<HTMLElement>('input, button')?.focus();
  }, [refusals]);

  if (numberInput === null) return null;

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    const coins = patch.split?.coins.map((coin) => coin.id);
    if (coins !== undefined && coins.join() !== draft.split.coins.map((coin) => coin.id).join()) onCoins(coins);
    if (ran.current) {
      ran.current = false;
      onEdit();
    }
  };

  const fill = (from: Plan) => {
    const filled = fillFromPlan(from, numberInput);
    const amount = filled.amount === null ? {} : { amount: filled.amount };
    change({ split: filled.split, buyDay: filled.buyDay, ...amount });
    setLine(filled.line);
  };

  const run = () => {
    if (result === null) return;
    if (!result.ok) {
      const [first] = result.error;
      // A sum or count issue names no coin: the whole split is in error, so its first row (or Add button) leads.
      const rows = result.error.flatMap((error) =>
        error.field === 'split' ? [draft.split.coins.findIndex((coin) => coin.id === error.coin)] : [],
      );
      target.current =
        first === undefined ? null : { field: first.field, row: rows.length > 0 ? Math.max(0, Math.min(...rows)) : -1 };
      setChecked(true);
      setRefusals((count) => count + 1);
      return;
    }
    ran.current = true;
    onRun(result.value);
  };

  const nameOf = (coin: CoinId | undefined) => CATALOGUE.find((entry) => entry.id === coin)?.name ?? String(coin);
  const message = (field: FormError['field']) => {
    const error = errors.find((candidate) => candidate.field === field);
    switch (error?.code) {
      case undefined:
        return null;
      case 'number-invalid':
        return input('number-invalid', { example: error.example ?? '' });
      case 'number-empty':
      case 'number-negative':
        return input(error.code);
      case 'invalid-amount':
      case 'invalid-fee':
      case 'invalid-dates':
      case 'date-required':
        return t(`errors.${error.code}`);
      case 'history-starts-later':
      case 'history-ends-earlier':
        return t(`errors.${error.code}`, { coin: nameOf(error.coin), date: error.date ? f.date(error.date) : '' });
      default:
        return null;
    }
  };
  const shares = readShares(draft.split, numberInput);
  const notes = Object.fromEntries(
    draft.split.coins.flatMap((coin) => {
      const range = closes[coin.id];
      const key = range === undefined ? 'loading' : range === 'none' ? 'errors.history-missing' : null;
      return key === null ? [] : [[coin.id, t(key, { coin: coin.name })]];
    }),
  );

  const text = (field: 'amount' | 'fee', label: string, hint: string | null) => {
    const error = message(field);
    return (
      <div data-field={field}>
        <Field invalid={error !== null}>
          <FieldLabel>{label}</FieldLabel>
          <NumericInput value={draft[field]} onChange={(event) => change({ [field]: event.currentTarget.value })} />
          {hint !== null && <FieldDescription>{hint}</FieldDescription>}
          {error !== null && <FieldError>{error}</FieldError>}
        </Field>
      </div>
    );
  };

  const date = (field: 'start' | 'end') => {
    const error = message(field);
    return (
      <div data-field={field}>
        <Field invalid={error !== null}>
          <FieldLabel>{t(field)}</FieldLabel>
          <DateInput
            value={fields[field]}
            onChange={(event) => change({ [field]: event.currentTarget.value as CalendarDate | '' })}
            {...(window === null ? {} : { min: window.first, max: window.last })}
          />
          {error !== null && <FieldError>{error}</FieldError>}
        </Field>
      </div>
    );
  };

  const percent = (share: Percent) => f.percent(share, { decimals: decimalPlaces(share) });
  const split = (from: Plan) =>
    from.coins.map((coin) => `${coin.id} ${percent(from.split[coin.id] ?? ('0' as Percent))}`).join(', ');

  return (
    <form
      ref={form}
      noValidate
      className="flex flex-col gap-stack-md"
      onSubmit={(event) => {
        event.preventDefault();
        run();
      }}
    >
      {plan !== null && (
        <div className="flex flex-col items-start gap-stack-xs">
          <Button type="button" variant="secondary" aria-describedby={fillLine} onClick={() => fill(plan)}>
            {t('fill')}
          </Button>
          <p id={fillLine} className="text-13 text-ink-2">
            {p('reference.monthly', {
              monthly: f.money(plan.monthlyAmount, plan.payCurrency),
              buyDay: String(plan.buyDay),
              split: split(plan),
            })}
          </p>
        </div>
      )}
      <div data-field="split">
        <CoinEditor
          value={draft.split}
          catalogue={CATALOGUE}
          issues={checked && !shares.ok ? shares.error : []}
          onChange={(value) => change({ split: value })}
          notes={notes}
          allowEmpty
        />
      </div>
      {text('amount', p('schedule.monthly', { currency: 'EUR' }), line === null ? null : t(`fillLine.${line}`))}
      <div data-field="buyDay">
        <Select<number> value={fields.buyDay} onValueChange={(value) => value !== null && change({ buyDay: value })}>
          <SelectLabel>{p('schedule.buyDay')}</SelectLabel>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {date('start')}
      {date('end')}
      {text('fee', t('fee'), t('feeHint'))}
      <Button type="submit" className="self-start">
        {t('run')}
      </Button>
    </form>
  );
}
