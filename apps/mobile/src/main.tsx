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
// The UI language, a device preference read before the first render (ADR-0023): the document's lang, the
// formatters, and the files the lazy screens load. English's static namespaces are imported; another
// language's load before the first render, and English renders if they cannot.
const language = readLanguage(localStorageOrNull());
document.documentElement.lang = language;
messageRegistry.setLanguage(language);
const services = createBrowserServices({ apiBase: import.meta.env.VITE_API_BASE, language });

function App({ messages }: { messages: Pick<Messages, StaticNamespace> }) {
  return (
    <ServicesProvider services={services}>
      <NavigationProvider location="hash">
        <I18nProvider locale={language} messages={messages}>
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
