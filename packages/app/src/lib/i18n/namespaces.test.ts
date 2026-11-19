import { describe, expect, it, vi } from 'vitest';
import enErrors from '../../messages/en/errors.json';
import enShell from '../../messages/en/shell.json';
import enToday from '../../messages/en/today.json';
import errors from '../../messages/pt-PT/errors.json';
import shell from '../../messages/pt-PT/shell.json';
import today from '../../messages/pt-PT/today.json';
import { UI_LANGUAGES } from './locale';
import { messages } from './messages';
import { bootLanguage, loadStaticNamespaces, NAMESPACE_LOADERS, STATIC_NAMESPACES } from './namespaces';

// German's files hold English's text until its translation lands, so each stands in here for a marker that names
// its own path: a loader that reads English's file instead fails below.
vi.mock('../../messages/de/errors.json', () => ({ default: { from: 'de/errors' } }));
vi.mock('../../messages/de/shell.json', () => ({ default: { from: 'de/shell' } }));
vi.mock('../../messages/de/today.json', () => ({ default: { from: 'de/today' } }));
vi.mock('../../messages/de/learn.json', () => ({ default: { from: 'de/learn' } }));
vi.mock('../../messages/de/log.json', () => ({ default: { from: 'de/log' } }));
vi.mock('../../messages/de/onboarding.json', () => ({ default: { from: 'de/onboarding' } }));
vi.mock('../../messages/de/plan.json', () => ({ default: { from: 'de/plan' } }));
vi.mock('../../messages/de/portfolio.json', () => ({ default: { from: 'de/portfolio' } }));
vi.mock('../../messages/de/settings.json', () => ({ default: { from: 'de/settings' } }));

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

  it("give German loaders of its own, each reading German's file of its namespace", async () => {
    expect(NAMESPACE_LOADERS.de).not.toBe(NAMESPACE_LOADERS.en);
    for (const [namespace, load] of Object.entries(NAMESPACE_LOADERS.de))
      expect((await load()).default).toEqual({ from: `de/${namespace}` });
  });

  it('load the static namespaces of a language other than English from its files', async () => {
    expect(await loadStaticNamespaces('pt-PT')).toEqual({ errors, shell, today });
    expect(await loadStaticNamespaces('de')).toEqual({
      errors: { from: 'de/errors' },
      shell: { from: 'de/shell' },
      today: { from: 'de/today' },
    });
  });
});

// The hosts boot in what this decides, so the document, the registry, the formatters and the services all
// get the language that rendered: a stored language whose files cannot load boots in English, whole.
describe('bootLanguage', () => {
  const english = { errors: enErrors, shell: enShell, today: enToday };

  it('boots English with its imported messages and loads nothing', async () => {
    const load = vi.fn(loadStaticNamespaces);
    expect(await bootLanguage('en', load)).toEqual({ language: 'en', messages: english });
    expect(load).not.toHaveBeenCalled();
  });

  it('boots the stored language with the messages its load gives', async () => {
    const load = vi.fn(loadStaticNamespaces);
    expect(await bootLanguage('pt-PT', load)).toEqual({ language: 'pt-PT', messages: { errors, shell, today } });
    expect(load).toHaveBeenCalledWith('pt-PT');
  });

  it("boots English with English's messages when the stored language's load rejects", async () => {
    const load = vi.fn(() => Promise.reject(new Error('chunk failed')));
    expect(await bootLanguage('pt-PT', load)).toEqual({ language: 'en', messages: english });
  });
});
