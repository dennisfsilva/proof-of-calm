'use client';

import { Checkbox } from '@proofofcalm/ui/components/checkbox';
import { useId } from 'react';
import { useTranslations } from 'use-intl';
import type { Formatters } from '../../../lib/format';
import { useFormatters } from '../../../lib/services';
import { ConditionLines, CountryDateLine } from '../../learn';
import type { EarlyNotice } from '../lib/sell-window';

// A sell window that opens before the last buy passes the holding rule (docs/DOMAIN.md §2.1): a warning the
// person can accept, never a refusal. It names both dates in calendar order, what passing the rule means and
// the rule, by its country's name when known (a country change names the new country's), then the other way out beside
// the acceptance: an earlier last buy on the Plan tab, a later opening on Hold & sell (where the country change,
// which has no opening date, sends the person), another starting point on onboarding's template path. Its host
// records the acceptance on the window (`acceptedEarlyOpen`) and drops it when a date or the rule moves. The
// checkbox is described by the notice, so a refused save that moves the focus to it reads both, and a refused save adds under the label the line that names the fix (an alert), which
// the checkbox is then described by as well. Under the notice, the dates' "Computed from your dates, not tax advice" line (the
// template's dates on onboarding's template path), the country's conditions on the date (the first in full, the
// rest behind one control) and the country's date line, unless the rule is the person's own (docs/LEGAL.md §4
// "Lines that are data"). A host that shows the note itself (the country change's last-buy row) shows the
// conditions under it too, so the notice leaves both to it and keeps the date line.

export type EarlyWindowNoticeProps = EarlyNotice & {
  /** The field the notice sits under, or onboarding's template path: it names the other way out. */
  readonly on: 'lastBuy' | 'window' | 'template';
  readonly accepted: boolean;
  readonly onAccept: (accepted: boolean) => void;
  /** Set by a refused save: the acceptance is what it waits for. */
  readonly invalid?: boolean | undefined;
  /** The dates' formatting: the plan's country by default; onboarding passes the chosen country's. */
  readonly format?: Formatters | undefined;
  /** The "not tax advice" line under the notice (default true): false where the host already shows it once. */
  readonly taxLine?: boolean | undefined;
  /** Set by the country change, which has no opening date: its refusal sends the person to Hold & sell. */
  readonly countryChange?: boolean | undefined;
};

export function EarlyWindowNotice(props: EarlyWindowNoticeProps) {
  const { eligibleOn, effect, opensOn, rule, on, accepted, onAccept, invalid, country, taxLine = true } = props;
  const t = useTranslations('plan.earlyWindow');
  const holding = useTranslations('plan.holding');
  const plans = useFormatters();
  const f = props.format ?? plans;
  const notice = useId();
  const refusal = useId();
  const refused = invalid === true;
  const opens = f.date(opensOn);
  const host = props.countryChange === true ? 'country' : 'other';
  return (
    <div className="flex flex-col gap-stack-xs">
      <p id={notice} className="text-13 text-ink">
        {t('notice', {
          opensOn: opens,
          eligibleOn: f.date(eligibleOn),
          effect,
          rule: rule === 'country' && country !== undefined ? 'named' : rule,
          country: country?.name ?? '',
          on,
          host,
        })}
      </p>
      {taxLine && <p className="text-13 text-ink-2">{holding(on === 'template' ? 'templateNote' : 'note')}</p>}
      {country !== undefined && rule !== 'own' && (
        <>
          {taxLine && <ConditionLines conditions={country.conditions ?? []} />}
          <CountryDateLine country={country} />
        </>
      )}
      <label className="flex items-start gap-1 text-16 text-ink">
        <Checkbox
          checked={accepted}
          onCheckedChange={(checked) => onAccept(checked)}
          aria-invalid={refused || undefined}
          aria-describedby={refused ? `${notice} ${refusal}` : notice}
        />
        <span className="py-3">{t('accept', { opensOn: opens, on })}</span>
      </label>
      {refused && (
        <p id={refusal} role="alert" className="text-13 text-negative">
          {t('refused', { on, host })}
        </p>
      )}
    </div>
  );
}
