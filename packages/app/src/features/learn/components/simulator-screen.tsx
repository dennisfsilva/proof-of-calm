import {
  type CalendarDate,
  type CoinId,
  type Percent,
  type Result,
  type SensitivityRow,
  type Simulation,
  simulate,
  startDateSensitivity,
} from '@proofofcalm/core';
import type { Dataset } from '@proofofcalm/data';
import { Button } from '@proofofcalm/ui/components/button';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters, usePlatform, useSnapshot } from '../../../lib/services';
import { type ClosesFailure, loadReferenceCloses, toPriceHistory } from '../lib/reference-closes';
import { type ClosesRange, defaultWindow } from '../lib/simulator-dates';
import type { ClosesByCoin, SimulatorInputs } from '../lib/simulator-form';
import { SimulationView } from './simulation-view';
import { SimulatorForm } from './simulator-form';

// The simulator at /learn/simulator (docs/EDUCATION.md §7), its own chunk under Learn's. Nothing links here while
// the publish switch's `display` is off (packages/data/README.md). BTC's file decides the screen: not published
// yet, failed with Reload, or the form; each coin the form adds has its file asked once, and a file that fails for
// any reason but a 404 fails the screen as BTC's does. A run shows the result under its heading until an edit.

/** The coin whose file is asked first: its answer says whether the closes are published at all. */
const FIRST_COIN = 'BTC' as CoinId;

type Loaded = Result<Dataset, ClosesFailure>;
type Shown = {
  readonly simulation: Simulation;
  readonly sensitivity: readonly SensitivityRow[];
  readonly feePercent: Percent;
  readonly closesFrom: CalendarDate;
};

export type SimulatorScreenProps = {
  /** The dataset's loader; the tests pass their own. */
  readonly load?: (coin: CoinId) => Promise<Loaded>;
};

/** The first and last day of a dataset; the loader refuses one without a day. */
function rangeOf(dataset: Dataset): ClosesRange | null {
  const [first, last] = [dataset.days[0], dataset.days.at(-1)];
  return first === undefined || last === undefined ? null : { first: first.date, last: last.date };
}

function Failed() {
  const t = useTranslations('learn.simulator');
  const shell = useTranslations('shell.screenError');
  const platform = usePlatform();
  return (
    <div className="flex flex-col items-start gap-stack-lg">
      <p className="text-16">{t('failed')}</p>
      <Button variant="secondary" onClick={() => platform.reload()}>
        {shell('reload')}
      </Button>
    </div>
  );
}

export function SimulatorScreen({ load = loadReferenceCloses }: SimulatorScreenProps) {
  const t = useTranslations('learn.simulator');
  const f = useFormatters();
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const [files, setFiles] = useState<Readonly<Record<CoinId, Loaded>>>({});
  const [chosen, setChosen] = useState<readonly CoinId[]>([]);
  const [shown, setShown] = useState<Shown | null>(null);
  const [filled, setFilled] = useState(false);
  const [runs, setRuns] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const asked = useRef(new Set<CoinId>());
  const alive = useRef(true);

  // Each coin's file once: a coin removed and added again keeps the answer it had.
  const ask = useCallback(
    (coin: CoinId) => {
      if (asked.current.has(coin)) return;
      asked.current.add(coin);
      const settle = (result: Loaded) => {
        if (alive.current) setFiles((current) => ({ ...current, [coin]: result }));
      };
      load(coin).then(settle, () => settle({ ok: false, error: { kind: 'offline' } }));
    },
    [load],
  );
  useEffect(() => {
    alive.current = true;
    ask(FIRST_COIN);
    return () => {
      alive.current = false;
    };
  }, [ask]);
  useEffect(() => {
    if (runs > 0) heading.current?.focus();
  }, [runs]);

  const first = files[FIRST_COIN];
  // Only a 404 or a dataset with no day says a coin has no closes; anything else is the network or the file.
  const broken = Object.values(files).some((result) => !result.ok && result.error.kind !== 'unpublished');
  const closes: ClosesByCoin = Object.fromEntries(
    chosen.flatMap((coin) => {
      const result = files[coin];
      if (result === undefined) return [];
      const range = result.ok ? rangeOf(result.value) : null;
      return [[coin, range ?? 'none']];
    }),
  );
  const ranges = Object.values(closes).filter((range): range is ClosesRange => range !== 'none');
  const window = defaultWindow(ranges);
  // BTC's first day only while no coin is chosen; a split with no window has no day to give.
  const dataFrom = chosen.length > 0 ? window?.first : first?.ok ? rangeOf(first.value)?.first : undefined;

  const onCoins = (ids: CoinId[]) => {
    setChosen(ids);
    for (const id of ids) ask(id);
  };
  const onRun = (input: SimulatorInputs) => {
    const coins = Object.fromEntries(
      chosen.flatMap((coin) => {
        const result = files[coin];
        return result?.ok ? [[coin, toPriceHistory(result.value)]] : [];
      }),
    );
    const full = { ...input, histories: { currency: 'EUR' as const, coins } };
    const simulation = simulate(full);
    // readForm checks what the core checks, so a refusal here is not expected; it shows no result.
    if (!simulation.ok) return setShown(null);
    setShown({
      simulation: simulation.value,
      sensitivity: startDateSensitivity(full),
      feePercent: input.feePercent ?? ('0' as Percent),
      closesFrom: window?.first ?? input.startDate,
    });
    setRuns((count) => count + 1);
  };

  const busy = first === undefined;
  const body = () => {
    if (first === undefined) {
      // The unpublished line's length, unseen, keeps the area's place while the closes are asked for.
      return (
        <p aria-hidden className="invisible text-16">
          {t('unpublished')}
        </p>
      );
    }
    if (!first.ok && first.error.kind === 'unpublished') return <p className="text-16">{t('unpublished')}</p>;
    if (broken) return <Failed />;
    return (
      <>
        <SimulatorForm
          closes={closes}
          window={window}
          plan={plan}
          onCoins={onCoins}
          onRun={onRun}
          onEdit={() => setShown(null)}
          onFill={() => setFilled(true)}
          {...(dataFrom === undefined ? {} : { startDescription: t('dataFrom', { date: f.date(dataFrom) }) })}
        />
        {shown !== null && (
          <section className="flex flex-col gap-stack-md">
            <h2 ref={heading} tabIndex={-1} className="text-20">
              {t('result.heading')}
            </h2>
            <SimulationView
              simulation={shown.simulation}
              sensitivity={shown.sensitivity}
              currency="EUR"
              closesFrom={shown.closesFrom}
              feePercent={shown.feePercent}
            />
            {filled && <p className="text-16">{t('result.portfolio')}</p>}
          </section>
        )}
      </>
    );
  };
  return (
    <>
      <h1 className="text-28">{t('title')}</h1>
      <div data-testid="simulator-result" aria-busy={busy} className="flex flex-col gap-stack-lg">
        {body()}
      </div>
    </>
  );
}
