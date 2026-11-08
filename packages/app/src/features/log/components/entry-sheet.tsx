import {
  type CalendarDate,
  type Entry,
  type EntryKind,
  focusSlot,
  heldUnits,
  isOpen,
  isPositive,
  type MonthKey,
  type Plan,
  slotStatuses,
} from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { SegmentedControl } from '@proofofcalm/ui/components/segmented-control';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@proofofcalm/ui/components/sheet';
import { type ComponentProps, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters, useSnapshot, useToday } from '../../../lib/services';
import { EntryForm, type EntryFormProps } from './entry-form';
import { SkipSheet } from './skip-sheet';

export type EntrySheetProps = EntryFormProps & {
  readonly open: boolean;
  /**
   * Offers the choice of kinds for a new transaction (docs/CONTENT-STYLE.md §3, Record on the Log): the kind opened on,
   * then an extra buy, then a sale while any coin is held. Set only by the Log's Record a purchase.
   */
  readonly offerKinds?: boolean;
  onOpenChange(open: boolean): void;
  /** Where the focus goes as the sheet closes; by default the element that had it before. */
  readonly finalFocus?: ComponentProps<typeof SheetContent>['finalFocus'];
  /** Passed to the skip sheet: called once its toast's Undo has opened the month again, to place the focus. */
  onUndone?(): void;
};

/**
 * The entry form in a sheet; the form mounts as the sheet opens, so it reads the prices of that moment. A new
 * monthly buy for an open month also offers "Skip <month>", which swaps this sheet for the skip sheet: closing
 * for that swap returns no focus, so the skip sheet's initial focus and its trap hold. A new transaction offers the
 * choice of kinds when the host opts in (the Log's Record a purchase, never Today's buy buttons) and more than one
 * kind is left to offer: a choice remounts only the form with its kind, so the focus stays on the pressed option,
 * and each kind keeps its own session draft, so switching back shows what was typed. Each opening starts on the kind
 * it opened on, and keeps the choice it offered.
 */
export function EntrySheet({ open, onOpenChange, finalFocus, onUndone, offerKinds = false, ...form }: EntrySheetProps) {
  const t = useTranslations('log');
  const f = useFormatters();
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const today = useToday();
  // The month being skipped, kept as the skip is written: the month is no longer open as its sheet closes.
  const [skipping, setSkipping] = useState<{ readonly slot: MonthKey; readonly open: boolean } | null>(null);
  const [chosen, setChosen] = useState<EntryKind | null>(null);
  // Whether coins are held is read once per opening (CONTENT-STYLE §3, Record a sale): a sale being typed stays
  // a sale when another tab sells the last units, and the save then names what is held.
  const held = plan !== null && holds(plan, entries);
  const [heldAtOpen, setHeldAtOpen] = useState(held);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChosen(null);
      setHeldAtOpen(held);
    }
  }
  const kinds = offerKinds && form.editing.length === 0 && plan !== null ? kindsFor(form.kind, heldAtOpen) : [];
  const kind = chosen !== null && kinds.includes(chosen) ? chosen : form.kind;
  const current: EntryFormProps = { ...form, kind };
  const title = form.editing.length > 0 ? t('form.title.edit') : t(`form.title.${kind}`);
  const slot = open ? skippable(plan, entries, today, current) : null;
  const skip = (month: MonthKey) => {
    setSkipping({ slot: month, open: true });
    onOpenChange(false);
  };
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent closeLabel={t('form.close')} finalFocus={skipping?.open === true ? false : finalFocus}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {open && kinds.length > 1 && (
            <SegmentedControl
              aria-label={t('form.kind.label')}
              stretch
              options={kinds.map((each) => ({ value: each, label: t(`kind.${each}`) }))}
              value={kind}
              onValueChange={setChosen}
            />
          )}
          {open && <EntryForm key={kind} {...current} />}
          {open && slot !== null && (
            <Button variant="secondary" onClick={() => skip(slot)}>
              {t('skip.title', { month: f.month(slot) })}
            </Button>
          )}
        </SheetContent>
      </Sheet>
      {skipping !== null && (
        <SkipSheet
          slot={skipping.slot}
          open={skipping.open}
          onOpenChange={(next) => setSkipping({ slot: skipping.slot, open: next })}
          finalFocus={finalFocus}
          onUndone={onUndone}
        />
      )}
    </>
  );
}

/** Whether any of the plan's or the entries' coins has units held, so a sale has something to sell. */
function holds(plan: Plan, entries: readonly Entry[]) {
  const coins = new Set([...plan.coins.map((coin) => coin.id), ...entries.map((entry) => entry.coin)]);
  return [...coins].some((coin) => isPositive(heldUnits(entries, coin)));
}

/** The kinds a new transaction opened on `opened` offers, in order: the opened kind, an extra buy, a sale while held. */
function kindsFor(opened: EntryKind, held: boolean): readonly EntryKind[] {
  if (opened === 'sell') return [];
  const buys: readonly EntryKind[] = opened === 'extra' ? ['extra'] : [opened, 'extra'];
  return held ? [...buys, 'sell'] : buys;
}

/** The month a new monthly buy is for (the form's, else the focus slot) while it is still open; else null. */
function skippable(plan: Plan | null, entries: readonly Entry[], today: CalendarDate, form: EntryFormProps) {
  if (plan === null || form.kind !== 'dca' || form.editing.length > 0) return null;
  const statuses = slotStatuses(plan, entries, today);
  const slot = form.slot ?? focusSlot(statuses, today)?.key;
  const status = statuses.find((candidate) => candidate.key === slot);
  return status !== undefined && isOpen(status.status) ? status.key : null;
}
