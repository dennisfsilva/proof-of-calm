import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import { type LazyNamespace, NAMESPACE_LOADERS } from './namespaces';
import { messageRegistry } from './registry';

/**
 * A screen loaded on demand with its messages (ADR-0045 §8 and §9): `React.lazy` over the screen's
 * module and its namespace's file together, the namespace registered with the provider before the
 * component resolves, so the screen never renders a bare key. Declared at module level, as `lazy`
 * requires; rendered under the shell's one `Suspense`.
 */
export function lazyScreen<N extends LazyNamespace>(
  namespace: N,
  load: () => Promise<{ default: ComponentType }>,
): LazyExoticComponent<ComponentType> {
  return lazy(async () => {
    const [screen] = await Promise.all([load(), loadNamespace(namespace)]);
    return screen;
  });
}

/**
 * Loads a lazy namespace and registers it with the provider: for a lazy part of a static screen, such as
 * Today's entry sheet and its "Recorded" toast, which use the Log's messages. A provider re-renders with
 * it, so a translator taken before the load does not see it yet.
 */
export async function loadNamespace<N extends LazyNamespace>(namespace: N): Promise<void> {
  const messages = await NAMESPACE_LOADERS[namespace]();
  messageRegistry.add(namespace, messages.default);
}
