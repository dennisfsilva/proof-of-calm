import type { CoinId, Result } from '@proofofcalm/core';
import type { Dataset } from '@proofofcalm/data';
import { Button } from '@proofofcalm/ui/components/button';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useFormatters, usePlatform } from '../../../lib/services';
import { type ClosesFailure, loadReferenceCloses } from '../lib/reference-closes';

// The simulator at /learn/simulator (docs/EDUCATION.md §7), its own chunk under Learn's. Nothing links here while
// the publish switch's `display` is off (packages/data/README.md); the inputs and the result come later.

/** The coin whose dataset the screen reads until the inputs choose the split. */
const FIRST_COIN = 'BTC' as CoinId;

type Loaded = Result<Dataset, ClosesFailure>;
type State = { readonly state: 'loading' } | { readonly state: 'loaded'; readonly result: Loaded };

export type SimulatorScreenProps = {
  /** The dataset's loader; the tests pass their own. */
  readonly load?: (coin: CoinId) => Promise<Loaded>;
};

function DataState({ result }: { readonly result: Loaded }) {
  const t = useTranslations('learn.simulator');
  const shell = useTranslations('shell.screenError');
  const f = useFormatters();
  const platform = usePlatform();
  if (result.ok) {
    // The loader refuses a dataset without a day, so the first one is there.
    const first = result.value.days[0]?.date;
    return (
      <>
        {first !== undefined && <p className="text-16">{t('dataFrom', { date: f.date(first) })}</p>}
        <p className="text-14 text-ink-2">{t('credit')}</p>
      </>
    );
  }
  if (result.error.kind === 'unpublished') return <p className="text-16">{t('unpublished')}</p>;
  return (
    <>
      <p className="text-16">{t('failed')}</p>
      <Button variant="secondary" className="self-start" onClick={() => platform.reload()}>
        {shell('reload')}
      </Button>
    </>
  );
}

export function SimulatorScreen({ load = loadReferenceCloses }: SimulatorScreenProps) {
  const t = useTranslations('learn.simulator');
  const [shown, setShown] = useState<State>({ state: 'loading' });
  useEffect(() => {
    let current = true;
    const settle = (result: Loaded) => {
      if (current) setShown({ state: 'loaded', result });
    };
    load(FIRST_COIN).then(settle, () => settle({ ok: false, error: { kind: 'offline' } }));
    return () => {
      current = false;
    };
  }, [load]);
  const busy = shown.state === 'loading';
  return (
    <>
      <h1 className="text-28">{t('title')}</h1>
      <div data-testid="simulator-result" aria-busy={busy} className="flex flex-col gap-stack-sm">
        {busy ? (
          // The unpublished line's length, unseen, keeps the area's place while the closes are asked for.
          <p aria-hidden className="invisible text-16">
            {t('unpublished')}
          </p>
        ) : (
          <DataState result={shown.result} />
        )}
      </div>
    </>
  );
}
