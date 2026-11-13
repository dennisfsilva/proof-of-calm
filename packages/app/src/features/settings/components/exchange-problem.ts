import type { BackupError, ExchangeFileError } from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import { useFormatters } from '../../../lib/services';
import type { readImport } from '../model/import';

// The alerts of an exchange's file in Settings → data (docs/DOMAIN.md §3.13, docs/CONTENT-STYLE.md §3): each code of
// the exchange reader that names the file gets its own line, and a ledger with no plan to import into asks for one.
// The reader's `not-recognised` keeps the backup import's line, which names every format the import reads.

/** Why a chosen file does not open as an exchange's file, worded by `useExchangeProblemText`. */
export type ExchangeProblem =
  | Exclude<ExchangeFileError, { readonly code: 'not-recognised' }>
  | { readonly code: 'needs-plan' };

/** The exchange reader's codes that name the file, or a ledger read with no plan; null for any other read. */
export function exchangeProblem(read: ReturnType<typeof readImport>, hasPlan: boolean): ExchangeProblem | null {
  if (read.ok) return read.value.kind === 'exchange' && !hasPlan ? { code: 'needs-plan' } : null;
  const error: BackupError | ExchangeFileError = read.error;
  switch (error.code) {
    case 'zip':
    case 'kraken-trades':
    case 'missing-columns':
    case 'no-rows':
      return error;
    default:
      return null;
  }
}

/** The alert's words for a problem; the missing columns as one list in the UI language (CONTENT-STYLE §1 rule 9). */
export function useExchangeProblemText(): (problem: ExchangeProblem) => string {
  const t = useTranslations('settings.data.exchange.problem');
  const format = useFormatters();
  return (problem) =>
    problem.code === 'missing-columns'
      ? t('missing-columns', { columns: format.list(problem.columns), count: problem.columns.length })
      : t(problem.code);
}
