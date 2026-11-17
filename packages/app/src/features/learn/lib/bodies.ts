/// <reference path="../learn-modules.d.ts" />
import { LEARN_BODIES, LEARN_MODULES, LEARN_TRANSLATIONS } from 'virtual:learn-modules';
import type { ContentLanguage, LearnModuleMeta } from '@proofofcalm/content';
import { type ComponentType, lazy, startTransition, use, useEffect, useReducer } from 'react';
import type { BodyElements } from './body-elements';

type Body = ComponentType<{ components: BodyElements }>;

/** A module as a screen shows it: its metadata, its body and the language both are in. */
export type ShownModule = { readonly module: LearnModuleMeta; readonly Body: Body; readonly language: ContentLanguage };

const ENGLISH = new Map(
  LEARN_MODULES.flatMap((module): [string, ShownModule][] => {
    const load = LEARN_BODIES[module.slug];
    return load === undefined ? [] : [[module.slug, { module, Body: lazy(load), language: 'en' }]];
  }),
);

/** One load per language and slug, kept so a render that suspends finds the same promise when it renders again. */
const kept = new Map<string, Promise<ShownModule>>();

async function translationOf(
  load: () => Promise<{ meta: LearnModuleMeta; default: Body } | undefined>,
  language: ContentLanguage,
  english: ShownModule,
): Promise<ShownModule> {
  try {
    const loaded = await load();
    const [module, Body] = [loaded?.meta, loaded?.default];
    if (module !== undefined && Body !== undefined) return { module, Body, language };
  } catch {
    // English stands; the mount that shows it tries again (useModuleBody).
  }
  return english;
}

/**
 * The module of `slug` in `language` (ADR-0057): its translation, whose metadata and body come in one lazy chunk,
 * where `language` has one, else English, which also stands while a translation's chunk fails or resolves to
 * nothing; undefined for a slug no module has. A translation suspends under the host's boundary as a body does.
 * A mount that shows English for a failed translation loads it once more and shows it if it comes, so a failure left
 * by a render that never committed reaches no later mount as a cached answer.
 * The returned `language` is that of the module shown, so the screen marks English with `lang` and nothing else.
 */
export function useModuleBody(slug: string, language: ContentLanguage): ShownModule | undefined {
  const english = ENGLISH.get(slug);
  const load = language === 'en' ? undefined : LEARN_TRANSLATIONS[language]?.[slug];
  const key = `${language}/${slug}`;
  let promise: Promise<ShownModule> | undefined;
  if (english !== undefined && load !== undefined) {
    promise = kept.get(key) ?? translationOf(load, language, english);
    kept.set(key, promise);
  }
  const shown = promise === undefined ? english : use(promise);
  const [, retried] = useReducer((count: number) => count + 1, 0);
  const fellBack = shown !== undefined && shown.language !== language && load !== undefined;
  useEffect(() => {
    if (!fellBack || promise === undefined || load === undefined || english === undefined) return undefined;
    // The fallback may be one a render left that never committed, so no cleanup dropped it: load once more, keeping
    // English on screen, and drop the fallback when this mount leaves, so the next one loads afresh.
    if (!kept.has(key)) kept.set(key, promise);
    const again = translationOf(load, language, english);
    void again.then((next) => {
      if (next.language !== language) return;
      kept.set(key, again);
      startTransition(retried);
    });
    return () => {
      if (kept.get(key) === promise) kept.delete(key);
    };
  }, [fellBack, promise, load, english, language, key]);
  return shown;
}
