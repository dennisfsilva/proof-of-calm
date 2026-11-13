import { type ExchangeFile, type Plan, planExchangeImport, VENUE_MAX_LENGTH } from '@proofofcalm/core';
import { Button } from '@proofofcalm/ui/components/button';
import { Checkbox } from '@proofofcalm/ui/components/checkbox';
import { Field, FieldError, FieldLabel } from '@proofofcalm/ui/components/field';
import { Input } from '@proofofcalm/ui/components/input';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { reportError } from '../../../lib/errors';
import { useClock, useServices, useSnapshot, useToday } from '../../../lib/services';
import { type ExchangeImportOutcome, exchangeImportActions } from '../exchange-actions';
import { defaultVenue, previewModel } from '../model/exchange-preview';
import { exchangeContext } from '../model/import';
import { ExchangeSections, ExchangeSummary, useFigure, useWords } from './exchange-import-sections';
import type { ExchangeRefusal } from './exchange-problem';

// Settings → Import an exchange's file (docs/DOMAIN.md §3.13, CONTENT-STYLE §3): the preview of what the file adds,
// computed from the Log as this tab shows it with the venue and the held answer chosen here, then one write. Its
// heading takes the focus when it shows. A write refused because the plan, the Log or today's date changed keeps the
// preview open on them as stored (the write shows the stored snapshot), with the alert focused and the venue and the
// answer kept; every other end goes to `onDone`, whose section words it.

/** How the import ended: null is Cancel, `failed` an error it did not expect. */
export type ExchangeDone =
  | Extract<ExchangeImportOutcome, { readonly kind: 'imported' }>
  | { readonly kind: 'refused'; readonly refusal: ExchangeRefusal }
  | { readonly kind: 'failed' };

/** The result line of an import that wrote: what it added and replaced, then the rows it counted as not added. */
export function useExchangeResult(): (done: Extract<ExchangeDone, { readonly kind: 'imported' }>) => string {
  const t = useTranslations('settings.data.exchange');
  const figure = useFigure();
  return (done) =>
    [
      t('result', { added: figure(done.added) }),
      done.replaced > 0 ? t('resultReplaced', { replaced: figure(done.replaced) }) : '',
      done.imported > 0 ? t('counted.imported', { count: figure(done.imported) }) : '',
      done.deleted > 0 ? t('counted.deleted', { count: figure(done.deleted) }) : '',
    ]
      .filter((line) => line !== '')
      .join(' ');
}

type Props = {
  readonly file: ExchangeFile;
  /** The file's name; null for a pasted text. */
  readonly name: string | null;
  readonly onDone: (done: ExchangeDone | null) => void;
  /** Told while the write runs, so the section's other import buttons wait for it. */
  readonly onBusy?: (busy: boolean) => void;
};

/** The preview needs a plan; the section opens none without one (the needs-plan alert). */
export function ExchangeImport(props: Props) {
  const plan = useSnapshot((snapshot) => snapshot.plan);
  return plan === null ? null : <Preview {...props} plan={plan} />;
}

function Preview({ file, name, onDone, onBusy, plan }: Props & { readonly plan: Plan }) {
  const t = useTranslations('settings.data.exchange');
  const tErrors = useTranslations('errors.action');
  const services = useServices();
  const clock = useClock();
  const today = useToday();
  const w = useWords(plan);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const [venue, setVenue] = useState(() => defaultVenue(entries, 'Kraken'));
  const [addHeld, setAddHeld] = useState(false);
  const [changed, setChanged] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [importing, setImporting] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const headingId = useId();
  const trimmed = venue.trim() === '' ? null : venue.trim();

  const { shown, model } = useMemo(() => {
    const context = exchangeContext(today, clock.now(), clock.timeZone);
    const planOn = (held: boolean) =>
      planExchangeImport(file, { plan, entries }, { venue: trimmed, addHeld: held }, context);
    const shown = planOn(addHeld);
    // The held line counts the estimates ticking would replace, from the plan the same snapshot gives ticked.
    return { shown, model: previewModel(shown, shown.held === null || addHeld ? shown : planOn(true)) };
  }, [file, plan, entries, trimmed, addHeld, today, clock]);

  // The heading takes the focus when the preview shows, and the alert when the write was refused (docs/DESIGN.md §6).
  useEffect(() => {
    const to = changed ? alert.current : heading.current;
    to?.focus({ preventScroll: true });
    to?.scrollIntoView({ block: 'nearest' });
  }, [changed]);

  const run = async () => {
    if (busy.current) return;
    if (trimmed !== null && trimmed.length > VENUE_MAX_LENGTH) return setTooLong(true);
    busy.current = true;
    setImporting(true);
    onBusy?.(true);
    setChanged(false);
    let done: ExchangeDone | null = null;
    try {
      const outcome = await exchangeImportActions(services).importFile(file, shown, { venue: trimmed, addHeld });
      if (outcome.kind === 'imported') done = outcome;
      else if (outcome.refusal.code === 'changed') setChanged(true);
      else done = { kind: 'refused', refusal: outcome.refusal };
    } catch (error) {
      reportError(error);
      done = { kind: 'failed' };
    }
    busy.current = false;
    setImporting(false);
    onBusy?.(false);
    if (done !== null) onDone(done);
  };

  const { summary, held } = model;
  const dated = file.first !== null && file.last !== null;
  const pending = { disabled: importing, focusableWhenDisabled: true };
  const heldLine =
    held &&
    [
      ...held.coins.map((coin) =>
        t('held', {
          ...w.counted(coin.purchases),
          coin: coin.coin,
          units: w.units(coin.coin, coin.units, [coin.heldUnits]),
          heldUnits: w.units(coin.coin, coin.heldUnits, [coin.units]),
          heldDate: w.format.date(coin.heldDate),
          hasVenue: coin.heldVenue === null ? 'no' : 'yes',
          venue: coin.heldVenue ?? '',
        }),
      ),
      t('heldAnswer'),
      held.replaces > 0 ? t('heldReplaces', w.counted(held.replaces)) : '',
    ]
      .filter((line) => line !== '')
      .join(' ');

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-stack-md">
      <h4 ref={heading} id={headingId} tabIndex={-1} className="scroll-mt-result font-semibold text-16">
        {t('heading')}
      </h4>
      {changed && (
        <p ref={alert} role="alert" tabIndex={-1} className="scroll-mt-result text-ink">
          {t('problem.changed')}
        </p>
      )}
      <p>
        {t('file', {
          pasted: name === null ? 'yes' : 'no',
          name: name ?? '',
          ...w.counted(file.rows),
          dated: dated ? 'yes' : 'no',
          first: dated ? w.format.instantDate(file.first, clock.timeZone) : '',
          last: dated ? w.format.instantDate(file.last, clock.timeZone) : '',
        })}
      </p>
      <p className="text-ink-2">{t('zone', { zone: clock.timeZone })}</p>
      <Field invalid={tooLong}>
        <FieldLabel>{t('venue')}</FieldLabel>
        <Input
          value={venue}
          onChange={(event) => {
            setVenue(event.target.value);
            setTooLong(false);
          }}
        />
        {tooLong && <FieldError>{tErrors('venue-too-long', { max: VENUE_MAX_LENGTH })}</FieldError>}
      </Field>
      <ExchangeSummary model={model} plan={plan} />
      {heldLine && (
        <div className="flex flex-col gap-stack-xs">
          <p>{heldLine}</p>
          <label className="flex items-start gap-1 text-16 text-ink">
            <Checkbox checked={addHeld} onCheckedChange={(checked) => setAddHeld(checked)} />
            <span className="py-3">{t('addHeld')}</span>
          </label>
          <p className="text-ink-2">{t('addHeldHint')}</p>
        </div>
      )}
      <ExchangeSections model={model} plan={plan} />
      <div className="flex flex-wrap gap-target-gap">
        {summary.entries > 0 && (
          <Button {...pending} onClick={() => void run()}>
            {t('import', w.counted(summary.entries))}
          </Button>
        )}
        <Button variant="secondary" {...pending} onClick={() => onDone(null)}>
          {t('cancel')}
        </Button>
      </div>
    </section>
  );
}
