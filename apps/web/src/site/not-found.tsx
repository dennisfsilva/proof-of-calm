import { siteTranslator } from '../../lib/site-messages';
import { SiteMain } from './layout';

// The 404 page (ADR-0045 §1): an unknown path is a site page with the footer, never the app shell.
export function NotFoundPage() {
  const t = siteTranslator('notFound');
  return (
    <SiteMain>
      <h1 className="text-28">{t('title')}</h1>
      <p>{t('body')}</p>
    </SiteMain>
  );
}
