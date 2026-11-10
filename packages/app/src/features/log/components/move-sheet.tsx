import type { Entry } from '@proofofcalm/core';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@proofofcalm/ui/components/sheet';
import type { ComponentProps } from 'react';
import { useTranslations } from 'use-intl';
import { MoveForm } from './move-form';

export type MoveSheetProps = {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  /** The live move to edit; null for a new one. */
  readonly editing: Entry | null;
  /** Called with the saved entries, or none when the move being edited was deleted meanwhile. */
  onDone(saved: readonly Entry[]): void;
  /** Where the focus goes as the sheet closes; by default the element that had it before. */
  readonly finalFocus?: ComponentProps<typeof SheetContent>['finalFocus'];
};

/**
 * The move form in a sheet (ADR-0054, docs/CONTENT-STYLE.md §3, Log coins you moved): `Log coins you moved` for a new
 * move, `Edit the move` for a move row's Edit. The form mounts as the sheet opens, so it reads the entries of that
 * moment, and its session draft (ADR-0020) brings back what was typed when the sheet opens again before a save.
 */
export function MoveSheet({ open, onOpenChange, editing, onDone, finalFocus }: MoveSheetProps) {
  const t = useTranslations('log');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('form.close')} finalFocus={finalFocus}>
        <SheetHeader>
          <SheetTitle>{t(editing === null ? 'move.title.new' : 'move.title.edit')}</SheetTitle>
        </SheetHeader>
        {open && <MoveForm editing={editing} onDone={onDone} />}
      </SheetContent>
    </Sheet>
  );
}
