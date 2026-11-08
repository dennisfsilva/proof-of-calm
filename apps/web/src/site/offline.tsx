import { siteTranslator } from '../../lib/site-messages';
import { SiteMain } from './layout';

// The page the service worker serves to a navigation it cannot answer offline (ADR-0033).
export function OfflinePage() {
  const t = siteTranslator('offline');
  return (
    <SiteMain>
      <h1 className="text-28">{t('title')}</h1>
      <p>{t('body')}</p>
    </SiteMain>
  );
}
