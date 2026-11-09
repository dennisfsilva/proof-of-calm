import type { CountryRules, Plan } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useServices } from '../../../lib/services';
import { changePayCurrencyOf } from '../actions';

// Currency & data, above the country select, while the plan's pay currency differs from its country's (ADR-0053,
// docs/DOMAIN.md §6 "Change pay currency"): the line says so, and its button relabels the plan to the country's
// currency, so a wrong "Keep" is fixed without changing country again. Nothing is converted. The section's result
// line reports the change and takes the focus (`onDone`), since the line leaves with the difference; a refused
// write keeps the line and focuses the sentence that says why (docs/DESIGN.md §6).

type PayCurrencyLineProps = {
  readonly plan: Plan;
  /** The rules of the plan's country. */
  readonly rules: CountryRules;
  readonly onDone: (said: string) => void;
};

export function PayCurrencyLine({ plan, rules, onDone }: PayCurrencyLineProps) {
  const t = useTranslations('settings.country.payCurrency');
  const settings = useTranslations('settings');
  const services = useServices();
  const [problem, setProblem] = useState<'changed' | 'notSaved' | null>(null);
  const [reported, setReported] = useState(0);
  const busy = useRef(false);
  const problemLine = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (reported > 0) problemLine.current?.focus();
  }, [reported]);
  if (plan.payCurrency === rules.currency) return null;

  const country = rules.currency;
  // One write at a time: a second press while one is written does nothing.
  const change = async () => {
    if (busy.current) return;
    busy.current = true;
    let outcome: Awaited<ReturnType<typeof changePayCurrencyOf>>;
    try {
      outcome = await changePayCurrencyOf(services, plan, country);
    } finally {
      busy.current = false;
    }
    if (outcome.ok) {
      setProblem(null);
      onDone(outcome.value.written ? t('changed', { country }) : '');
      return;
    }
    setProblem(Array.isArray(outcome.error) ? 'notSaved' : 'changed');
    setReported((count) => count + 1);
  };

  return (
    <div className="flex flex-col gap-stack-sm">
      <p className="text-16 text-ink">{t('line', { logged: plan.payCurrency, country })}</p>
      {problem !== null && (
        <p ref={problemLine} tabIndex={-1} role="alert" className="text-13 text-negative">
          {settings(problem)}
        </p>
      )}
      <div>
        <Button variant="secondary" onClick={() => void change()}>
          {t('button', { country })}
        </Button>
      </div>
    </div>
  );
}
