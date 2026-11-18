import { AppRoutes, AppShell } from '@proofofcalm/app/features/shell';
import { deviceLocale } from '@proofofcalm/app/lib/adapters';
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
import { registerServiceWorker, type UpdatePrompt, whenIdle } from '@proofofcalm/app/lib/pwa';
import { createBrowserServices, type Services, ServicesProvider } from '@proofofcalm/app/lib/services';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { installChunkReload } from './chunk-reload';

// The web host's entry (ADR-0045 §9 and §12): the services over the browser's adapters with the API on
// the same origin, the browser location, the static namespaces every screen needs (§8; a lazy route
// loads its own), the shell around the route table. The host adds nothing a screen could own.
// The UI language, a device preference read before the first render (ADR-0023): the stored choice, else the
// device's languages among the offered ones (the reading the country suggestion makes), derived at every boot
// and never written; a `languagechange` mid-session is ignored. `bootLanguage` loads another language's static
// namespaces first and falls back to English whole if they cannot, and the language it gives sets the
// document's lang, the registry the lazy screens load from, the formatters and the services. The build's flag,
// `__POC_LANGUAGES__`, which the factory sets from VERCEL_ENV alone, gives the offered languages: the preview
// languages on a preview deployment, English everywhere else (ADR-0023, 2026-11-18).
const LANGUAGES = listedLanguages(__POC_LANGUAGES__);

// The worker, in production builds of the web host only (ADR-0033, ADR-0045 §5 and §10); the wrapper's
// build removes this branch. The shell hands over the handler that shows the "A new version is ready"
// toast once the first screen settled; the registration then waits for the load event and the first idle
// period (a 3 s timeout at most), as the worker's install and precache would slow the screen's own work
// (ADR-0045 §5, the deviation of 2026-10-26).
const registerUpdates =
  import.meta.env.PROD && import.meta.env.VITE_SERVICE_WORKER !== 'off' && 'serviceWorker' in navigator
    ? (onUpdateReady: (update: UpdatePrompt) => () => void) => {
        const register = () => {
          void registerServiceWorker({
            container: navigator.serviceWorker,
            reload: () => window.location.reload(),
            onUpdateReady,
          });
        };
        const idle = () => whenIdle(window, register);
        if (document.readyState === 'complete') idle();
        else window.addEventListener('load', idle, { once: true });
      }
    : undefined;

function App({ boot: { language, messages }, services }: { boot: Boot; services: Services }) {
  return (
    <ServicesProvider services={services}>
      <NavigationProvider location="browser">
        <I18nProvider locale={language} messages={messages} languages={LANGUAGES}>
          <AppShell registerUpdates={registerUpdates}>
            <AppRoutes />
          </AppShell>
        </I18nProvider>
      </NavigationProvider>
    </ServicesProvider>
  );
}

const root = document.getElementById('root');
if (root === null) throw new Error('app.html has no #root element');
void bootLanguage(readLanguage(localStorageOrNull(), deviceLocale().languages, LANGUAGES)).then((boot) => {
  document.documentElement.lang = boot.language;
  messageRegistry.setLanguage(boot.language);
  const services = createBrowserServices({ apiBase: '', language: boot.language });
  createRoot(root).render(
    <StrictMode>
      <App boot={boot} services={services} />
    </StrictMode>,
  );
  void services.start();
});

installChunkReload({
  target: window,
  entryUrl: import.meta.url,
  fetch: (url, init) => fetch(url, init),
  storage: () => sessionStorage,
  reload: () => window.location.reload(),
});
