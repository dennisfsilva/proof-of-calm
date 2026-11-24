import enErrors from '../../messages/en/errors.json';
import enShell from '../../messages/en/shell.json';
import enToday from '../../messages/en/today.json';
import type { UiLanguage } from './locale';
import type { Messages } from './messages';

// Which namespaces reach a screen how (ADR-0045 §8): the hosts' entries boot with `bootLanguage`, which
// imports English's static ones from `messages/en/<namespace>.json` whole and loads another language's; every
// other namespace is a lazy screen's, loaded with its module by `lazyScreen`, or by `loadNamespace` for a
// lazy part of a static screen (the log namespace on /today, for the entry sheet and the one tap's
// toast), from the files of the registry's language. One explicit import per lazy namespace and
// language, so the bundler sees each file and the precompile plugin compiles it; `namespaces.test.ts`
// fails when a namespace has neither.

export const STATIC_NAMESPACES = ['errors', 'shell', 'today'] as const;

export type Namespace = keyof Messages;
export type StaticNamespace = (typeof STATIC_NAMESPACES)[number];
export type LazyNamespace = Exclude<Namespace, StaticNamespace>;

export type NamespaceLoaders = { [N in LazyNamespace]: () => Promise<{ default: Messages[N] }> };

const ENGLISH: NamespaceLoaders = {
  countries: () => import('../../messages/en/countries.json'),
  learn: () => import('../../messages/en/learn.json'),
  log: () => import('../../messages/en/log.json'),
  onboarding: () => import('../../messages/en/onboarding.json'),
  plan: () => import('../../messages/en/plan.json'),
  portfolio: () => import('../../messages/en/portfolio.json'),
  settings: () => import('../../messages/en/settings.json'),
};

const PORTUGUESE: NamespaceLoaders = {
  countries: () => import('../../messages/pt-PT/countries.json'),
  learn: () => import('../../messages/pt-PT/learn.json'),
  log: () => import('../../messages/pt-PT/log.json'),
  onboarding: () => import('../../messages/pt-PT/onboarding.json'),
  plan: () => import('../../messages/pt-PT/plan.json'),
  portfolio: () => import('../../messages/pt-PT/portfolio.json'),
  settings: () => import('../../messages/pt-PT/settings.json'),
};

const GERMAN: NamespaceLoaders = {
  countries: () => import('../../messages/de/countries.json'),
  learn: () => import('../../messages/de/learn.json'),
  log: () => import('../../messages/de/log.json'),
  onboarding: () => import('../../messages/de/onboarding.json'),
  plan: () => import('../../messages/de/plan.json'),
  portfolio: () => import('../../messages/de/portfolio.json'),
  settings: () => import('../../messages/de/settings.json'),
};

export const NAMESPACE_LOADERS: Record<UiLanguage, NamespaceLoaders> = {
  en: ENGLISH,
  'pt-PT': PORTUGUESE,
  de: GERMAN,
};

type StaticMessages = Pick<Messages, StaticNamespace>;

const STATIC_LOADERS: Record<Exclude<UiLanguage, 'en'>, () => Promise<StaticMessages>> = {
  'pt-PT': async () => {
    const [errors, shell, today] = await Promise.all([
      import('../../messages/pt-PT/errors.json'),
      import('../../messages/pt-PT/shell.json'),
      import('../../messages/pt-PT/today.json'),
    ]);
    return { errors: errors.default, shell: shell.default, today: today.default };
  },
  de: async () => {
    const [errors, shell, today] = await Promise.all([
      import('../../messages/de/errors.json'),
      import('../../messages/de/shell.json'),
      import('../../messages/de/today.json'),
    ]);
    return { errors: errors.default, shell: shell.default, today: today.default };
  },
};

/** The static namespaces of a language other than English, whose are a static import here. */
export function loadStaticNamespaces(language: Exclude<UiLanguage, 'en'>): Promise<StaticMessages> {
  return STATIC_LOADERS[language]();
}

/** The language the shell boots in and its static messages. */
export type Boot = { readonly language: UiLanguage; readonly messages: StaticMessages };

const ENGLISH_STATIC: StaticMessages = { errors: enErrors, shell: enShell, today: enToday };

/**
 * The language the shell boots in, with its static messages (ADR-0023): the stored language with its files,
 * or English with English's when the stored one is English or its files cannot load. The hosts give this
 * language to the document, the registry, the formatters and the services alike, so a failed load renders
 * English whole, never English copy in another language's formats.
 */
export async function bootLanguage(
  stored: UiLanguage,
  load: typeof loadStaticNamespaces = loadStaticNamespaces,
): Promise<Boot> {
  if (stored === 'en') return { language: 'en', messages: ENGLISH_STATIC };
  try {
    return { language: stored, messages: await load(stored) };
  } catch {
    return { language: 'en', messages: ENGLISH_STATIC };
  }
}
