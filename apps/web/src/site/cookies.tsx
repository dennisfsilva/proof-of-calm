import { BRAND } from '@proofofcalm/app/lib/brand';
import { englishLang, siteTranslator, useSiteLanguage } from '../../lib/site-messages';
import { LegalLink, LegalPage, LegalVersion } from './legal';

// Why there is no banner, right after what the service does not do; then what the browser keeps and why, how visits
// are counted with a link to the Privacy notice, and the rules that apply (docs/LEGAL.md §5).
const STORES = ['storesOffline', 'storesSettings', 'storesRecords', 'storesSync', 'storesTab'] as const;

export function CookiesPage() {
  const language = useSiteLanguage();
  const t = siteTranslator('legal', language);
  const paragraph = (key: 'banner' | (typeof STORES)[number] | 'visits' | 'references') => (
    <p key={key} lang={englishLang(language, `legal.cookies.${key}`)}>
      {t(`cookies.${key}`, { product: BRAND.name })}
    </p>
  );
  return (
    <LegalPage slug="cookies">
      {paragraph('banner')}
      {STORES.map(paragraph)}
      {paragraph('visits')}
      <LegalLink slug="privacy" />
      {paragraph('references')}
      <LegalVersion />
    </LegalPage>
  );
}
