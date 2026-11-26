import { type CurrencyCode, decimal, type KeptCurrencyQuestion } from '@proofofcalm/core';
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
import { type ComponentProps, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { createNumberInput } from '../../../lib/format';
import { useFormatters } from '../../../lib/services';

// An import with no plan over entries kept in another currency (ADR-0053 Readings, 2026-11-26; docs/CONTENT-STYLE.md
// §3 "Import with no plan"): it asks before the file's plan shows them in its currency. The choice has two outcomes,
// the kept entries shown in the file's currency or nothing written; nothing is converted. It takes the replace
// dialog's focus handling: "Do not import" takes the focus when it opens, and closing it gives the focus back to the
// button that asked; "Import in {file}" is the destructive one (docs/DESIGN.md §8) and the dialog stays open until the
// write lands, where `finalFocus` takes the focus to what reports the end.

type Props = {
  /** The question the screen showed when the import was asked for; the dialog is open while it is not null. */
  readonly question: KeptCurrencyQuestion | null;
  /** The file's plan's currency, the one the kept entries would show in. */
  readonly file: CurrencyCode;
  /** Set while the import writes: the buttons stay focusable and a press does nothing. */
  readonly pending: boolean;
  /** Where the focus goes once it closes, as the replace dialog's: the report after an import, else back. */
  readonly finalFocus: ComponentProps<typeof DialogContent>['finalFocus'];
  onImport(): void;
  /** "Do not import", Escape or an outside press; the section refuses it while the import writes. */
  onCancel(): void;
};

export function KeptImportDialog({ question, file, pending, finalFocus, onImport, onCancel }: Props) {
  const t = useTranslations('settings.data.kept');
  const format = useFormatters();
  const figures = useMemo(() => createNumberInput(format.locales.numbers), [format.locales.numbers]);
  const cancel = useRef<HTMLButtonElement>(null);
  // The words stay while the dialog closes, after the section has cleared the question.
  const [shown, setShown] = useState({ question, file });
  if (question !== null && (question !== shown.question || file !== shown.file)) setShown({ question, file });
  const words = shown.question;
  const busy = { disabled: pending, focusableWhenDisabled: true };
  return (
    <Dialog open={question !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent initialFocus={cancel} finalFocus={finalFocus}>
        {words !== null && (
          <DialogHeader>
            <DialogTitle>
              {t('title', {
                count: words.count,
                figure: figures.format(decimal(String(words.count))),
                file: shown.file,
              })}
            </DialogTitle>
            <DialogDescription>
              {words.kept === null
                ? t('unknown', { count: words.count, file: shown.file })
                : t('known', { count: words.count, file: shown.file, kept: words.kept })}
            </DialogDescription>
          </DialogHeader>
        )}
        <DialogFooter>
          <DialogClose ref={cancel} render={<Button variant="secondary" {...busy} />}>
            {t('cancel')}
          </DialogClose>
          <Button variant="destructive" {...busy} onClick={onImport}>
            {t('import', { file: shown.file })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
