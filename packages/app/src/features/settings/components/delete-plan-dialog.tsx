import { UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@proofofcalm/ui/components/dialog';
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { reportError } from '../../../lib/errors';
import type { WipedRows } from '../../../lib/ports';
import { useServices } from '../../../lib/services';
import type { DataActions } from '../actions';

// "Delete everything" (docs/DOMAIN.md §3.13, docs/CONTENT-STYLE.md "Delete the plan"): a control below the
// export line and buttons opens the dialog with the count, "Export a copy first" (the JSON backup, the copy an
// import reads back) and the destructive button last (docs/DESIGN.md §8). The export line is not repeated
// here: the control sits right below it, so it shows once per path (docs/LEGAL.md §4), as in the replace
// dialog. The safe button takes the focus when it opens, never the destructive one. The delete happens at
// once; the toast's Undo puts the rows back for 8 seconds (ADR-0019 Readings), unless another tab started or
// imported a plan since. After the delete the focus goes to `deletedFocus`, the section's heading, since the
// control that opened the dialog is gone; after an Undo that put the rows back, to Delete everything with its
// ring, and after a refused one, back where it was before the toast. While the delete runs, an Escape or Keep does nothing: its end closes
// the dialog, or its failure speaks inside it.

export type DeletePlanDialogProps = {
  readonly actions: Pick<DataActions, 'deleteEverything' | 'undoDelete'>;
  /** Whether there is a plan to delete; without one only the closing dialog stays. */
  readonly hasPlan: boolean;
  /** The live entries, for the title. */
  readonly count: number;
  /** Writes a count as a figure in the plan's number locale (docs/CONTENT-STYLE.md §4). */
  readonly figure: (value: number) => string;
  /** Saves the JSON backup, as "Export a copy first" does in the import's replace dialog. */
  readonly onExport: () => void;
  /** The export's failure line, shown here too since the dialog hides the section. */
  readonly exportAlert: ReactNode;
  readonly deletedFocus: RefObject<HTMLElement | null>;
};

export function DeletePlanDialog({
  actions,
  hasPlan,
  count,
  figure,
  onExport,
  exportAlert,
  deletedFocus,
}: DeletePlanDialogProps) {
  const t = useTranslations('settings');
  const tErrors = useTranslations('errors');
  const { toasts } = useServices();
  const keep = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Set by an accepted delete, so that the closing dialog sends the focus to the heading; each press resets it. */
  const deleted = useRef(false);
  /** Set while a delete runs; the ref answers a second press before the disabled button has rendered. */
  const busy = useRef(false);
  const [deleting, setDeleting] = useState(false);
  /** The count the title keeps from the delete on, while the dialog closes over an empty plan. */
  const [frozen, setFrozen] = useState<number | null>(null);
  const product = BRAND.name;

  const control = useRef<HTMLButtonElement>(null);
  /** Counts the undos that restored the plan: each one moves the focus to Delete everything once it shows. */
  const [restores, setRestores] = useState(0);
  /** Where the focus was as the Undo ran (the heading, or the pressed Undo in the closed toast); null once used. */
  const undoneFrom = useRef<Element | null>(null);

  // Only from the page's body, the heading or the pressed Undo: the focus never leaves a place the person moved
  // it to while the undo ran. The ring shows however the Undo was reached (docs/DESIGN.md §6).
  useEffect(() => {
    if (restores === 0 || !hasPlan || control.current === null || undoneFrom.current === null) return;
    const from = [document.body, deletedFocus.current, undoneFrom.current];
    undoneFrom.current = null;
    if (!from.includes(document.activeElement)) return;
    control.current.focus({ preventScroll: true, focusVisible: true });
    control.current.scrollIntoView({ block: 'nearest' });
  }, [restores, hasPlan, deletedFocus]);

  // The toast leaves the focus to the Undo (`focus: 'caller'`): a restore puts it on Delete everything, a
  // refusal back where it was before the toast.
  const undo = (rows: WipedRows, returnFocus: () => void) => {
    const from = document.activeElement;
    void actions.undoDelete(rows).then(
      (restored) => {
        if (restored) {
          undoneFrom.current = from;
          setRestores((n) => n + 1);
          return;
        }
        returnFocus();
        toasts.add({ title: t('delete.undoRefused'), timeout: UNDO_WINDOW_MS });
      },
      (error: unknown) => {
        reportError(error);
        returnFocus();
        toasts.add({ title: tErrors('unknown', { product }), timeout: UNDO_WINDOW_MS });
      },
    );
  };

  // One delete at a time: a second press while one runs does nothing, so the toast's Undo is the first's.
  const remove = async () => {
    if (busy.current) return;
    busy.current = true;
    deleted.current = false;
    setDeleting(true);
    let rows: WipedRows | null;
    setFrozen(count);
    try {
      rows = await actions.deleteEverything();
    } catch (error) {
      reportError(error);
      setFrozen(null);
      setFailed(true);
      return;
    } finally {
      busy.current = false;
      setDeleting(false);
    }
    deleted.current = true;
    setOpen(false);
    // Nothing was left to delete (another tab's delete came first): that tab's toast holds the undo.
    if (rows === null) return;
    toasts.add({
      title: t('delete.deleted'),
      timeout: UNDO_WINDOW_MS,
      actionProps: { children: t('delete.undo'), focus: 'caller', onClick: (returnFocus) => undo(rows, returnFocus) },
    });
  };

  const finalFocus = () => {
    const to = deleted.current ? deletedFocus.current : true;
    deleted.current = false;
    return to;
  };

  return (
    <>
      {hasPlan && (
        <div>
          <Button
            ref={control}
            variant="destructive"
            className="scroll-mt-result"
            onClick={() => {
              setFailed(false);
              setFrozen(null);
              setOpen(true);
            }}
          >
            {t('delete.open')}
          </Button>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // The ref, not `deleting`: an Escape right after the press comes before the disabled render.
          if (!next && busy.current) return;
          setOpen(next);
        }}
      >
        <DialogContent initialFocus={keep} finalFocus={finalFocus}>
          <DialogHeader>
            <DialogTitle>{t('delete.title', { count: frozen ?? count, figure: figure(frozen ?? count) })}</DialogTitle>
            <DialogDescription>{t('delete.body', { count: frozen ?? count })}</DialogDescription>
          </DialogHeader>
          {exportAlert}
          {failed && (
            <p role="alert" className="text-ink">
              {tErrors('unknown', { product })}
            </p>
          )}
          <DialogFooter>
            {/* Keep and Delete stay focusable while the delete runs, so the focus stays put (docs/DESIGN.md §6). */}
            <Button
              ref={keep}
              variant="secondary"
              disabled={deleting}
              focusableWhenDisabled
              onClick={() => {
                if (!busy.current) setOpen(false);
              }}
            >
              {t('delete.cancel')}
            </Button>
            <Button variant="secondary" onClick={onExport}>
              {t('delete.export')}
            </Button>
            <Button variant="destructive" disabled={deleting} focusableWhenDisabled onClick={() => void remove()}>
              {t('delete.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
