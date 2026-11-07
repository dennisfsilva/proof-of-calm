import { assertNever, defaultTaxYear, taxYearSpan, taxYears } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { reportError } from '../../../lib/errors';
import { useProfile, useRules, useServices, useSnapshot, useToday } from '../../../lib/services';
import { dataActions } from '../actions';
import { useTaxYearWords } from '../tax-year';

// The tax-year export under Your data's export buttons (docs/DOMAIN.md §3.13), below the one export line that
// covers it (docs/LEGAL.md §4): a native select of the country's tax years, newest first, the latest ended one
// chosen, then the button. A year across two calendar years reads as the UK card writes it, "2026 to 2027".
// Without the country's rules or profile on the device it says so and offers nothing; for the models the app
// does not export yet (France, the Netherlands, #272) it renders nothing.

export function TaxYearExport() {
  const t = useTranslations('settings.data');
  const tErrors = useTranslations('errors');
  const words = useTaxYearWords();
  const services = useServices();
  const actions = useMemo(() => dataActions(services), [services]);
  const rules = useRules();
  const profile = useProfile(rules?.code);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const today = useToday();
  const id = useId();
  const [chosen, setChosen] = useState<number | null>(null);
  const [failed, setFailed] = useState<'not-saved' | 'unknown' | null>(null);

  if (rules === null) return <p className="text-ink-2">{t('taxYear.notLoaded')}</p>;
  const model = rules.computationModel;
  switch (model.kind) {
    case 'per-lot':
      break;
    case 'portfolio-wide':
    case 'wealth-snapshot':
      return null;
    default:
      return assertNever(model);
  }
  if (profile === null) return <p className="text-ink-2">{t('taxYear.notLoaded')}</p>;
  const years = taxYears(entries, rules.taxYear, today);
  if (years.length === 0) return <p className="text-ink-2">{t('taxYear.noEntries')}</p>;
  const year = chosen !== null && years.includes(chosen) ? chosen : defaultTaxYear(entries, rules.taxYear, today);

  const label = (endingIn: number) => {
    const span = taxYearSpan(rules.taxYear, endingIn);
    const from = span.from.slice(0, 4);
    const name = from === String(endingIn) ? from : t('taxYear.span', { from, to: String(endingIn) });
    return today <= span.to ? t('taxYear.running', { year: name }) : name;
  };

  const exportYear = async () => {
    if (year === null) return;
    try {
      setFailed((await actions.exportTaxYear(year, words)) ? null : 'not-saved');
    } catch (error) {
      reportError(error);
      setFailed('unknown');
    }
  };

  return (
    <div className="flex flex-col gap-stack-sm">
      <div className="flex flex-col gap-stack-xs">
        <label htmlFor={id} className="font-medium text-14 text-ink">
          {t('taxYear.label')}
        </label>
        <select
          id={id}
          value={year ?? undefined}
          onChange={(event) => setChosen(Number(event.target.value))}
          className="min-h-target w-full min-w-0 rounded-md border border-line-2 bg-surface-2 px-3 text-16 text-ink"
        >
          {years.map((endingIn) => (
            <option key={endingIn} value={endingIn}>
              {label(endingIn)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-target-gap">
        <Button variant="secondary" onClick={() => void exportYear()}>
          {t('taxYear.export')}
        </Button>
      </div>
      {failed !== null && (
        <p role="alert" className="text-ink">
          {failed === 'unknown' ? tErrors('unknown', { product: BRAND.name }) : t('exportNotSaved')}
        </p>
      )}
    </div>
  );
}
