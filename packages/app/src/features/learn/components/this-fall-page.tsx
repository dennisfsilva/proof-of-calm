import type { Coin, Decimal, Plan } from '@proofofcalm/core';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import { Link, Redirect } from '../../../lib/navigation';
import { useClock, useFormatters, useServices, useSnapshot, useToday } from '../../../lib/services';
import type { PastFall, RedDayModel } from '../../../lib/services/red-day-types';
import { MODULE_ELEMENTS } from '../lib/body-elements';
import { BACK_LINK } from './country-library';

// The page a fall of the held coins opens (docs/EDUCATION.md §6, docs/CONTENT-STYLE.md §3): the figure with the
// market as its subject, the data line, the past-performance line once (docs/LEGAL.md §4), each held coin's earlier
// falls from the cycles file, the next buy day and the person's note. It reads the plan through the store and the
// figures through the red-day port, as plain models, so this lazy chunk imports no value of core or content
// (`../lazy-chunk.test.ts`). With nothing held or no fall under way it replaces itself with Learn's index, so a
// bookmark or the back button never shows old figures.

type Figure = NonNullable<RedDayModel['figure']>;
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
    const failed: RedDayModel = {
      state: 'failed',
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

/** The cycles file's rows of the plan's coins, null while they load. */
function usePastFalls(coins: readonly Coin[]): Falls | null {
  const { redDay } = useServices();
  const key = coins.map((coin) => coin.id).join(' ');
  const [falls, setFalls] = useState<Falls | null>(null);
  useEffect(() => {
    let live = true;
    redDay.pastFalls(key.split(' ') as PastFall['coin'][]).then(
      (rows) => live && setFalls(rows),
      () => live && setFalls('failed'),
    );
    return () => {
      live = false;
    };
  }, [redDay, key]);
  return falls;
}

/** A figure truncated toward zero to whole percent, without its sign, as the page writes it (docs/DOMAIN.md §3.11). */
const whole = (value: Decimal): Decimal => (value.replace(/^[-+]/, '').split('.')[0] ?? '0') as Decimal;

function FigureLine({ figure, plan }: { figure: Figure; plan: Plan }) {
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
  const name = plan.coins.find((coin) => coin.id === only)?.name ?? only;
  return (
    <>
      <p className="text-18">
        {figure.coins.length === 1 && name !== undefined
          ? t('one', { ...values, coin: name })
          : t('several', { ...values, coins: f.list(figure.coins) })}
      </p>
      {figure.missing.map((coin) => (
        <p key={coin} className="text-16">
          {t('missing', { coin, product: BRAND.name })}
        </p>
      ))}
      <p className="nums text-14 text-ink-2">
        {t('data', { currency: figure.currency, first: f.date(figure.first), last: f.date(figure.last) })}
      </p>
    </>
  );
}

function EarlierFalls({ coins, falls }: { coins: readonly Coin[]; falls: Falls }) {
  const t = useTranslations('learn.thisFall');
  const f = useFormatters();
  if (falls === 'failed') return <p className="text-16">{t('fallsFailed')}</p>;
  return coins.map((coin) => {
    const rows = falls.filter((row) => row.coin === coin.id).sort((a, b) => a.high.localeCompare(b.high));
    if (rows.length === 0) {
      return (
        <p key={coin.id} className="text-16">
          {t('noFalls', { coin: coin.id, product: BRAND.name })}
        </p>
      );
    }
    return (
      <section key={coin.id} className="flex flex-col gap-stack-xs">
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
  const failed = model?.state === 'failed';
  // Held coins in the plan's order: the figure's when it names them, the plan's while it is pending or failed.
  const held =
    figure === null
      ? plan.coins
      : plan.coins.filter((coin) => figure.coins.includes(coin.id) || figure.missing.includes(coin.id));
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
          <FigureLine figure={figure} plan={plan} />
        </div>
      )}
      {failed ? null : disclosure}
      {falls === null ? null : <EarlierFalls coins={held} falls={falls} />}
      {failed ? disclosure : null}
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

/** `/learn/this-fall`: the page, or Learn's index in its place without a plan, with nothing held or no fall under way. */
export function ThisFallPage() {
  const plan = useSnapshot((snapshot) => snapshot.plan);
  const model = useFallModel();
  const falls = usePastFalls(plan?.coins ?? []);
  if (plan === null || model?.state === 'nothing-held' || model?.state === 'clear') {
    return <Redirect to="~/learn" replace />;
  }
  return <ThisFallView plan={plan} model={model} falls={falls} />;
}
