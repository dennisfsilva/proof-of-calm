import type { CountryChoice, ProfileCode } from '@proofofcalm/content';
import type { CountrySuggestion } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@proofofcalm/ui/components/select';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { useCountryArgs } from '../../../lib/countries';

// The country (docs/JURISDICTIONS.md §3, never the IP address): a high or medium suggestion confirmed with
// one tap, a low one named but chosen in the list. Residence decides tax, so the line says so whenever the
// language points elsewhere, named country or not.
export type CountryStepProps = {
  readonly choices: readonly CountryChoice[];
  readonly suggestion: CountrySuggestion | null;
  /** The country chosen earlier in this setup; it wins over the suggestion. */
  readonly value: ProfileCode | null;
  /** The choice is being written (Settings' import): the button stays focusable, and a press does nothing (docs/DESIGN.md §6). */
  readonly pending?: boolean;
  onChoose(country: ProfileCode): void;
};

export function CountryStep({ choices, suggestion, value, pending = false, onChoose }: CountryStepProps) {
  const t = useTranslations('onboarding.country');
  const forms = useCountryArgs();
  const suggested = choices.find((choice) => choice.code === suggestion?.country);
  const confident = suggestion?.confidence === 'high' || suggestion?.confidence === 'medium';
  const [picked, setPicked] = useState<ProfileCode | null>(
    value ?? (confident ? (suggested?.code as ProfileCode | undefined) : undefined) ?? null,
  );
  const chosen = choices.find((choice) => choice.code === picked);
  const items = choices.map((choice) => ({ value: choice.code as ProfileCode, label: choice.name }));
  return (
    <section className="flex flex-col gap-stack-md">
      <h2 tabIndex={-1} className="font-semibold text-20 tracking-heading">
        {t('heading')}
      </h2>
      {suggested !== undefined && <p>{t('suggested', forms(suggested.code))}</p>}
      {suggestion?.languageDiffers === true && <p className="text-ink-2">{t('languageDiffers')}</p>}
      <Select<ProfileCode> items={items} value={picked} onValueChange={(code) => code !== null && setPicked(code)}>
        <SelectLabel>{t('label')}</SelectLabel>
        <SelectTrigger>
          <SelectValue placeholder={t('placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chosen !== undefined && (
        <Button
          className="self-start"
          disabled={pending}
          focusableWhenDisabled
          onClick={() => onChoose(chosen.code as ProfileCode)}
        >
          {t('confirm', forms(chosen.code))}
        </Button>
      )}
    </section>
  );
}
