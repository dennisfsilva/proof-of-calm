import type { UiLanguage } from '@proofofcalm/app/lib/i18n';
import { createContext, useContext } from 'react';
import { createTranslator } from 'use-intl/core';
import german from '../messages/de.json';
import messages from '../messages/en.json';
import portuguese from '../messages/pt-PT.json';

// The site pages' messages: English, and pt-PT and German for the pages that are not public (ADR-0045, the Deviations
// of 2026-11-18 and 2026-11-25). Each translation leaves the four legal pages' own objects in English, so a key it
// lacks falls back to English and the page marks that text `lang="en"` (docs/CONTENT-STYLE.md §9).

/** Every UI language has a site file: one without fails the typecheck here. */
export type SiteLanguage = UiLanguage;

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

const TRANSLATIONS: Record<Exclude<SiteLanguage, 'en'>, Node> = { 'pt-PT': portuguese, de: german };

const CATALOGUES: Record<SiteLanguage, Messages> = {
  en: messages,
  'pt-PT': over(messages, TRANSLATIONS['pt-PT']) as Messages,
  de: over(messages, TRANSLATIONS.de) as Messages,
};

export function siteTranslator<N extends keyof Messages>(namespace: N, language: SiteLanguage = 'en') {
  return createTranslator({ locale: language, messages: CATALOGUES[language], namespace });
}

/** `lang="en"` for a key the language's own file leaves in English, so its page marks it; nothing on an English page. */
export function englishLang(language: SiteLanguage, key: string): 'en' | undefined {
  if (language === 'en') return undefined;
  let node: unknown = TRANSLATIONS[language];
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
