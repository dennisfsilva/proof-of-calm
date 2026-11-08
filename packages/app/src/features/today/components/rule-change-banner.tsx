import { GENERIC_COUNTRY } from '@proofofcalm/content';
import { type RuleChangeNotice, UNDO_WINDOW_MS } from '@proofofcalm/core';
import { Banner, BannerActions, BannerContent, BannerDescription } from '@proofofcalm/ui/components/banner';
import { Button, buttonVariants } from '@proofofcalm/ui/components/button';
import { useTranslations } from 'use-intl';
import { reportError } from '../../../lib/errors';
import { Link } from '../../../lib/navigation';
import { useFormatters, useServices } from '../../../lib/services';
import { todayActions } from '../actions';

// The rule-change notice at Today's foot (docs/DOMAIN.md §3.11, §3.12): the dated sentence, Review and Dismiss.
// Both record the notice, so it shows once; a write that fails is never silent: the toast says so and the
// notice stays (Review opens Plan all the same, and the notice comes back on Today).

export type RuleChangeBannerProps = {
  readonly notice: RuleChangeNotice;
  /** The country's name, for the generic sentence. */
  readonly country: string;
};

export function RuleChangeBanner({ notice, country }: RuleChangeBannerProps) {
  const t = useTranslations('today.ruleChange');
  const f = useFormatters();
  const services = useServices();
  const date = f.date(notice.changedOn);
  /**
   * Dismiss's button goes with the banner, so the card's heading takes the focus and comes into view by the
   * least scroll: read at the foot of a phone's page, the heading is above the window (docs/DESIGN.md §6).
   */
  const record = async (focus: boolean) => {
    try {
      await todayActions(services).dismissRuleChange(notice.country, notice.version);
      const heading = focus ? document.getElementById('today-action') : null;
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'nearest' });
    } catch (error) {
      reportError(error);
      services.toasts.add({ title: t('failed'), timeout: UNDO_WINDOW_MS });
    }
  };
  return (
    <Banner>
      <BannerContent>
        <BannerDescription>
          {notice.changeNotice === null
            ? t('generic', { country, date, kind: notice.country === GENERIC_COUNTRY ? 'generic' : 'country' })
            : t('notice', { date, notice: notice.changeNotice })}
        </BannerDescription>
      </BannerContent>
      <BannerActions>
        <Link href="/plan" className={buttonVariants({ variant: 'secondary' })} onClick={() => void record(false)}>
          {t('review')}
        </Link>
        <Button variant="ghost" onClick={() => void record(true)}>
          {t('dismiss')}
        </Button>
      </BannerActions>
    </Banner>
  );
}
