import { assertNever, defaultTaxYear, taxYearSpan, taxYears } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@proofofcalm/ui/components/select';
import { useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { reportError } from '../../../lib/errors';
import { useProfileLoad, useRules, useRulesSettled, useServices, useSnapshot, useToday } from '../../../lib/services';
import { dataActions } from '../actions';
import { useTaxYearWords } from '../tax-year';

// The tax-year export under Your data's export buttons (docs/DOMAIN.md §3.13), below the one export line that
// covers it (docs/LEGAL.md §4): the ui Select of the country's tax years, newest first, the latest ended one
// chosen, then the button. A year across two calendar years reads as the UK card writes it, "2026 to 2027".
// Once a load has settled without the country's rules or profile it says they are not on the device and offers
// nothing; while either loads (the profile after boot, the rules after a change of country) it renders nothing,
// as for the models the app does not export yet (France, the Netherlands). Not a native <select>: one mounting
// in WebKit records a style-src-attr violation under the hashed CSP (docs/SECURITY.md §4); the ui Select does not.

export function TaxYearExport() {
  const t = useTranslations('settings.data');
  const tErrors = useTranslations('errors');
  const words = useTaxYearWords();
  const services = useServices();
  const actions = useMemo(() => dataActions(services), [services]);
  const rules = useRules();
  const rulesSettled = useRulesSettled();
  const { profile, settled: profileSettled } = useProfileLoad(rules?.code);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const today = useToday();
  const [chosen, setChosen] = useState<number | null>(null);
  const [failed, setFailed] = useState<'not-saved' | 'unknown' | null>(null);

  const notLoaded = <p className="text-ink-2">{t('taxYear.notLoaded')}</p>;
  if (rules === null) return rulesSettled ? notLoaded : null;
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
  if (profile === null) return profileSettled ? notLoaded : null;
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
        <Select<number> value={year} onValueChange={(value) => value !== null && setChosen(value)}>
          <SelectLabel>{t('taxYear.label')}</SelectLabel>
          <SelectTrigger>
            <SelectValue>{(value: number | null) => (value === null ? null : label(value))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {years.map((endingIn) => (
              <SelectItem key={endingIn} value={endingIn}>
                {label(endingIn)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
