import { compare, type Decimal, RED_DAY } from '@proofofcalm/core';
import { Banner, BannerActions, BannerContent, BannerDescription } from '@proofofcalm/ui/components/banner';
import { Button, buttonVariants } from '@proofofcalm/ui/components/button';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';
import { type RedDayModel, useFormatters } from '../../../lib/services';

// The red-day banner at Today's foot (docs/DOMAIN.md §3.11; docs/CONTENT-STYLE.md §3): one dated sentence on the
// market, the condition that fired with its figure, the seven-day fall first when both did; the way to the page
// and Dismiss. The foot records it when it first shows, so it shows on that visit only.

export type RedDayBannerProps = {
  /** The figures of the episode's last Red day. */
  readonly lastRed: NonNullable<RedDayModel['lastRed']>;
  /** The held coins the figures cover, in the portfolio's order, each with the model's name for it. */
  readonly coins: RedDayModel['held'];
  onOpen(): void;
  onDismiss(): void;
};

/** A fall as a whole percent with no sign: the sentence says it fell. */
const fall = (value: Decimal) => (value.startsWith('-') ? value.slice(1) : value) as Decimal;

export function RedDayBanner({ lastRed, coins, onOpen, onDismiss }: RedDayBannerProps) {
  const t = useTranslations('today.redDay');
  const f = useFormatters();
  const week = lastRed.sevenDay !== null && compare(lastRed.sevenDay, RED_DAY.sevenDay) <= 0;
  const figure = week && lastRed.sevenDay !== null ? lastRed.sevenDay : lastRed.fromHigh90;
  const values = {
    coins: coins.length === 1 ? 'one' : 'several',
    names: f.list(coins.map(({ name }) => name)),
    fall: f.percent(fall(figure), { decimals: 0 }),
    date: f.date(lastRed.date),
  };
  return (
    <Banner>
      <BannerContent>
        <BannerDescription>{t(week ? 'week' : 'high', values)}</BannerDescription>
      </BannerContent>
      <BannerActions>
        <Link href="/learn/fall-under-way" className={buttonVariants({ variant: 'secondary' })} onClick={onOpen}>
          {t('open')}
        </Link>
        <Button variant="ghost" onClick={onDismiss}>
          {t('dismiss')}
        </Button>
      </BannerActions>
    </Banner>
  );
}
