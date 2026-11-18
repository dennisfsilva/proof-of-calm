import { createContext, useContext } from 'react';
import { createTranslator } from 'use-intl/core';
import messages from '../messages/en.json';
import portuguese from '../messages/pt-PT.json';

// The site pages' messages: English, and pt-PT for the pages that are not public (ADR-0045, the Deviations of
// 2026-11-18). pt-PT leaves the four legal pages' own objects in English, so a key it lacks falls back to English and
// the page marks that text `lang="en"` (docs/CONTENT-STYLE.md §9).

export type SiteLanguage = 'en' | 'pt-PT';

type Messages = typeof messages;
type Node = Record<string, unknown>;
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);

/** English with the translation over it, key by key; a leaf can be a string or the build's precompiled form. */
function over(base: Node, translated: Node): Node {
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => {
      const own = translated[key];
      if (own === undefined) return [key, value];
      return [key, isNode(value) && isNode(own) ? over(value, own) : own];
    }),
  );
}

const CATALOGUES: Record<SiteLanguage, Messages> = {
  en: messages,
  'pt-PT': over(messages, portuguese) as Messages,
};

export function siteTranslator<N extends keyof Messages>(namespace: N, language: SiteLanguage = 'en') {
  return createTranslator({ locale: language, messages: CATALOGUES[language], namespace });
}

/** `lang="en"` for a key the language leaves in English, so a pt-PT page marks it; nothing on an English page. */
export function englishLang(language: SiteLanguage, key: string): 'en' | undefined {
  if (language === 'en') return undefined;
  let node: unknown = portuguese;
  for (const part of key.split('.')) node = isNode(node) ? node[part] : undefined;
  return node === undefined ? 'en' : undefined;
}

/** The language a site page renders in; `renderSitePage` provides it. */
export const SiteLanguageContext = createContext<SiteLanguage>('en');

export function useSiteLanguage(): SiteLanguage {
  return useContext(SiteLanguageContext);
}

export function useSiteTranslator<N extends keyof Messages>(namespace: N) {
  return siteTranslator(namespace, useSiteLanguage());
}
