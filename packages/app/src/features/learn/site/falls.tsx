import { useId } from 'react';
import { useTranslations } from 'use-intl';
import { BRAND } from '../../../lib/brand';
import type { PastFall } from '../../../lib/services/red-day-types';
import { fallPercent, fallsSpan } from '../components/module-chart';
import { useSiteFormatters } from './static';

// The Risk page's dated falls (docs/LEGAL.md §5, its volatility and drawdowns with dated ranges): the cycles file's
// rows as a visible table, then §4's line for falls computed from intraday prices with the past-performance sentence.
// The page is the Risk disclosure, so the line carries no link to it. The fall, the key figure, comes right after the
// coin (docs/DESIGN.md §8), so the narrowest screen at 125 % text reads it before the table scrolls.

const HEAD = 'px-2 py-2 font-medium text-13 text-ink-2';
const CELL = 'px-2 py-2 text-ink';

export type SiteFallsProps = { falls: readonly PastFall[] };

/** One row per fall in the order passed; nothing with no rows, since a source line would date nothing. */
export function SiteFalls({ falls }: SiteFallsProps) {
  const t = useTranslations('learn');
  const f = useSiteFormatters();
  const caption = useId();
  if (falls.length === 0) return null;
  const { publishers, first, last } = fallsSpan(falls, f);
  const coins = f.list([...new Set(falls.map(({ coin }) => coin))]);
  // The page runs no React on the client, so unlike the UI kit's Table the wrapper cannot wait to measure that it
  // scrolls: it is always a region named by the caption that takes a tab stop (WCAG 2.1.1, axe's
  // scrollable-region-focusable), padded and pulled out by the focus ring's extent so its overflow never clips the ring.
  const region = { tabIndex: 0, role: 'region', 'aria-labelledby': caption };
  return (
    <>
      <div
        className="relative -m-[calc(var(--focus-offset)+var(--focus-width))] overflow-x-auto p-[calc(var(--focus-offset)+var(--focus-width))]"
        {...region}
      >
        <table className="w-full border-collapse text-14">
          <caption id={caption} className="pb-2 text-left text-13 text-ink-2">
            {t('chart.label', { coins, first, last })}
          </caption>
          <thead>
            <tr className="border-line-2 border-b">
              <th scope="col" className={`${HEAD} text-left`}>
                {t('chart.columns.coin')}
              </th>
              <th scope="col" className={`${HEAD} text-right`}>
                {t('chart.columns.fall')}
              </th>
              <th scope="col" className={`${HEAD} text-left`}>
                {t('chart.columns.high')}
              </th>
              <th scope="col" className={`${HEAD} text-left`}>
                {t('chart.columns.low')}
              </th>
            </tr>
          </thead>
          <tbody>
            {falls.map((row) => (
              <tr key={`${row.coin}-${row.high}`} className="border-line border-b">
                <th scope="row" className={`${CELL} text-left font-normal`}>
                  {row.coin}
                </th>
                <td className={`${CELL} nums text-right`}>{fallPercent(f, row.fall)}</td>
                <td className={CELL}>{f.date(row.high)}</td>
                <td className={CELL}>{f.date(row.low)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-16">
        {t('chart.source', { publishers, first, last, product: BRAND.name })} {t('module.pastPerformance')}
      </p>
    </>
  );
}
