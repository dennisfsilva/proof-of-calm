import type { ProfileCode } from '@proofofcalm/content';
import { decimal, IMPORT_MAX_BYTES, type ImportMode, liveEntries } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@proofofcalm/ui/components/dialog';
import { type ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { reportError } from '../../../lib/errors';
import { createNumberInput } from '../../../lib/format';
import type { Messages } from '../../../lib/i18n';
import { useClock, useFormatters, useServices, useSnapshot } from '../../../lib/services';
import { type DataRefusal, dataActions, type ImportOutcome, type PrototypeOutcome, type ReportNote } from '../actions';
import { type ReadImport, readImport } from '../model/import';
import { DeletePlanDialog } from './delete-plan-dialog';
import { PrototypeImport, PrototypePaste, PrototypeReport } from './prototype-import';
import { TaxYearExport } from './tax-year-export';

// Settings → data (docs/DOMAIN.md §3.13): the export line and the Risk page link beside the two exports
// (docs/LEGAL.md §4), the tax-year export under them (tax-year-export.tsx) and "Delete everything" below them
// (delete-plan-dialog.tsx), then the import of a JSON backup as "Replace everything" or "Add missing entries only", or as the one "Import this backup" with no
// plan, where both modes take the file's plan. Replacing a
// plan first asks, with the count and an export, as "Delete the plan" does (docs/CONTENT-STYLE.md §3), and
// the confirming button is the destructive one (docs/DESIGN.md §8); the safe one takes the focus when it opens.
// Every handler awaits its action and words a failure in an alert. An import's end takes the focus to what reports
// it, its alert or else its result line (docs/DESIGN.md §6); a cancelled replace gives it back to the button that asked.
// Add missing from a file in another pay currency adds nothing, and the alert names both (docs/DOMAIN.md §3.13)
// and, for a paste, the paste's own step. An import that would leave more entries than a plan holds writes nothing.
// Rows from a newer version refuse both modes, and the alert names the fix; under the exports one line names the entries left out.
// An import whose entries to store do not all read as entries writes nothing, and the alert counts them.
// A file from the DCA plan page imports through the same buttons and dialog (prototype-import.tsx), and a text
// pasted into the paste box is read as a chosen file is. One import runs at a time: while it writes, every import
// button, "Choose a file" and the paste's button stay focusable and a press does nothing, a file chosen meanwhile
// is refused, and the replace dialog stays open with its "Keep this plan".

/** Why a chosen file was not imported: a backup error, the generic line, a file over the byte cap, or a refusal. */
type Problem =
  | { readonly code: keyof Messages['errors']['backup'] }
  | { readonly code: 'unknown' | 'too-large' }
  | (DataRefusal & { readonly pasted: boolean });
type Chosen = { readonly name: string | null; readonly read: ReadImport };
/** An unreadable paste is named as text, with a step a paste can take; a file keeps its line. */
const unreadable = (code: keyof Messages['errors']['backup'], name: string | null) =>
  code === 'not-recognised' && name === null ? 'not-recognised-pasted' : code;

export function DataSection() {
  const t = useTranslations('settings.data');
  const tErrors = useTranslations('errors');
  const services = useServices();
  const actions = useMemo(() => dataActions(services), [services]);
  const hasPlan = useSnapshot((snapshot) => snapshot.plan !== null);
  const count = useSnapshot((snapshot) => liveEntries(snapshot.entries).length);
  const leftOut = useSnapshot((snapshot) => snapshot.newer.entries);
  const clock = useClock();
  const format = useFormatters();
  // A count the refusals and the import lines show, grouped as the formatters' locale groups it (`12,000`, `12.000`; CONTENT-STYLE §4).
  const figures = useMemo(() => createNumberInput(format.locales.numbers), [format.locales.numbers]);
  const figure = (value: number) => figures.format(decimal(String(value)));
  const input = useRef<HTMLInputElement>(null);
  const resultLine = useRef<HTMLParagraphElement>(null);
  const problemLine = useRef<HTMLParagraphElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  /** Set by a replace from the dialog, so that its closing moves focus to the result rather than back. */
  const replaced = useRef(false);
  /** Set by an import that ends outside the dialog, or a read that ends in a problem, so that the render showing its end
   * moves the focus there. */
  const settled = useRef(false);
  const headingId = useId();
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [outcome, setOutcome] = useState<Exclude<ImportOutcome, { readonly kind: 'refused' }> | null>(null);
  const [report, setReport] = useState<readonly ReportNote[]>([]);
  /** Set while an import writes; the ref answers a second press before the busy buttons have rendered. */
  const busy = useRef(false);
  const [importing, setImporting] = useState(false);
  const [exportFailed, setExportFailed] = useState<'not-saved' | 'date' | 'unknown' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const product = BRAND.name;
  /** The import buttons while one writes: focusable, so the focus stays on the one pressed (docs/DESIGN.md §6). */
  const pending = { disabled: importing, focusableWhenDisabled: true };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    // One import at a time: a file chosen while one writes is refused, not kept for after it.
    if (busy.current) {
      event.target.value = '';
      return;
    }
    const file = event.target.files?.[0];
    if (file !== undefined) await choose(file.name, () => file.text(), file.size);
  };
  const onPaste = (text: string) => {
    if (!busy.current) void choose(null, () => text);
  };
  /** A file and a pasted text take one reading path, so a pasted backup is read as a backup; null names a paste. */
  const choose = async (name: string | null, text: () => Promise<string> | string, bytes = 0) => {
    setOutcome(null);
    setReport([]);
    setChosen(null);
    setProblem(null);
    // A file heavier than any export of a full plan is not read at all (docs/DOMAIN.md §9).
    if (bytes > IMPORT_MAX_BYTES) {
      setProblem({ code: 'too-large' });
      settled.current = true;
      return;
    }
    try {
      const read = readImport(await text());
      setChosen(read.ok ? { name, read: read.value } : null);
      setProblem(read.ok ? null : { code: unreadable(read.error.code, name) });
      settled.current = !read.ok;
    } catch (error) {
      reportError(error);
      setProblem({ code: 'unknown' });
      settled.current = true;
    }
  };

  const exportFile = async (format: 'json' | 'csv') => {
    try {
      // 'not-saved' and false: the platform saved no file (the port allows it; the native adapter does so).
      const outcome = format === 'json' ? await actions.exportJson() : await actions.exportCsv();
      const notSaved = outcome === 'not-saved' || outcome === false;
      setExportFailed(outcome === 'date-not-stored' ? 'date' : notSaved ? 'not-saved' : null);
    } catch (error) {
      reportError(error);
      setExportFailed('unknown');
    }
  };

  // Shown beside the export buttons and again inside the replace dialog, which hides the section behind it;
  // opening the dialog keeps it, since only a later export that saves clears it.
  const exportAlert = exportFailed !== null && (
    <p role="alert" className="text-ink">
      {exportFailed === 'unknown'
        ? tErrors('unknown', { product })
        : t(exportFailed === 'date' ? 'exportDateFailed' : 'exportNotSaved')}
    </p>
  );

  // The dialog stays open until the replace is written, so that its closing knows where the focus goes.
  const run = async (mode: ImportMode, country: ProfileCode | null = null) => {
    if (chosen === null || busy.current) return;
    busy.current = true;
    setImporting(true);
    try {
      const { read } = chosen;
      const done: PrototypeOutcome =
        read.kind === 'backup'
          ? { ...(await actions.importBackup(read.file, mode)), report: [] }
          : await actions.importPrototype(read.json, mode, country);
      setChosen(null);
      const ended = done.kind === 'invalid' || done.kind === 'refused';
      setProblem(
        done.kind === 'invalid'
          ? { code: 'prototype-invalid' }
          : done.kind === 'refused'
            ? { ...done.refusal, pasted: chosen.name === null }
            : null,
      );
      setOutcome(ended ? null : done);
      setReport(ended ? [] : done.report);
    } catch (error) {
      reportError(error);
      setProblem({ code: 'unknown' });
    }
    // The dialog's closing moves the focus to what reports the end; outside it, the next render does, since the
    // buttons may unmount with the chosen file.
    replaced.current = confirming;
    settled.current = !confirming;
    busy.current = false;
    setImporting(false);
    setConfirming(false);
  };
  /** What reports an import's end once it has rendered: the alert when it ended in a problem, else the result line. */
  const reportLine = () => problemLine.current ?? resultLine.current;
  useEffect(() => {
    if (!settled.current) return;
    settled.current = false;
    // The line may sit under the tab bar; the browser's own focus scroll ignores the bar (docs/DESIGN.md §6).
    const line = reportLine();
    line?.focus({ preventScroll: true });
    line?.scrollIntoView({ block: 'nearest' });
  });
  const finalFocus = () => {
    const to = replaced.current ? reportLine() : true;
    replaced.current = false;
    return to;
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-stack-md">
      <h2 ref={heading} id={headingId} tabIndex={-1} className="font-semibold text-20">
        {t('heading')}
      </h2>
      {hasPlan ? (
        <>
          <p className="text-ink-2">
            {t('exportLine', { product })}{' '}
            <a href="/risk" className="text-ink underline underline-offset-4 hover:text-ink-2">
              {t('riskLink')}
            </a>
          </p>
          <div className="flex flex-wrap gap-target-gap">
            <Button variant="secondary" onClick={() => void exportFile('json')}>
              {t('exportJson')}
            </Button>
            <Button variant="secondary" onClick={() => void exportFile('csv')}>
              {t('exportCsv')}
            </Button>
          </div>
          {leftOut > 0 && (
            <p className="text-ink-2">{t('exportLeftOut', { count: leftOut, figure: figure(leftOut), product })}</p>
          )}
          {exportAlert}
          <TaxYearExport />
        </>
      ) : (
        <p className="text-ink-2">{t('noPlan')}</p>
      )}
      <DeletePlanDialog
        actions={actions}
        hasPlan={hasPlan}
        count={count}
        figure={figure}
        onExport={() => void exportFile('json')}
        exportAlert={exportAlert}
        deletedFocus={heading}
      />
      <h3 className="font-semibold text-16">{t('import.heading')}</h3>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label={t('import.choose')}
        hidden
        onChange={(event) => void onFile(event)}
      />
      <div>
        <Button variant="secondary" {...pending} onClick={() => input.current?.click()}>
          {t('import.choose')}
        </Button>
      </div>
      <PrototypePaste pending={importing} onRead={onPaste} />
      {problem !== null && (
        <p ref={problemLine} role="alert" tabIndex={-1} className="scroll-mt-result text-ink">
          {problem.code === 'unknown'
            ? tErrors('unknown', { product })
            : problem.code === 'too-large'
              ? t('import.tooLarge', { max: figure(IMPORT_MAX_BYTES / 1_000_000), product })
              : problem.code === 'newer-rows'
                ? t('import.newerRows', { product })
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
                      ? t('import.invalidEntries', { count: problem.ids.length, figure: figure(problem.ids.length) })
                      : tErrors(`backup.${problem.code}`, { product })}
        </p>
      )}
      {chosen?.read.kind === 'prototype' && (
        <PrototypeImport
          name={chosen.name}
          count={chosen.read.count}
          hasPlan={hasPlan}
          pending={importing}
          onReplace={() => setConfirming(true)}
          onImport={(mode, country) => void run(mode, country)}
        />
      )}
      {chosen?.read.kind === 'backup' && (
        <>
          <p>
            {t(chosen.name === null ? 'import.pasted' : 'import.file', {
              name: chosen.name ?? '',
              date: format.instantDate(chosen.read.file.exportedAt, clock.timeZone),
              count: figure(liveEntries(chosen.read.file.entries).length),
            })}
          </p>
          <div className="flex flex-wrap gap-target-gap">
            {hasPlan ? (
              <>
                <Button variant="destructive" {...pending} onClick={() => setConfirming(true)}>
                  {t('import.replace')}
                </Button>
                <Button variant="secondary" {...pending} onClick={() => void run('add-missing')}>
                  {t('import.addMissing')}
                </Button>
              </>
            ) : (
              <Button variant="secondary" {...pending} onClick={() => void run('replace')}>
                {t('import.importThis')}
              </Button>
            )}
          </div>
        </>
      )}
      <p ref={resultLine} tabIndex={-1} role="status" className="scroll-mt-result text-ink-2">
        {outcome !== null &&
          (outcome.kind === 'added'
            ? [
                t('import.result', { added: figure(outcome.result.added), skipped: figure(outcome.result.skipped) }),
                outcome.result.deleted > 0 ? t('import.deletedHere', { deleted: figure(outcome.result.deleted) }) : '',
                outcome.result.taken > 0 ? t('import.taken', { taken: figure(outcome.result.taken) }) : '',
              ]
                .filter((line) => line !== '')
                .join(' ')
            : t(`import.${outcome.kind}`, { count: figure(liveEntries(outcome.result.entries).length) }))}
      </p>
      <PrototypeReport notes={report} />
      {/* Close, Escape and an outside press wait for the replace, which would otherwise run with the dialog gone. */}
      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open && busy.current) return;
          setConfirming(open);
        }}
      >
        <DialogContent initialFocus={keep} finalFocus={finalFocus}>
          <DialogHeader>
            <DialogTitle>{t('confirm.title', { count, figure: figure(count) })}</DialogTitle>
            <DialogDescription>
              {t(chosen?.read.kind === 'prototype' ? 'prototype.confirmBody' : 'confirm.body')}
            </DialogDescription>
          </DialogHeader>
          {exportAlert}
          <DialogFooter>
            <DialogClose ref={keep} render={<Button variant="secondary" {...pending} />}>
              {t('confirm.cancel')}
            </DialogClose>
            <Button variant="secondary" onClick={() => void exportFile('json')}>
              {t('confirm.export')}
            </Button>
            <Button variant="destructive" {...pending} onClick={() => void run('replace')}>
              {t('confirm.replace')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
