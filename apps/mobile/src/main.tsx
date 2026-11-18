import { AppRoutes, AppShell } from '@proofofcalm/app/features/shell';
import {
  type Boot,
  bootLanguage,
  I18nProvider,
  listedLanguages,
  localStorageOrNull,
  messageRegistry,
  readLanguage,
} from '@proofofcalm/app/lib/i18n';
import { NavigationProvider } from '@proofofcalm/app/lib/navigation';
import { createBrowserServices, type Services, ServicesProvider } from '@proofofcalm/app/lib/services';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';

// The wrapper host's entry (ADR-0045 §10): the same services, shell and route table as the web host
// behind the hash of the one document, so the wrapper's file server never resolves a deep path. No
// service worker (the factory defines VITE_SERVICE_WORKER off, and the shell gets no `registerUpdates`)
// and the API at the absolute origin the factory defines as VITE_API_BASE.
// The UI language as the web host boots it (ADR-0023; apps/web/src/main.tsx says how); the factory's flag is
// `visible` on this host, so Settings offers English alone.
const LANGUAGES = listedLanguages(__POC_LANGUAGES__);

function App({ boot: { language, messages }, services }: { boot: Boot; services: Services }) {
  return (
    <ServicesProvider services={services}>
      <NavigationProvider location="hash">
        <I18nProvider locale={language} messages={messages} languages={LANGUAGES}>
          <AppShell>
            <AppRoutes />
          </AppShell>
        </I18nProvider>
      </NavigationProvider>
    </ServicesProvider>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root element');
void bootLanguage(readLanguage(localStorageOrNull())).then((boot) => {
  document.documentElement.lang = boot.language;
  messageRegistry.setLanguage(boot.language);
  const services = createBrowserServices({ apiBase: import.meta.env.VITE_API_BASE, language: boot.language });
  createRoot(root).render(
    <StrictMode>
      <App boot={boot} services={services} />
    </StrictMode>,
  );
  void services.start();
});
