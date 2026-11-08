import { MINOR_UNITS, type Plan } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import type { NumberInput } from '../../../lib/format';
import { useFormatters, useRules } from '../../../lib/services';
import {
  earlyToAccept,
  ruleNameOf,
  type Schedule,
  ScheduleEditor,
  type ScheduleIssue,
  type ScheduleValue,
  schedule,
} from '../../plan';
import type { PlanEdit } from '../actions';
import { CalendarRow } from './calendar-row';
import { PlanTabForm, same, type TabProps, tidy } from './plan-form';
import { useHoldingCountry } from './use-holding-country';

// Settings' Plan tab: the amount-and-dates editor over the plan (docs/DOMAIN.md §6 "Edit the plan"). The
// amounts show at the pay currency's decimals in the number locale (ADR-0034). A last buy that opens the sell
// window early saves with the person's acceptance, which the tab sends on the window as it opened it, with the
// last buy; the tab sends the window, which Hold & sell edits, for nothing else. The notice names the country's
// rule with its date line (`useHoldingCountry`). An ended plan says so under the last buy, which a later last buy
// lifts (docs/CONTENT-STYLE.md §3). Under the form, the calendar file again (`CalendarRow`).

const PATHS: ReadonlySet<unknown> = new Set([
  'monthlyAmount',
  'startingAmount',
  'firstBuy',
  'buyDay',
  'lastBuy',
  'acceptEarly',
]);
const digits = (plan: Plan) => MINOR_UNITS[plan.payCurrency];

const toValue = (plan: Plan, numberInput: NumberInput): ScheduleValue => ({
  monthlyAmount: numberInput.format(plan.monthlyAmount, digits(plan)),
  startingAmount: numberInput.format(plan.startingAmount, digits(plan)),
  firstBuy: plan.firstBuy,
  buyDay: plan.buyDay,
  lastBuy: plan.lastBuy,
  acceptEarly: false,
});

const changed = (fields: Schedule, opened: Plan): PlanEdit => ({
  ...(same(fields.monthlyAmount, opened.monthlyAmount) ? {} : { monthlyAmount: fields.monthlyAmount }),
  ...(same(fields.startingAmount, opened.startingAmount) ? {} : { startingAmount: fields.startingAmount }),
  ...(fields.firstBuy === opened.firstBuy ? {} : { firstBuy: fields.firstBuy }),
  ...(fields.buyDay === opened.buyDay ? {} : { buyDay: fields.buyDay }),
  ...(fields.lastBuy === opened.lastBuy ? {} : { lastBuy: fields.lastBuy }),
  ...(fields.sellWindow === undefined || opened.sellWindow === null
    ? {}
    : { sellWindow: { ...opened.sellWindow, acceptedEarlyOpen: true } }),
});

const tidied = (value: ScheduleValue, numberInput: NumberInput, plan: Plan): ScheduleValue => ({
  ...value,
  monthlyAmount: tidy(value.monthlyAmount, numberInput, digits(plan)),
  startingAmount: tidy(value.startingAmount, numberInput, digits(plan)),
});

export function PlanTab({ onImport }: TabProps) {
  const rules = useRules();
  const holding = useHoldingCountry();
  const t = useTranslations('settings.plan');
  const f = useFormatters();
  return (
    <div className="flex flex-col gap-stack-lg">
      <PlanTabForm<ScheduleValue, Schedule, ScheduleIssue>
        onImport={onImport}
        toValue={toValue}
        read={schedule}
        changed={changed}
        tidy={tidied}
        paths={PATHS}
        editor={({ plan, ...editor }) => {
          const { lastBuy } = editor.value;
          const early = lastBuy === '' ? null : earlyToAccept(plan, lastBuy);
          const rule = ruleNameOf(plan.holdingRule, rules);
          const notice = early && { ...early, rule, ...(holding === null ? {} : { country: holding }) };
          const ended = plan.endedBuyingOn === null ? undefined : t('ended', { date: f.date(plan.endedBuyingOn) });
          return <ScheduleEditor currency={plan.payCurrency} early={notice} lastBuyHint={ended} {...editor} />;
        }}
      />
      <CalendarRow />
    </div>
  );
}
