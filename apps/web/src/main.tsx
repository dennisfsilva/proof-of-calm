import { AppRoutes, AppShell } from '@proofofcalm/app/features/shell';
import { I18nProvider } from '@proofofcalm/app/lib/i18n';
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
const services = createBrowserServices({ apiBase: '' });

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

function App() {
  return (
    <ServicesProvider services={services}>
      <NavigationProvider location="browser">
        <I18nProvider messages={{ errors, shell, today }}>
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
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
void services.start();

installChunkReload({
  target: window,
  entryUrl: import.meta.url,
  fetch: (url, init) => fetch(url, init),
  storage: () => sessionStorage,
  reload: () => window.location.reload(),
});
