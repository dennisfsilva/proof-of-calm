import { BRAND } from '@proofofcalm/app/lib/brand';
import { siteTranslator } from '../../lib/site-messages';
import { SiteMain } from './layout';

// The noindex holding page that replaces the hosting scaffold at the domain until launch (docs/ROADMAP.md M0).
export function HomePage() {
  const t = siteTranslator('holding');
  return (
    <SiteMain>
      <h1 className="text-28">{BRAND.wordmark}</h1>
      <p>{t('body')}</p>
    </SiteMain>
  );
}
