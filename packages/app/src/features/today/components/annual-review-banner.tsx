import { Banner, BannerActions, BannerContent, BannerDescription } from '@proofofcalm/ui/components/banner';
import { Button, buttonVariants } from '@proofofcalm/ui/components/button';
import { useTranslations } from 'use-intl';
import { Link } from '../../../lib/navigation';
import { type ReviewSince, useFormatters } from '../../../lib/services';

// The annual review at Today's foot (docs/DOMAIN.md §3.11, §3.12; docs/CONTENT-STYLE.md §3): the day the plan was set
// up or last reviewed, whichever is later, then the question; the way to the review page and Later. No wording says a
// year has passed: the day says it.

export type AnnualReviewBannerProps = {
  /** The later of the plan's creation day and the last review's day (reviewSince). */
  readonly since: ReviewSince;
  /** Records `Later`; the foot moves the focus once the banner has gone. */
  onLater(): void;
};

export function AnnualReviewBanner({ since, onLater }: AnnualReviewBannerProps) {
  const t = useTranslations('today.review');
  const f = useFormatters();
  return (
    <Banner>
      <BannerContent>
        <BannerDescription>
          {t(since.kind, { date: f.date(since.on) })} {t('question')}
        </BannerDescription>
      </BannerContent>
      <BannerActions>
        <Link href="/plan/review" className={buttonVariants({ variant: 'secondary' })}>
          {t('open')}
        </Link>
        <Button variant="ghost" onClick={onLater}>
          {t('later')}
        </Button>
      </BannerActions>
    </Banner>
  );
}
