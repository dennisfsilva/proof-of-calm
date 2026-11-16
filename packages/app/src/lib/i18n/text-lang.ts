import type { ContentLanguage } from '@proofofcalm/content';

/**
 * The `lang` of an element that renders content text (WCAG 2.2 SC 3.1.2, ADR-0057): the content's language where
 * it differs from the UI's, as an English country card in a pt-PT screen; undefined where they match, and where the
 * content's language is unknown (`contentLanguageOf` of an object no loader returned), so the page's stands.
 */
export function textLang(content: ContentLanguage | undefined, ui: string): ContentLanguage | undefined {
  return content === undefined || content === ui ? undefined : content;
}
