import {
  type BackupError,
  type ExchangeFileError,
  type ExchangeId,
  IMPORT_MAX_BYTES,
  type Result,
} from '@proofofcalm/core';
import { useTranslations } from 'use-intl';
import type { ZipError } from '../../../lib/adapters';
import { BRAND } from '../../../lib/brand';
import { useFormatters } from '../../../lib/services';
import type { ExchangeImportOutcome } from '../exchange-actions';
import type { readImport } from '../model/import';
import { useFigure } from './exchange-import-sections';

// The alerts of an exchange's file in Settings → data (docs/DOMAIN.md §3.13, docs/CONTENT-STYLE.md §3): each code of
// the exchange reader that names the file gets its own line, a ledger with no plan to import into asks for one, and
// each refusal of the write that ends the preview has its line. The reader's `not-recognised` keeps the backup
// import's line, which names every format the import reads; the write's `changed` stays in the preview. A chosen
// ZIP the reader cannot open (lib/adapters/zip.ts) has its code's line; a pasted ZIP keeps the core's `zip` line.

type Refusal = Extract<ExchangeImportOutcome, { readonly kind: 'refused' }>['refusal'];
/** A refusal of the write that ends the preview: every one but `changed`, which shows the new preview. */
export type ExchangeRefusal = Exclude<Refusal, { readonly code: 'changed' }>;

/** Why a chosen file does not open as an exchange's file, or why its import wrote nothing. */
export type ExchangeProblem =
  | Exclude<ExchangeFileError, { readonly code: 'not-recognised' }>
  | { readonly code: 'needs-plan'; readonly exchange: ExchangeId }
  | ZipError
  | ExchangeRefusal;

/** The reader's codes that name the file, a ZIP's, or an export read with no plan; null for any other read. */
export function exchangeProblem(
  read: ReturnType<typeof readImport> | Result<never, ZipError>,
  hasPlan: boolean,
): ExchangeProblem | null {
  if (read.ok) {
    const { value } = read;
    return value.kind === 'exchange' && !hasPlan ? { code: 'needs-plan', exchange: value.file.exchange } : null;
  }
  const error: BackupError | ExchangeFileError | ZipError = read.error;
  switch (error.code) {
    case 'zip-no-csv':
    case 'zip-several-csv':
    case 'zip-unsupported':
    case 'zip-too-large':
    case 'zip':
    case 'kraken-trades':
    case 'missing-columns':
    case 'unknown-columns':
    case 'no-rows':
      return error;
    default:
      return null;
  }
}

/** The alert's words for a problem; the missing columns as one list in the UI language (CONTENT-STYLE §1 rule 9). */
export function useExchangeProblemText(): (problem: ExchangeProblem) => string {
  const t = useTranslations('settings.data');
  const format = useFormatters();
  const figure = useFigure();
  return (problem) => {
    switch (problem.code) {
      case 'missing-columns':
        return t('exchange.problem.missing-columns', {
          exchange: problem.exchange,
          columns: format.list(problem.columns),
          count: problem.columns.length,
        });
      case 'unknown-columns': {
        const { columns, others } = problem;
        const more = others > 0 && columns.length > 0 ? [t('exchange.leftOut.more', { count: figure(others) })] : [];
        return t('exchange.problem.unknown-columns', {
          product: BRAND.name,
          named: columns.length > 0 ? 'yes' : 'no',
          columns: format.list([...columns, ...more]),
          count: columns.length + others,
          figure: figure(columns.length + others),
        });
      }
      case 'no-rows':
      case 'needs-plan':
        return t(`exchange.problem.${problem.code}`, { exchange: problem.exchange });
      case 'zip-unsupported':
        return t('exchange.problem.zip-unsupported', { product: BRAND.name });
      case 'zip-too-large':
        return t('exchange.problem.zip-too-large', { max: figure(IMPORT_MAX_BYTES / 1_000_000) });
      case 'newer-rows':
        return t('import.newerRows', { product: BRAND.name });
      case 'too-many-entries':
        return t('exchange.problem.too-many-entries', { entries: figure(problem.entries), max: figure(problem.max) });
      case 'invalid-entries':
        return t('exchange.problem.invalid-entries', { count: problem.ids.length, figure: figure(problem.ids.length) });
      default:
        return t(`exchange.problem.${problem.code}`);
    }
  };
}
