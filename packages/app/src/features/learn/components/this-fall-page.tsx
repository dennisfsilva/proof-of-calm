import type { LearnModuleMeta } from '@proofofcalm/content';
import type { Decimal, Plan } from '@proofofcalm/core';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { Link, Redirect } from '../../../lib/navigation';
import { useClock, useFormatters, useServices, useSnapshot, useToday } from '../../../lib/services';
import type { PastFall, RedDayModel } from '../../../lib/services/red-day-types';
import { MODULE_ELEMENTS } from '../lib/body-elements';
import { BACK_LINK } from './country-library';
import { WhyLink } from './why-link';

// The page a fall of the held coins opens (docs/EDUCATION.md §6, docs/CONTENT-STYLE.md §3): the figure with the
// market as its subject, the data line, the past-performance line once (docs/LEGAL.md §4), each held coin's earlier
// falls from the cycles file, the next buy day and the person's note. It reads the plan through the store and the
// figures through the red-day port, as plain models, so this lazy chunk imports no value of core or content
// (`../lazy-chunk.test.ts`). With nothing held or no fall under way it replaces itself with the module When the
// market drops, so a bookmark or the back button never shows old figures.

/** The module the figure's Why? opens, and the page's path gives when no fall is under way. */
export const FALL_MODULE = 'when-the-market-drops' satisfies LearnModuleMeta['slug'];

type Figure = NonNullable<RedDayModel['figure']>;
type Held = RedDayModel['held'];
type Falls = readonly PastFall[] | 'failed';

/** The model of the plan on today, null while it is asked; a rejection, which the port never makes, reads as failed. */
export function useFallModel(): RedDayModel | null {
  const { redDay } = useServices();
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const entries = useSnapshot((snapshot) => snapshot.entries);
  const today = useToday();
  const [model, setModel] = useState<RedDayModel | null>(null);
  useEffect(() => {
    if (plan === null) return;
    let live = true;
    // With no model there are no held coins to name, so the page shows no earlier fall either.
    const failed: RedDayModel = {
      state: 'failed',
      held: [],
      figure: null,
      episode: null,
      lastRed: null,
      nextBuy: null,
      buyDayToday: false,
    };
    redDay.model({ plan, entries, today }).then(
      (answer) => live && setModel(answer),
      () => live && setModel(failed),
    );
    return () => {
      live = false;
    };
  }, [redDay, plan, entries, today]);
  return model;
}

/** The cycles file's rows of the held coins, null while the model or they load. */
function usePastFalls(held: Held | null): Falls | null {
  const { redDay } = useServices();
  const key = held === null ? null : held.map(({ coin }) => coin).join(' ');
  const [falls, setFalls] = useState<{ key: string; falls: Falls } | null>(null);
  useEffect(() => {
    if (key === null) return;
    let live = true;
    const coins = key.split(' ').filter((coin) => coin !== '') as PastFall['coin'][];
    redDay.pastFalls(coins).then(
      (rows) => live && setFalls({ key, falls: rows }),
      () => live && setFalls({ key, falls: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [redDay, key]);
  // Rows read for other coins are never shown under these.
  return falls !== null && falls.key === key ? falls.falls : null;
}

/** The held coin's name, as the earlier falls write it. */
const nameIn = (held: Held, coin: string) => held.find((known) => known.coin === coin)?.name ?? coin;

/** A figure truncated toward zero to whole percent, without its sign, as the page writes it (docs/DOMAIN.md §3.11). */
const whole = (value: Decimal): Decimal => (value.replace(/^[-+]/, '').split('.')[0] ?? '0') as Decimal;

function FigureLine({ figure, held }: { figure: Figure; held: Held }) {
  const t = useTranslations('learn.thisFall');
  const f = useFormatters();
  const seven = figure.sevenDay === null ? ('0' as Decimal) : whole(figure.sevenDay);
  const change = seven === '0' ? 'none' : figure.sevenDay?.startsWith('-') ? 'fell' : 'rose';
  const values = {
    high: f.percent(whole(figure.fromHigh90), { decimals: 0 }),
    window: figure.shortWindow ? 'short' : 'full',
    since: f.date(figure.first),
    change,
    seven: f.percent(seven, { decimals: 0 }),
    date: f.date(figure.last),
  };
  const [only] = figure.coins;
  return (
    <>
      <p className="text-18">
        {figure.coins.length === 1 && only !== undefined
          ? t('one', { ...values, coin: nameIn(held, only) })
          : t('several', { ...values, coins: f.list(figure.coins.map((coin) => nameIn(held, coin))) })}{' '}
        <WhyLink module={FALL_MODULE} name={t('why')} />
      </p>
      {figure.missing.map((coin) => (
        <p key={coin} className="text-16">
          {t('missing', { coin: nameIn(held, coin), product: BRAND.name })}
        </p>
      ))}
      <p className="nums text-14 text-ink-2">
        {t('data', { currency: figure.currency, first: f.date(figure.first), last: f.date(figure.last) })}
      </p>
    </>
  );
}

function EarlierFalls({ held, falls }: { held: Held; falls: Falls }) {
  const t = useTranslations('learn.thisFall');
  const f = useFormatters();
  if (falls === 'failed') return <p className="text-16">{t('fallsFailed')}</p>;
  return held.map((coin) => {
    const rows = falls.filter((row) => row.coin === coin.coin).sort((a, b) => a.high.localeCompare(b.high));
    if (rows.length === 0) {
      return (
        <p key={coin.coin} className="text-16">
          {t('noFalls', { coin: coin.name, product: BRAND.name })}
        </p>
      );
    }
    return (
      <section key={coin.coin} className="flex flex-col gap-stack-xs">
        <p className="text-16">{t('fallsOf', { coin: coin.name })}</p>
        <ul className="flex list-disc flex-col gap-stack-xs ps-inset-lg">
          {rows.map((row) => (
            <li key={row.high} className="nums text-16">
              {t('fall', {
                fall: f.percent(`-${row.fall}` as Decimal, { decimals: 0 }),
                high: f.date(row.high),
                low: f.date(row.low),
                publisher: row.publisher,
              })}
            </li>
          ))}
        </ul>
      </section>
    );
  });
}

export type ThisFallViewProps = { plan: Plan; model: RedDayModel | null; falls: Falls | null };

/** The page in a state the route did not replace: an episode, a failed read, or the model still pending. */
export function ThisFallView({ plan, model, falls }: ThisFallViewProps) {
  const t = useTranslations('learn.thisFall');
  const f = useFormatters();
  const { timeZone } = useClock();
  const figure = model?.figure ?? null;
  const held = model?.held ?? [];
  // The past-performance line sits under historic data only (docs/LEGAL.md §4): the figure, else an earlier fall.
  const pastRow = Array.isArray(falls) && falls.some((row) => held.some(({ coin }) => coin === row.coin));
  const disclosure = (
    <p className="text-16">
      <MODULE_ELEMENTS.PastPerformance />
    </p>
  );
  return (
    <>
      <Link href="~/today" className={BACK_LINK}>
        {t('back')}
      </Link>
      <h1 className="text-28">{t('title')}</h1>
      {model === null ? (
        // The failure line's length, unseen, keeps the figure's place while the model is asked.
        <div aria-busy className="flex flex-col gap-stack-sm">
          <p aria-hidden className="invisible text-18">
            {t('failed')}
          </p>
        </div>
      ) : figure === null ? (
        <p className="text-18">{t('failed')}</p>
      ) : (
        <div className="flex flex-col gap-stack-sm">
          <FigureLine figure={figure} held={held} />
        </div>
      )}
      {figure === null ? null : disclosure}
      {falls === null ? null : <EarlierFalls held={held} falls={falls} />}
      {figure === null && pastRow ? disclosure : null}
      {model?.nextBuy == null ? null : (
        <p className="text-16">{t(model.buyDayToday ? 'buyDayToday' : 'nextBuy', { date: f.date(model.nextBuy) })}</p>
      )}
      {plan.why.trim() === '' ? null : (
        <section className="flex flex-col gap-stack-xs">
          <h2 className="text-20">{t('note')}</h2>
          <p className="text-16">{t('noteLine', { date: f.instantDate(plan.createdAt, timeZone), why: plan.why })}</p>
        </section>
      )}
    </>
  );
}

/**
 * `/learn/fall-under-way`: the page, or the module When the market drops in its place without a plan, with nothing
 * held, no history of the held coins to read or no fall under way.
 */
export function ThisFallPage() {
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const model = useFallModel();
  const falls = usePastFalls(model?.held ?? null);
  if (plan === null || model?.state === 'nothing-held' || model?.state === 'no-history' || model?.state === 'clear') {
    return <Redirect to={`~/learn/${FALL_MODULE}`} replace />;
  }
  return <ThisFallView plan={plan} model={model} falls={falls} />;
}
