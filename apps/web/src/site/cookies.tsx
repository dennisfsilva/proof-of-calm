import { englishLang, siteTranslator, useSiteLanguage } from '../../lib/site-messages';
import { LegalPage } from './legal';

// What the browser keeps and why, after what the service does not do (docs/LEGAL.md §5).
const STORES = ['storesOffline', 'storesSettings', 'storesRecords', 'storesSync', 'storesTab'] as const;

export function CookiesPage() {
  const language = useSiteLanguage();
  const t = siteTranslator('legal', language);
  return (
    <LegalPage slug="cookies">
      {STORES.map((key) => (
        <p key={key} lang={englishLang(language, `legal.cookies.${key}`)}>
          {t(`cookies.${key}`)}
        </p>
      ))}
    </LegalPage>
  );
}
