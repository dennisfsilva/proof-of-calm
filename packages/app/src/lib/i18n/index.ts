export { lazyScreen, loadNamespace } from './lazy';
export { type Locales, localesFor, UI_LANGUAGES, type UiLanguage } from './locale';
export { type Messages, messages } from './messages';
export {
  type LazyNamespace,
  NAMESPACE_LOADERS,
  type Namespace,
  STATIC_NAMESPACES,
  type StaticNamespace,
} from './namespaces';
export { I18nProvider, type I18nProviderProps } from './provider';
export { createMessageRegistry, type MessageRegistry, messageRegistry } from './registry';
