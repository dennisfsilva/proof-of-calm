import { siteTranslator } from '../../lib/site-messages';
import { LegalPage } from './legal';

// What the browser keeps and why, after what the service does not do (docs/LEGAL.md §5).
const STORES = ['storesOffline', 'storesSettings', 'storesRecords', 'storesSync', 'storesTab'] as const;

export function CookiesPage() {
  const t = siteTranslator('legal');
  return (
    <LegalPage slug="cookies">
      {STORES.map((key) => (
        <p key={key}>{t(`cookies.${key}`)}</p>
      ))}
    </LegalPage>
  );
}
