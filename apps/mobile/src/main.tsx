import { AppRoutes, AppShell } from '@proofofcalm/app/features/shell';
import { I18nProvider } from '@proofofcalm/app/lib/i18n';
import { NavigationProvider } from '@proofofcalm/app/lib/navigation';
import { createBrowserServices, ServicesProvider } from '@proofofcalm/app/lib/services';
import errors from '@proofofcalm/app/messages/en/errors.json';
import shell from '@proofofcalm/app/messages/en/shell.json';
import today from '@proofofcalm/app/messages/en/today.json';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';

// The wrapper host's entry (ADR-0045 §10): the same services, shell and route table as the web host
// behind the hash of the one document, so the wrapper's file server never resolves a deep path. No
// service worker (the factory defines VITE_SERVICE_WORKER off, and the shell gets no `registerUpdates`)
// and the API at the absolute origin the factory defines as VITE_API_BASE.
const services = createBrowserServices({ apiBase: import.meta.env.VITE_API_BASE });

function App() {
  return (
    <ServicesProvider services={services}>
      <NavigationProvider location="hash">
        <I18nProvider messages={{ errors, shell, today }}>
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
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
void services.start();
