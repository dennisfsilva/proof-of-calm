import { describe, expect, it } from 'vitest';
import { messages } from './messages';
import { NAMESPACE_LOADERS, STATIC_NAMESPACES } from './namespaces';

// Every namespace of the merged file reaches a screen one way: the hosts import the static ones, a
// lazy screen loads its own (ADR-0045 §8). A feature that adds a `messages/` folder without a loader
// line fails here, before a screen shows bare keys.
describe('the message namespaces', () => {
  it('are each static or loaded by a lazy screen', () => {
    const covered = new Set<string>([...STATIC_NAMESPACES, ...Object.keys(NAMESPACE_LOADERS)]);
    expect(Object.keys(messages).filter((namespace) => !covered.has(namespace))).toEqual([]);
  });

  it('are never both', () => {
    const lazy = Object.keys(NAMESPACE_LOADERS);
    expect(STATIC_NAMESPACES.filter((namespace) => lazy.includes(namespace))).toEqual([]);
  });

  it('name a loader for every lazy route of the app', () => {
    expect(Object.keys(NAMESPACE_LOADERS).sort()).toEqual([
      'learn',
      'log',
      'onboarding',
      'plan',
      'portfolio',
      'settings',
    ]);
  });
});
