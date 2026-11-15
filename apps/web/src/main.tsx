import { AppRoutes, AppShell } from '@proofofcalm/app/features/shell';
import {
  I18nProvider,
  loadStaticNamespaces,
  localStorageOrNull,
  type Messages,
  messageRegistry,
  readLanguage,
  type StaticNamespace,
} from '@proofofcalm/app/lib/i18n';
import { NavigationProvider } from '@proofofcalm/app/lib/navigation';
import { registerServiceWorker, type UpdatePrompt, whenIdle } from '@proofofcalm/app/lib/pwa';
import { createBrowserServices, ServicesProvider } from '@proofofcalm/app/lib/services';
import errors from '@proofofcalm/app/messages/en/errors.json';
import shell from '@proofofcalm/app/messages/en/shell.json';
import today from '@proofofcalm/app/messages/en/today.json';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import { installChunkReload } from './chunk-reload';

// The web host's entry (ADR-0045 §9 and §12): the services over the browser's adapters with the API on
// the same origin, the browser location, the static namespaces every screen needs (§8; a lazy route
// loads its own), the shell around the route table. The host adds nothing a screen could own.
// The UI language, a device preference read before the first render (ADR-0023): the document's lang, the
// formatters, and the files the lazy screens load. English's static namespaces are imported; another
// language's load before the first render, and English renders if they cannot.
const language = readLanguage(localStorageOrNull());
document.documentElement.lang = language;
messageRegistry.setLanguage(language);
const services = createBrowserServices({ apiBase: '', language });

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

function App({ messages }: { messages: Pick<Messages, StaticNamespace> }) {
  return (
    <ServicesProvider services={services}>
      <NavigationProvider location="browser">
        <I18nProvider locale={language} messages={messages}>
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
const mount = root;

function render(messages: Pick<Messages, StaticNamespace>) {
  createRoot(mount).render(
    <StrictMode>
      <App messages={messages} />
    </StrictMode>,
  );
  void services.start();
}

const english = { errors, shell, today };
if (language === 'en') render(english);
else
  void loadStaticNamespaces(language).then(render, () => {
    document.documentElement.lang = 'en';
    messageRegistry.setLanguage('en');
    render(english);
  });

installChunkReload({
  target: window,
  entryUrl: import.meta.url,
  fetch: (url, init) => fetch(url, init),
  storage: () => sessionStorage,
  reload: () => window.location.reload(),
});
