import { describe, expect, it } from 'vitest';
import errors from '../../messages/pt-PT/errors.json';
import shell from '../../messages/pt-PT/shell.json';
import today from '../../messages/pt-PT/today.json';
import { UI_LANGUAGES } from './locale';
import { messages } from './messages';
import { loadStaticNamespaces, NAMESPACE_LOADERS, STATIC_NAMESPACES } from './namespaces';

// Every namespace of the merged file reaches a screen one way: the hosts import the static ones, a
// lazy screen loads its own (ADR-0045 §8). A feature that adds a `messages/` folder without a loader
// line fails here, before a screen shows bare keys.
describe('the message namespaces', () => {
  it('are each static or loaded by a lazy screen', () => {
    const covered = new Set<string>([...STATIC_NAMESPACES, ...Object.keys(NAMESPACE_LOADERS.en)]);
    expect(Object.keys(messages).filter((namespace) => !covered.has(namespace))).toEqual([]);
  });

  it('are never both', () => {
    const lazy = Object.keys(NAMESPACE_LOADERS.en);
    expect(STATIC_NAMESPACES.filter((namespace) => lazy.includes(namespace))).toEqual([]);
  });

  it('name a loader for every lazy route of the app, in every UI language', () => {
    expect(Object.keys(NAMESPACE_LOADERS).sort()).toEqual([...UI_LANGUAGES].sort());
    for (const language of UI_LANGUAGES)
      expect(Object.keys(NAMESPACE_LOADERS[language]).sort()).toEqual([
        'learn',
        'log',
        'onboarding',
        'plan',
        'portfolio',
        'settings',
      ]);
  });

  it("give German English's loaders until its files exist", () => {
    expect(NAMESPACE_LOADERS.de).toBe(NAMESPACE_LOADERS.en);
  });

  it('load the static namespaces of a language other than English from its files', async () => {
    expect(await loadStaticNamespaces('pt-PT')).toEqual({ errors, shell, today });
    expect(Object.keys(await loadStaticNamespaces('de')).sort()).toEqual([...STATIC_NAMESPACES]);
  });
});
