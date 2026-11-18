import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@proofofcalm/ui/components/select';
import { useId } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { isUiLanguage, LANGUAGE_NAMES, type UiLanguage, useOfferedLanguages, writeLanguage } from '../../../lib/i18n';

// Settings → Language (ADR-0023, Deviations of 2026-11-18): the languages the build offers, each named in itself
// with its `lang`, shown only when there are two (a preview deployment of the web host). A choice stores the device
// preference and reloads the page, so every namespace on screen comes back in one language. The line that says so
// leads, before the select it describes (docs/CONTENT-STYLE.md §3, Settings tabs).

export type LanguageSectionProps = {
  /** The page reload after the choice is stored; a story or test passes a spy. */
  reload?: () => void;
};

export function LanguageSection({ reload = () => location.reload() }: LanguageSectionProps) {
  const t = useTranslations('settings.language');
  const offered = useOfferedLanguages();
  const current = useLocale();
  const headingId = useId();
  const lineId = useId();
  if (offered.length < 2) return null;
  const choose = (value: UiLanguage | null) => {
    if (value === null || value === current) return;
    writeLanguage(localStorage, value);
    reload();
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-stack-sm">
      <h2 id={headingId} className="font-semibold text-20 text-ink">
        {t('heading')}
      </h2>
      <p id={lineId} className="text-13 text-ink-2">
        {t('reloads')}
      </p>
      <Select<UiLanguage> value={isUiLanguage(current) ? current : 'en'} onValueChange={choose}>
        <SelectLabel>{t('label')}</SelectLabel>
        <SelectTrigger aria-describedby={lineId}>
          <SelectValue>{(value: UiLanguage) => <span lang={value}>{LANGUAGE_NAMES[value]}</span>}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {offered.map((language) => (
            <SelectItem key={language} value={language} lang={language}>
              {LANGUAGE_NAMES[language]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </section>
  );
}
