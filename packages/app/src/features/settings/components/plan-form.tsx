import { compare, type Decimal, type Plan, type PlanIssue, type Result, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { NumberInput } from '../../../lib/format';
import { useNumberInput, useServices, useSnapshot } from '../../../lib/services';
import { NoPlan } from '../../today';
import { type PlanEdit, savePlan } from '../actions';

// What Settings' plan tabs share (docs/DOMAIN.md §6 "Edit the plan"). The number locale is held while the tab
// is open, as the entry form holds it (ADR-0034 Readings), until the plan's country changes (ADR-0020 Readings). The editor's value is made from the plan and its
// numbers are tidied on blur, since the editors carry no NumberInput (ADR-0034). A save sends only the fields
// that differ from the plan as the tab opened it, then shows the plan as saved; a refused one shows the issues
// and moves the focus to the first invalid field or group, or says why when the issue is outside the tab. A save over a
// field another tab changed since is refused (`plan-changed`): the tab then shows the plan as stored and says so.

/** A readable number written back in the locale's format, padded to `digits`; anything else as typed. */
export function tidy(typed: string, numberInput: NumberInput, digits: number): string {
  const read = typed.trim() === '' ? null : numberInput.parse(typed);
  return read?.ok === true ? numberInput.format(read.value, digits) : typed;
}

/** '250' and '250.00' are the same amount. */
export const same = (a: Decimal, b: Decimal): boolean => compare(a, b) === 0;

type Issue = { readonly path: readonly unknown[] };

export type PlanFormProps<V, F, I extends Issue> = {
  toValue(plan: Plan, numberInput: NumberInput): V;
  /** The fields the value makes, or its issues: `schedule` or `coinSplit`. */
  read(plan: Plan, value: V, numberInput: NumberInput): Result<F, I[]>;
  /** Of the fields read, those that differ from the plan as the tab opened it. */
  changed(fields: F, opened: Plan): PlanEdit;
  tidy(value: V, numberInput: NumberInput, plan: Plan): V;
  /** The first path segments the editor words an issue on. */
  readonly paths: ReadonlySet<unknown>;
  editor(props: { plan: Plan; value: V; issues: readonly (I | PlanIssue)[]; onChange(value: V): void }): ReactNode;
};

/** What the Settings screen gives a tab: the way to Currency & data from the empty state. */
export type TabProps = { readonly onImport?: (() => void) | undefined };

/** The tab with the plan and the number locale it holds; the empty state without a plan. */
export function PlanTabForm<V, F, I extends Issue>({ onImport, ...props }: PlanFormProps<V, F, I> & TabProps) {
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const current = useNumberInput();
  const country = plan?.country ?? null;
  const ready = plan === null ? null : current;
  // Held for the plan's country: a change of country releases it, and the tab takes the new one's once its rules load.
  const [held, setHeld] = useState({ country, numberInput: ready });
  const released = held.country !== country;
  if (released || (held.numberInput === null && ready !== null)) setHeld({ country, numberInput: ready });
  const numberInput = released ? ready : (held.numberInput ?? ready);
  if (plan === null) return <NoPlan onImport={onImport} />;
  return numberInput === null ? null : <PlanForm key={plan.country} plan={plan} numberInput={numberInput} {...props} />;
}

type FormProps<V, F, I extends Issue> = PlanFormProps<V, F, I> & {
  readonly plan: Plan;
  readonly numberInput: NumberInput;
};

function PlanForm<V, F, I extends Issue>({ plan, numberInput, editor, ...form }: FormProps<V, F, I>) {
  const t = useTranslations('settings');
  const services = useServices();
  const [opened, setOpened] = useState(plan);
  const [value, setValue] = useState(() => form.toValue(plan, numberInput));
  const [issues, setIssues] = useState<readonly (I | PlanIssue)[] | null>(null);
  const [refusals, setRefusals] = useState(0);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const element = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (refusals === 0) return;
    // An invalid group (a radio group) is no tab stop itself: its own stop, the checked radio, takes the focus.
    const invalid = element.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid?.querySelector<HTMLElement>('[tabindex="0"]') ?? invalid)?.focus();
  }, [refusals]);

  // After a refused save the issues follow what is typed; the plan's own refusal waits for the next save.
  const change = (next: V) => {
    setValue(next);
    if (issues === null) return;
    const read = form.read(plan, next, numberInput);
    setIssues(read.ok ? [] : read.error);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const read = form.read(plan, value, numberInput);
    const result = read.ok ? await savePlan(services, form.changed(read.value, opened), opened) : read;
    const { error } = result.ok ? { error: null } : result;
    setChangedElsewhere(error !== null && !Array.isArray(error));
    if (error !== null && Array.isArray(error)) {
      setIssues(error);
      setRefusals((count) => count + 1);
      return;
    }
    const saved = result.ok ? result.value : error?.plan;
    if (saved === undefined) return;
    setOpened(saved);
    setValue(form.toValue(saved, numberInput));
    setIssues(null);
    if (!result.ok) return;
    services.toasts.add({ title: t('saved'), timeout: UNDO_WINDOW_MS });
  };
  const shown = issues ?? [];
  const outside = shown.some((issue) => !form.paths.has(issue.path[0]));

  return (
    <form
      ref={element}
      onSubmit={(event) => void submit(event)}
      onBlur={() => setValue((typed) => form.tidy(typed, numberInput, plan))}
      noValidate
      className="flex flex-col gap-stack-lg"
    >
      {editor({ plan, value, issues: shown, onChange: change })}
      {(outside || changedElsewhere) && (
        <p role="alert" className="text-13 text-negative">
          {t(changedElsewhere ? 'changed' : 'notSaved')}
        </p>
      )}
      <div>
        <Button type="submit">{t('save')}</Button>
      </div>
    </form>
  );
}
