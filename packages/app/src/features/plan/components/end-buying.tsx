import { decimal, liveEntries, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@proofofcalm/ui/components/dialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { type ErrorMessage, errorMessage, reportError } from '../../../lib/errors';
import { createNumberInput } from '../../../lib/format';
import { useFormatters, useServices, useSnapshot, useToday } from '../../../lib/services';
import { type EndUndo, planActions } from '../actions';

// End buying today on the Plan screen (docs/DOMAIN.md §6 "End buying today"; CONTENT-STYLE §3 "End buying"):
// while buying lasts, paused or not, the button `End buying` opens a dialog with `Keep the plan as it is` first
// and focused, and `End buying today` last (docs/DESIGN.md §8). An ended plan shows the day it ended instead. The
// end happens at once; the toast's Undo brings the last buy day back for 8 seconds, unless another tab changed
// the plan since. It is a component of its own, mounted whenever Plan shows a plan, since the Pause section
// unmounts as the end is written and a dialog inside it would never give the focus back. Focus (DESIGN §6):
// after an end, the ended line; after any other close, the button while it is there, else the ended line, else
// Plan's h1; after an Undo that restored buying, the button with its ring, however the Undo was reached, unless
// the person moved the focus meanwhile; after a refused Undo, where the focus was before the toast. While
// an end runs the dialog stays open (Escape, an outside press and `Keep the plan as it is` do nothing), so the
// end always settles into the open dialog: a refusal shows there, and an accepted end closes it once.

export function EndBuying() {
  const t = useTranslations('plan.endBuying');
  const tErrors = useTranslations('errors');
  const words = useTranslations();
  const f = useFormatters();
  const services = useServices();
  const { toasts } = services;
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const count = useSnapshot((snapshot) => liveEntries(snapshot.entries).length);
  // The count grouped as the plan's country groups it (`1,234`, `1.234`; CONTENT-STYLE §4), never ICU's `#`.
  const figures = useMemo(() => createNumberInput(f.locales.numbers), [f.locales.numbers]);
  const today = useToday();
  const [actions] = useState(() => planActions(services));
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<ErrorMessage | null>(null);
  // Counts the undos that restored buying: each one moves the focus to the button now shown.
  const [restores, setRestores] = useState(0);
  /** Set while an end runs; the ref answers a second press before the disabled button has rendered. */
  const busy = useRef(false);
  /** Set by an accepted end, so that the closing dialog sends the focus to the ended line; each press resets it. */
  const ended = useRef(false);
  const keep = useRef<HTMLButtonElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const line = useRef<HTMLParagraphElement>(null);

  /** The Undo the person pressed: the focus may still sit on it, in the closed toast, when the undo ends. */
  const pressed = useRef<Element | null>(null);

  // Only from the page's body (the ended line is gone), the line, the button or the pressed Undo: the focus
  // never leaves a place the person moved it to while the undo ran. The ring shows however the Undo was reached.
  useEffect(() => {
    if (restores === 0) return;
    const focused = document.activeElement;
    const from = [document.body, line.current, button.current, pressed.current];
    pressed.current = null;
    if (!from.includes(focused)) return;
    button.current?.focus({ preventScroll: true, focusVisible: true });
    button.current?.scrollIntoView({ block: 'nearest' });
  }, [restores]);

  if (plan === null) return null;

  // The toast leaves the focus to the Undo (`focus: 'caller'`): a restore puts it on End buying, a refusal back
  // where it was before the toast.
  const undo = (before: EndUndo, returnFocus: () => void) => {
    pressed.current = document.activeElement;
    void actions.undoEndBuying(before).then(
      (result) => {
        if (result.ok) {
          setRestores((n) => n + 1);
          return;
        }
        returnFocus();
        toasts.add({ title: t('notRestored'), timeout: UNDO_WINDOW_MS });
      },
      (error: unknown) => {
        reportError(error);
        returnFocus();
        toasts.add({ title: tErrors('unknown', { product: BRAND.name }), timeout: UNDO_WINDOW_MS });
      },
    );
  };

  const end = async () => {
    if (busy.current) return;
    busy.current = true;
    ended.current = false;
    setPending(true);
    setProblem(null);
    try {
      const result = await actions.endBuying();
      if (!result.ok) {
        setProblem(errorMessage(result.error));
        return;
      }
      ended.current = true;
      setOpen(false);
      // Another tab ended first: that tab's toast holds the Undo.
      const before = result.value;
      if (before === null) return;
      toasts.add({
        title: t('ended', { date: f.date(before.endedOn) }),
        timeout: UNDO_WINDOW_MS,
        actionProps: { children: t('undo'), focus: 'caller', onClick: (returnFocus) => undo(before, returnFocus) },
      });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const finalFocus = () => {
    const accepted = ended.current;
    ended.current = false;
    if (!accepted && button.current?.isConnected) return button.current;
    return line.current ?? document.querySelector<HTMLElement>('h1');
  };

  const buying = plan.firstBuy <= today && today <= plan.lastBuy && plan.endedBuyingOn === null;
  const withWindow = plan.sellWindow === null ? 'no' : 'yes';
  return (
    <>
      {buying && (
        <Button
          ref={button}
          variant="secondary"
          className="scroll-mt-result self-start"
          onClick={() => {
            setProblem(null);
            ended.current = false;
            setOpen(true);
          }}
        >
          {t('title')}
        </Button>
      )}
      {plan.endedBuyingOn !== null && (
        <p ref={line} tabIndex={-1} className="nums text-16 text-ink">
          {t('ended', { date: f.date(plan.endedBuyingOn) })}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // The ref, not `pending`: an Escape right after the press comes before the disabled render.
          if (!next && busy.current) return;
          setOpen(next);
        }}
      >
        <DialogContent initialFocus={keep} finalFocus={finalFocus}>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>
              {t('body', {
                date: f.date(today),
                count,
                figure: figures.format(decimal(String(count))),
                window: withWindow,
              })}
            </DialogDescription>
          </DialogHeader>
          {problem !== null && (
            <p role="alert" className="text-13 text-negative">
              {words(problem.key as Parameters<typeof words>[0], problem.values)}
            </p>
          )}
          <DialogFooter>
            {/* Both focusable while the end runs, so the focus stays where it was (docs/DESIGN.md §6). */}
            <Button
              ref={keep}
              variant="secondary"
              disabled={pending}
              focusableWhenDisabled
              onClick={() => {
                if (!busy.current) setOpen(false);
              }}
            >
              {t('keep')}
            </Button>
            <Button variant="destructive" disabled={pending} focusableWhenDisabled onClick={() => void end()}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
