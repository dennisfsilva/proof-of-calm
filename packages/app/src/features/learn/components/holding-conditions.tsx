'use client';

import { holdingRuleSource } from '@proofofcalm/content';
import { sameHoldingRule, underReview } from '@proofofcalm/core';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@proofofcalm/ui/components/collapsible';
import { useTranslations } from 'use-intl';
import { useFormatters, useProfile, useRules, useSnapshot, useToday } from '../../../lib/services';
import { CountryDateLine } from './country-date-line';

// What the app cannot verify about a computed date, beside the first date on a screen (docs/JURISDICTIONS.md §2,
// docs/LEGAL.md §4): the country's first condition, then the others behind one control (`ConditionLines`, which
// the early-opening notice and the country change's last-buy row show too), then the country's date line, which
// a date under the country's rule always carries (docs/LEGAL.md §6 question 13): alone where the country lists no
// condition, and in its plain form until the rule's source is known, which `useProfile` loads (the shell boots on
// the rules, not the profile; ADR-0049). A card under review (docs/JURISDICTIONS.md §1) keeps the conditions,
// with the under-review form of the date line and no source: the date stays on the rows beside this block, so
// the sentence that can deny it stays too. The sentences are the rules'. Nothing shows for a rule that is not
// the country's: the person's own, or a plan whose country fell back to the generic profile.

/** The conditions alone: the first in full, the rest behind one control; nothing for an empty list. */
export function ConditionLines({ conditions }: { readonly conditions: readonly string[] }) {
  const t = useTranslations('shell.holdingConditions');
  const [first, ...rest] = conditions;
  if (first === undefined) return null;
  return (
    <>
      <p className="text-13 text-ink-2">{first}</p>
      {rest.length > 0 && (
        <Collapsible className="gap-stack-xs">
          <CollapsibleTrigger>{t('more', { count: rest.length })}</CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="flex flex-col gap-stack-xs text-13 text-ink-2">
              {rest.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}

export function HoldingConditions() {
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const rules = useRules();
  const f = useFormatters();
  const today = useToday();
  const shown =
    plan !== null &&
    rules !== null &&
    rules.code === plan.country &&
    sameHoldingRule(plan.holdingRule, rules.holdingRule);
  const profile = useProfile(shown ? rules.code : undefined);
  if (!shown) return null;
  const stale = underReview(rules.status, today);
  const source = stale || profile === null ? null : holdingRuleSource(profile);
  return (
    <div className="flex w-full flex-col gap-stack-xs">
      <ConditionLines conditions={rules.holdingRuleConditions} />
      <CountryDateLine country={{ reviewed: f.date(rules.status.lastReviewed), source, underReview: stale }} />
    </div>
  );
}
