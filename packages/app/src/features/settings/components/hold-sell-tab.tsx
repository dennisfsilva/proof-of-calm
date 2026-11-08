import {
  err,
  type HoldingRule,
  type Plan,
  type PlanIssue,
  type Result,
  type SellWindow,
  sameHoldingRule,
} from '@proofofcalm/core';
import type { NumberInput } from '../../../lib/format';
import { useFormatters, useNumberInput, useRules } from '../../../lib/services';
import {
  acceptedAsStored,
  earlyOpenOf,
  type HoldingIssue,
  HoldingRuleEditor,
  type HoldingValue,
  holdingRuleOf,
  holdingValueOf,
  ruleNameOf,
  SellWindowEditor,
  type SellWindowIssue,
  type SellWindowValue,
  sameWindow,
  sellWindowOf,
  sellWindowValueOf,
} from '../../plan';
import type { PlanEdit } from '../actions';
import { PlanTabForm, type TabProps, tidy } from './plan-form';
import { useHoldingCountry } from './use-holding-country';

// Settings' Hold & sell tab: the holding rule and sell-window editors over the plan and its country's rule
// (docs/DOMAIN.md §6 "Edit the plan", docs/JURISDICTIONS.md §5). A rule equal to the country's is stored as the
// country's. A window that opens before the last buy passes the rule, whether the rule or the dates moved, saves
// with the person's acceptance on the window, which starts unticked; one stored for the same rule and dates holds
// without asking, and changing the rule or a date asks again. The country's card and the
// notice's date line come from `useHoldingCountry`: the rule's source is the profile's first, the law that sets
// it (art. 10 CIRS for Portugal, § 23 EStG for Germany). The generic profile has no reviewed rule and its first
// source is DAC8, a reporting directive: its card shows the profile's status and holding-rule text in place of
// the rule, and no source (docs/JURISDICTIONS.md "Generic profile `XX`").

type HoldSellValue = { readonly holding: HoldingValue; readonly window: SellWindowValue };
type HoldSell = { readonly holdingRule: HoldingRule; readonly sellWindow: SellWindow | null };
type Issue = HoldingIssue | SellWindowIssue;

const PATHS: ReadonlySet<unknown> = new Set(['holdingRule', 'sellWindow']);

const changed = ({ holdingRule, sellWindow }: HoldSell, opened: Plan): PlanEdit => ({
  ...(sameHoldingRule(holdingRule, opened.holdingRule) ? {} : { holdingRule }),
  ...(sameWindow(sellWindow, opened.sellWindow) ? {} : { sellWindow }),
});

const tidied = ({ holding, window }: HoldSellValue, numberInput: NumberInput): HoldSellValue => ({
  holding: { ...holding, count: holding.kind === 'none' ? holding.count : tidy(holding.count, numberInput, 0) },
  window,
});

export function HoldSellTab({ onImport }: TabProps) {
  const rules = useRules();
  const numberInput = useNumberInput();
  const format = useFormatters();
  const country = useHoldingCountry();
  const countryRule = country?.rule ?? null;
  // The window is read against the rule the save would keep; a rule that cannot be read leaves its own issues.
  const read = (plan: Plan, value: HoldSellValue, input: NumberInput): Result<HoldSell, Issue[]> => {
    const rule = holdingRuleOf(value.holding, countryRule, input);
    if (!rule.ok) return err(rule.error);
    const held = acceptedAsStored(plan, rule.value, value.window);
    const window = sellWindowOf(
      { lastBuy: plan.lastBuy, holdingRule: rule.value },
      held ? { ...value.window, acceptEarly: true } : value.window,
    );
    return window.ok ? { ok: true, value: { holdingRule: rule.value, sellWindow: window.value } } : window;
  };
  return (
    <PlanTabForm<HoldSellValue, HoldSell, Issue>
      onImport={onImport}
      toValue={(plan, input) => ({
        holding: holdingValueOf(plan.holdingRule, countryRule, input),
        window: sellWindowValueOf(plan.sellWindow),
      })}
      read={read}
      changed={changed}
      tidy={tidied}
      paths={PATHS}
      editor={({ plan, value, issues, onChange }) => {
        const rule = numberInput === null ? null : holdingRuleOf(value.holding, countryRule, numberInput);
        const shown = rule?.ok === true && !acceptedAsStored(plan, rule.value, value.window) ? rule.value : null;
        const early = shown === null ? null : earlyOpenOf({ lastBuy: plan.lastBuy, holdingRule: shown }, value.window);
        const notice =
          shown === null || early === null
            ? null
            : { ...early, rule: ruleNameOf(shown, rules), ...(country === null ? {} : { country }) };
        const ruleIssues = issues.filter((issue): issue is HoldingIssue | PlanIssue => issue.path[0] !== 'sellWindow');
        return (
          <>
            <HoldingRuleEditor
              country={country}
              value={value.holding}
              issues={ruleIssues}
              onChange={(holding) => onChange({ holding, window: { ...value.window, acceptEarly: false } })}
              format={format}
            />
            <SellWindowEditor
              value={value.window}
              issues={issues}
              early={notice}
              onChange={(window) => onChange({ ...value, window })}
            />
          </>
        );
      }}
    />
  );
}
