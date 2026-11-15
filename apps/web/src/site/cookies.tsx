import { BRAND } from '@proofofcalm/app/lib/brand';
import { englishLang, siteTranslator, useSiteLanguage } from '../../lib/site-messages';
import { LegalPage, LegalVersion } from './legal';

// What the browser keeps and why, after what the service does not do; then how visits are counted, why there is no
// banner, and the rules that apply (docs/LEGAL.md §5).
const STORES = ['storesOffline', 'storesSettings', 'storesRecords', 'storesSync', 'storesTab'] as const;
const AFTER = ['visits', 'banner', 'references'] as const;

export function CookiesPage() {
  const language = useSiteLanguage();
  const t = siteTranslator('legal', language);
  return (
    <LegalPage slug="cookies">
      {[...STORES, ...AFTER].map((key) => (
        <p key={key} lang={englishLang(language, `legal.cookies.${key}`)}>
          {t(`cookies.${key}`, { product: BRAND.name })}
        </p>
      ))}
      <LegalVersion />
    </LegalPage>
  );
}
