import type { Messages } from './messages';

// Which namespaces reach a screen how (ADR-0045 §8): the hosts' entries import the static ones from
// `messages/<locale>/<namespace>.json` whole; every other namespace is a lazy screen's, loaded with
// its module by `lazyScreen`, or by `loadNamespace` for a lazy part of a static screen (the log
// namespace on /today, for the entry sheet and the one tap's toast). One explicit import per lazy
// namespace, so the bundler sees each file and the precompile plugin compiles it;
// `namespaces.test.ts` fails when a namespace has neither.

export const STATIC_NAMESPACES = ['errors', 'shell', 'today'] as const;

export type Namespace = keyof Messages;
export type StaticNamespace = (typeof STATIC_NAMESPACES)[number];
export type LazyNamespace = Exclude<Namespace, StaticNamespace>;

type NamespaceLoaders = { [N in LazyNamespace]: () => Promise<{ default: Messages[N] }> };

export const NAMESPACE_LOADERS: NamespaceLoaders = {
  learn: () => import('../../messages/en/learn.json'),
  log: () => import('../../messages/en/log.json'),
  onboarding: () => import('../../messages/en/onboarding.json'),
  plan: () => import('../../messages/en/plan.json'),
  portfolio: () => import('../../messages/en/portfolio.json'),
  settings: () => import('../../messages/en/settings.json'),
};
