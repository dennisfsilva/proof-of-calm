import type { UiLanguage } from './locale';
import type { Messages } from './messages';

// Which namespaces reach a screen how (ADR-0045 §8): the hosts' entries import English's static ones from
// `messages/en/<namespace>.json` whole, and load another language's with `loadStaticNamespaces`; every
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
  learn: () => import('../../messages/en/learn.json'),
  log: () => import('../../messages/en/log.json'),
  onboarding: () => import('../../messages/en/onboarding.json'),
  plan: () => import('../../messages/en/plan.json'),
  portfolio: () => import('../../messages/en/portfolio.json'),
  settings: () => import('../../messages/en/settings.json'),
};

const PORTUGUESE: NamespaceLoaders = {
  learn: () => import('../../messages/pt-PT/learn.json'),
  log: () => import('../../messages/pt-PT/log.json'),
  onboarding: () => import('../../messages/pt-PT/onboarding.json'),
  plan: () => import('../../messages/pt-PT/plan.json'),
  portfolio: () => import('../../messages/pt-PT/portfolio.json'),
  settings: () => import('../../messages/pt-PT/settings.json'),
};

/** German reads English's files until the merge writes its own. */
export const NAMESPACE_LOADERS: Record<UiLanguage, NamespaceLoaders> = {
  en: ENGLISH,
  'pt-PT': PORTUGUESE,
  de: ENGLISH,
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
      import('../../messages/en/errors.json'),
      import('../../messages/en/shell.json'),
      import('../../messages/en/today.json'),
    ]);
    return { errors: errors.default, shell: shell.default, today: today.default };
  },
};

/** The static namespaces of a language other than English, which stays a static import of the entries. */
export function loadStaticNamespaces(language: Exclude<UiLanguage, 'en'>): Promise<StaticMessages> {
  return STATIC_LOADERS[language]();
}
