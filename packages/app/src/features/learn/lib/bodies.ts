/// <reference path="../learn-modules.d.ts" />
import { LEARN_BODIES, LEARN_META, LEARN_MODULES, LEARN_TRANSLATIONS } from 'virtual:learn-modules';
import type { ContentLanguage, LearnModuleMeta } from '@proofofcalm/content';
import { type ComponentType, lazy, startTransition, use, useEffect, useState } from 'react';
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
  load: () => Promise<{ default: Body } | undefined>,
  language: ContentLanguage,
  english: ShownModule,
): Promise<ShownModule> {
  try {
    const metas = language === 'en' ? undefined : LEARN_META[language];
    const [loaded, meta] = await Promise.all([load(), metas?.()]);
    const [module, Body] = [meta?.default[english.module.slug], loaded?.default];
    if (module !== undefined && Body !== undefined) return { module, Body, language };
  } catch {
    // English stands; the mount that shows it tries again (useModuleBody).
  }
  return english;
}

/**
 * The module of `slug` in `language` (ADR-0057): its translation, whose body comes in a lazy chunk of its own and its
 * metadata in its language's (`LEARN_META`), where `language` has one, else English, which also stands while either
 * chunk fails or resolves to nothing; undefined for a slug no module has. A translation suspends under the host's
 * boundary as a body does.
 * A mount that shows English for a failed translation loads it once more and shows it if it comes, so a failure left
 * by a render that never committed reaches no later mount as a cached answer.
 * The returned `language` is that of the module shown, so the screen marks English with `lang` and nothing else.
 */
export function useModuleBody(slug: string, language: ContentLanguage): ShownModule | undefined {
  const english = ENGLISH.get(slug);
  const load = language === 'en' ? undefined : LEARN_TRANSLATIONS[language]?.[slug];
  const key = `${language}/${slug}`;
  // The retry's answer is this mount's state, so the render that reads it differs from the one that read the fallback:
  // the React Compiler caches a block on its inputs, and a module-level Map is none of them.
  const [retry, setRetry] = useState<{ readonly key: string; readonly promise: Promise<ShownModule> }>();
  let promise: Promise<ShownModule> | undefined;
  if (english !== undefined && load !== undefined) {
    if (retry?.key === key) promise = retry.promise;
    else {
      promise = kept.get(key) ?? translationOf(load, language, english);
      kept.set(key, promise);
    }
  }
  const shown = promise === undefined ? english : use(promise);
  const fellBack = shown !== undefined && shown.language !== language && load !== undefined;
  useEffect(() => {
    if (!fellBack || promise === undefined || load === undefined || english === undefined) return undefined;
    // The fallback may be one a render left that never committed, so no cleanup dropped it: load once more, keeping
    // English on screen, and drop the fallback when this mount leaves, so the next one loads afresh. A retry whose
    // effect was cleaned up (an unmount, or StrictMode's second run) neither keeps its answer nor sets it.
    let cancelled = false;
    if (!kept.has(key)) kept.set(key, promise);
    const again = translationOf(load, language, english);
    void again.then((next) => {
      if (cancelled || next.language !== language) return;
      kept.set(key, again);
      startTransition(() => setRetry({ key, promise: again }));
    });
    return () => {
      cancelled = true;
      if (kept.get(key) === promise) kept.delete(key);
    };
  }, [fellBack, promise, load, english, language, key]);
  return shown;
}

/** A module as the index lists it: its metadata and the language that metadata is in. */
export type IndexedModule = { readonly meta: LearnModuleMeta; readonly language: ContentLanguage };

const ENGLISH_INDEX: readonly IndexedModule[] = LEARN_MODULES.map((meta) => ({ meta, language: 'en' }));

/**
 * Every module in the index's order, each in `language` where it has a translation (ADR-0057) and in English
 * otherwise. English, marked as such, stands until `language`'s metadata chunk resolves, and for good if it fails.
 * The answer is this mount's state, never a module-level map read in render (the React Compiler caches on inputs).
 */
export function useModuleIndex(language: ContentLanguage): readonly IndexedModule[] {
  const [loaded, setLoaded] = useState<{ readonly language: ContentLanguage; readonly modules: IndexedModule[] }>();
  useEffect(() => {
    const load = language === 'en' ? undefined : LEARN_META[language];
    if (load === undefined) return undefined;
    // A load whose effect was cleaned up (an unmount, a language change or StrictMode's second run) sets nothing.
    let cancelled = false;
    void load().then(
      ({ default: metas }) => {
        if (cancelled) return;
        const modules = LEARN_MODULES.map((english): IndexedModule => {
          const meta = metas[english.slug];
          return meta === undefined ? { meta: english, language: 'en' } : { meta, language };
        });
        setLoaded({ language, modules });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [language]);
  return loaded?.language === language ? loaded.modules : ENGLISH_INDEX;
}
