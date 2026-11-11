import { type CalendarDate, decimal } from '@proofofcalm/core';
import { buttonVariants } from '@proofofcalm/ui/components/button';
import { useTranslations } from 'use-intl';
import { createNumberInput } from '../../../lib/format';
import { Link } from '../../../lib/navigation';
import { useFormatters } from '../../../lib/services';
import type { CoinVenues } from '../lib/venues';

// The review page's third part (docs/DOMAIN.md §3.12; CONTENT-STYLE §3 "Annual review page (M2)"; ADR-0039): the
// units the Log shows at each venue at the end of `today`, one line per venue as the Log writes it, `With no venue`
// for units with none, at the coin's decimals; under a coin with one-tap estimates, their count. The person compares
// each line by eye with the exchange's or the wallet's own balance; a difference leads to the Log. Nothing here is
// typed, stored or written, and nothing links an exchange or a wallet.

const SECONDARY = buttonVariants({ variant: 'secondary', className: 'self-start' });

export function VenueList({ venues, today }: { readonly venues: readonly CoinVenues[]; readonly today: CalendarDate }) {
  const t = useTranslations('plan.review.where');
  const f = useFormatters();
  // A count is a figure in the country's number format (docs/CONTENT-STYLE.md §4).
  const figure = (count: number) => createNumberInput(f.locales.numbers).format(decimal(String(count)));
  const date = f.date(today);
  return (
    <section className="flex flex-col gap-stack-sm" aria-labelledby="review-where">
      <h2 id="review-where" className="font-semibold text-20">
        {t('heading')}
      </h2>
      {venues.length === 0 ? (
        <p className="text-16">{t('none', { date })}</p>
      ) : (
        <>
          <p className="text-16">{t('intro', { date })}</p>
          {/* One coin's group from the next wider than the lines inside a group (docs/DESIGN.md §6). */}
          <div className="flex flex-col gap-stack-md">
            {venues.map(({ coin, decimals, venues: places, estimated }) => (
              <div key={coin} className="flex flex-col gap-stack-xs">
                <h3 className="font-semibold text-16">{coin}</h3>
                <ul className="flex flex-col gap-stack-xs text-16">
                  {places.map((place) => (
                    <li key={place.venue ?? ''} className="flex flex-wrap gap-x-stack-md">
                      <span>{place.venue ?? t('noVenue')}</span>{' '}
                      <span className="nums ml-auto whitespace-nowrap">{f.units(place.units, coin, decimals)}</span>
                    </li>
                  ))}
                </ul>
                {estimated > 0 && (
                  <p className="text-16">{t('estimated', { count: estimated, figure: figure(estimated), coin })}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-16">{t('differs')}</p>
      <Link href="/log" className={SECONDARY}>
        {t('log')}
      </Link>
    </section>
  );
}
