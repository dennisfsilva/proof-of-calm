import { type MonthKey, NOTE_MAX_LENGTH, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Field, FieldLabel } from '@proofofcalm/ui/components/field';
import { Input } from '@proofofcalm/ui/components/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@proofofcalm/ui/components/sheet';
import { type ComponentProps, useActionState, useState } from 'react';
import { useTranslations } from 'use-intl';
import { errorMessage } from '../../../lib/errors';
import { useFormatters, useServices } from '../../../lib/services';
import { logActions } from '../actions';

// Skip a month (docs/DOMAIN.md §6; docs/CONTENT-STYLE.md §3 "Skip a month"): an optional note, then the toast
// "October 2026 skipped." whose Undo opens the month again within UNDO_WINDOW_MS.

export type SkipSheetProps = {
  readonly slot: MonthKey;
  readonly open: boolean;
  onOpenChange(open: boolean): void;
  /** Where the focus goes as the sheet closes; by default the element that had it before. */
  readonly finalFocus?: ComponentProps<typeof SheetContent>['finalFocus'];
  /** Called once the toast's Undo has opened the month again, so the screen can place the focus. */
  readonly onUndone?: (() => void) | undefined;
};

export function SkipSheet({ slot, open, onOpenChange, finalFocus, onUndone }: SkipSheetProps) {
  const t = useTranslations('log');
  const month = useFormatters().month(slot);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent closeLabel={t('form.close')} finalFocus={finalFocus}>
        <SheetHeader>
          <SheetTitle>{t('skip.title', { month })}</SheetTitle>
        </SheetHeader>
        {open && <SkipForm slot={slot} month={month} onDone={() => onOpenChange(false)} onUndone={onUndone} />}
      </SheetContent>
    </Sheet>
  );
}

/** A refused skip's line; `final` when the slot refuses every later press as well. */
type Failure = { readonly message: string; readonly final: boolean };

type SkipFormProps = {
  readonly slot: MonthKey;
  readonly month: string;
  onDone(): void;
  onUndone: (() => void) | undefined;
};

function SkipForm({ slot, month, onDone, onUndone }: SkipFormProps) {
  const t = useTranslations();
  const services = useServices();
  const [actions] = useState(() => logActions(services));
  const [note, setNote] = useState('');
  const say = (error: unknown) => {
    const message = errorMessage(error);
    return t(message.key as Parameters<typeof t>[0], message.values);
  };
  const undo = (id: Parameters<typeof actions.undoSkip>[0]) =>
    actions
      .undoSkip(id)
      .then(onUndone, () => services.toasts.add({ title: t('log.row.failed'), timeout: UNDO_WINDOW_MS }));

  // A slot that is already skipped or recorded refuses every later press too, so Skip stays inert after it
  // (DESIGN §6); the sheet only skips, so its own line names the state and nothing more.
  const [failure, submit, pending] = useActionState(async (): Promise<Failure | null> => {
    try {
      const result = await actions.skipMonthAction(slot, note);
      if (!result.ok) {
        const { code } = result.error;
        if (code === 'slot-skipped') return { message: t('log.skip.alreadySkipped', { month }), final: true };
        return { message: say({ ...result.error, slot: month }), final: code === 'slot-done' };
      }
      onDone();
      services.toasts.add({
        title: t('log.skip.done', { month }),
        timeout: UNDO_WINDOW_MS,
        actionProps: { children: t('log.row.undo'), onClick: () => void undo(result.value) },
      });
      return null;
    } catch (error) {
      return { message: say(error), final: false };
    }
  }, null);

  return (
    <form action={submit} className="flex flex-col gap-stack-md" noValidate>
      <Field>
        <FieldLabel>{t('log.skip.note')}</FieldLabel>
        <Input
          value={note}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={t('log.skip.placeholder')}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      {failure !== null && (
        <p role="alert" className="text-13 text-negative">
          {failure.message}
        </p>
      )}
      {/* Focusable while pending or inert, so a refused skip keeps the focus here while the alert speaks (DESIGN §6). */}
      <Button type="submit" disabled={pending || failure?.final === true} focusableWhenDisabled>
        {t('log.skip.title', { month })}
      </Button>
    </form>
  );
}
