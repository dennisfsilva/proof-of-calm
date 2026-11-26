import { decimal, IMPORT_MAX_BYTES } from '@proofofcalm/core';
import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { createNumberInput } from '../../../lib/format';
import type { Messages } from '../../../lib/i18n';
import { useFormatters } from '../../../lib/services';
import type { DataRefusal } from '../import-guard';
import { type ExchangeProblem, useExchangeProblemText } from './exchange-problem';

// The words of the alert under Settings' import (data-section.tsx; docs/CONTENT-STYLE.md §3 "Import a file"), one
// per reason a chosen file or a pasted text was not imported, its counts grouped as the formatters' locale groups.

/** Why a chosen file was not imported: a backup error, the generic line, a file over the byte cap, or a refusal. */
export type Problem =
  | { readonly code: keyof Messages['errors']['backup'] }
  | { readonly code: 'unknown' | 'too-large' }
  | { readonly code: 'exchange'; readonly problem: ExchangeProblem }
  | (DataRefusal & { readonly pasted: boolean });

export function useImportProblemText(): (problem: Problem) => string {
  const t = useTranslations('settings.data');
  const tErrors = useTranslations('errors');
  const exchangeText = useExchangeProblemText();
  const format = useFormatters();
  const figures = useMemo(() => createNumberInput(format.locales.numbers), [format.locales.numbers]);
  const figure = (value: number) => figures.format(decimal(String(value)));
  const product = BRAND.name;
  return (problem) =>
    problem.code === 'unknown'
      ? tErrors('unknown', { product })
      : problem.code === 'too-large'
        ? t('import.tooLarge', { max: figure(IMPORT_MAX_BYTES / 1_000_000), product })
        : problem.code === 'newer-rows' || problem.code === 'changed'
          ? t(problem.code === 'changed' ? 'import.changed' : 'import.newerRows', { product })
          : problem.code === 'currency-mismatch'
            ? t(problem.pasted ? 'import.currencyMismatchPasted' : 'import.currencyMismatch', {
                file: problem.file,
                plan: problem.plan,
              })
            : problem.code === 'too-many-entries'
              ? // Only a DCA plan page file holds more on its own: a backup holds at most the cap.
                t(problem.file > problem.max ? 'import.tooManyInFile' : 'import.tooManyEntries', {
                  entries: figure(problem.entries),
                  file: figure(problem.file),
                  max: figure(problem.max),
                })
              : problem.code === 'invalid-entries'
                ? t(problem.pasted ? 'import.invalidEntriesPasted' : 'import.invalidEntries', {
                    count: problem.ids.length,
                    figure: figure(problem.ids.length),
                    product,
                  })
                : problem.code === 'exchange'
                  ? exchangeText(problem.problem)
                  : tErrors(`backup.${problem.code}`, { product });
}
