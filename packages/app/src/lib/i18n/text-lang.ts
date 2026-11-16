import type { ContentLanguage } from '@proofofcalm/content';

/**
 * The `lang` of an element that renders content text (WCAG 2.2 SC 3.1.2, ADR-0057): the content's language where
 * it differs from the UI's, as an English country card in a pt-PT screen; undefined where they match, and where the
 * content's language is unknown (`contentLanguageOf` of an object no loader returned), so the page's stands.
 */
export function textLang(content: ContentLanguage | undefined, ui: string): ContentLanguage | undefined {
  return content === undefined || content === ui ? undefined : content;
}

/**
 * The `lang` of the app's own lines that a Learn module's English body renders, its chart and its past-performance
 * line: the UI's language where the UI is not English, so they leave the body's `lang="en"`; nothing on an English
 * screen, which marks no `lang` at all.
 */
export function uiLang(ui: string): string | undefined {
  return ui === 'en' ? undefined : ui;
}
