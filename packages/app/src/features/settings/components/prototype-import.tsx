import {
  type CountryProfile,
  countryChoices,
  loadProfiles,
  type ProfileCode,
  suggestionProfiles,
} from '@proofofcalm/content';
import { decimal, type ImportMode, suggestCountry } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Field, FieldLabel } from '@proofofcalm/ui/components/field';
import { Textarea } from '@proofofcalm/ui/components/textarea';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { deviceLocale } from '../../../lib/adapters';
import { reportError } from '../../../lib/errors';
import { createNumberInput } from '../../../lib/format';
import { loadNamespace } from '../../../lib/i18n';
import { useFormatters } from '../../../lib/services';
import { CountryStep } from '../../onboarding';
import type { ReportNote } from '../actions';

// A file from the DCA plan page in Settings → data (docs/DOMAIN.md §7), chosen or pasted into the paste box:
// the file line, then over a plan the two
// modes as for a backup (Replace asks first, in the section's dialog), or with no plan the country step as
// onboarding builds it, whose one tap confirms the country and imports (ADR-0014: the import never guesses one).
// The report under the result words each adjustment the core made to what the page showed.

/** The paste box: a text copied from the DCA plan page (or a backup), read by the same reader as a file. */
export function PrototypePaste({ pending, onRead }: { readonly pending: boolean; onRead(text: string): void }) {
  const t = useTranslations('settings.data.paste');
  const [text, setText] = useState('');
  // A long paste grows the box to its six lines, which can push Read below the fold: once the paste has rendered,
  // Read scrolls by the least that shows it, and the focus stays in the box (docs/DESIGN.md §6).
  const button = useRef<HTMLButtonElement>(null);
  const reveal = () => requestAnimationFrame(() => button.current?.scrollIntoView({ block: 'nearest' }));
  const read = () => {
    if (pending) return;
    onRead(text);
    setText('');
  };
  return (
    <div className="flex flex-col gap-stack-sm">
      <Field>
        <FieldLabel>{t('label')}</FieldLabel>
        {/* At most about six lines: an export is thousands of lines, and Read must stay in view below the box. */}
        <Textarea
          value={text}
          spellCheck={false}
          className="max-h-40"
          onChange={(event) => setText(event.currentTarget.value)}
          onPaste={reveal}
        />
      </Field>
      <div>
        <Button ref={button} variant="secondary" disabled={pending} focusableWhenDisabled onClick={read}>
          {t('read')}
        </Button>
      </div>
    </div>
  );
}

export type PrototypeImportProps = {
  /** The file's name; null for a pasted text. */
  readonly name: string | null;
  readonly count: number;
  readonly hasPlan: boolean;
  /** An import is being written: the buttons stay focusable, and a press does nothing (docs/DESIGN.md §6). */
  readonly pending: boolean;
  onReplace(): void;
  onImport(mode: ImportMode, country: ProfileCode | null): void;
};

export function PrototypeImport({ name, count, hasPlan, pending, onReplace, onImport }: PrototypeImportProps) {
  const t = useTranslations('settings.data');
  const format = useFormatters();
  // The count grouped as the country's numbers are (`1,234`, `1.234`; docs/CONTENT-STYLE.md §4).
  const figure = useMemo(
    () => createNumberInput(format.locales.numbers).format(decimal(String(count))),
    [format.locales.numbers, count],
  );
  return (
    <>
      <p>{name === null ? t('prototype.pasted', { count: figure }) : t('prototype.file', { name, count: figure })}</p>
      {hasPlan ? (
        <div className="flex flex-wrap gap-target-gap">
          <Button variant="destructive" disabled={pending} focusableWhenDisabled onClick={onReplace}>
            {t('import.replace')}
          </Button>
          <Button
            variant="secondary"
            disabled={pending}
            focusableWhenDisabled
            onClick={() => onImport('add-missing', null)}
          >
            {t('import.addMissing')}
          </Button>
        </div>
      ) : (
        <PrototypeCountry pending={pending} onChoose={(country) => onImport('replace', country)} />
      )}
    </>
  );
}

/** The country step, once the profiles and onboarding's words are loaded; the suggestion is the device's. */
function PrototypeCountry({ pending, onChoose }: { readonly pending: boolean; onChoose(country: ProfileCode): void }) {
  const t = useTranslations('settings');
  const [profiles, setProfiles] = useState<CountryProfile[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([loadProfiles(), loadNamespace('onboarding')])
      .then(([loaded]) => live && setProfiles(loaded))
      .catch((error: unknown) => {
        reportError(error);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);
  const suggestion = useMemo(
    () => (profiles === null ? null : suggestCountry(deviceLocale(), suggestionProfiles(profiles))),
    [profiles],
  );
  // Once, when the step appears: the focus moves to its first line, which scrolls it into view (docs/DESIGN.md §6).
  const intro = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (profiles !== null) intro.current?.focus();
  }, [profiles]);
  if (failed) return <p role="alert">{t('country.notLoaded')}</p>;
  if (profiles === null) return null;
  return (
    <>
      <p ref={intro} tabIndex={-1} className="text-ink-2">
        {t('data.prototype.country')}
      </p>
      <CountryStep
        choices={countryChoices(profiles, suggestion)}
        suggestion={suggestion}
        value={null}
        pending={pending}
        onChoose={onChoose}
      />
    </>
  );
}

/** One line per note of the import's report, in the core's order; nothing when it adjusted nothing. */
export function PrototypeReport({ notes }: { readonly notes: readonly ReportNote[] }) {
  const t = useTranslations('settings.data.prototype.report');
  const format = useFormatters();
  const figures = useMemo(() => createNumberInput(format.locales.numbers), [format.locales.numbers]);
  if (notes.length === 0) return null;
  return (
    <ul className="flex list-disc flex-col gap-stack-sm pl-5 text-ink-2">
      {notes.map((note) => {
        const { code, ...values } = note;
        // The percentages and the date in the locale; the scenario under its own name, since `key` reads as filler.
        // A count selects the plural as it is and is shown as a figure, grouped as the file line's (`1.234`).
        const shown =
          note.code === 'last-buy-defaulted'
            ? { date: format.date(note.date) }
            : note.code === 'split-normalised'
              ? {
                  coin: note.coin,
                  from: format.percent(note.from, { decimals: 2 }),
                  to: format.percent(note.to, { decimals: 2 }),
                }
              : note.code === 'expectation-dropped'
                ? { scenario: note.key }
                : 'count' in note
                  ? { ...values, figure: figures.format(decimal(String(note.count))) }
                  : values;
        return <li key={JSON.stringify(note)}>{t(code, shown)}</li>;
      })}
    </ul>
  );
}
