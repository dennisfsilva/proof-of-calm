import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT_LANGUAGES, TRANSLATABLE } from '../i18n/overlay.ts';
import { contentLanguageOf } from './language.ts';
import { loadTemplateTexts, TEMPLATE_OVERLAYS, TEMPLATES } from './templates.ts';

// The templates' texts in a content language (ADR-0057): the four fields TRANSLATABLE names, per template id, from
// the overlay under i18n/<language>/templates, English where none loads.

const I18N = fileURLToPath(new URL('../../i18n/', import.meta.url));
const overlayIds = (language: string) => {
  const folder = join(I18N, language, 'templates');
  return existsSync(folder)
    ? readdirSync(folder)
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
        .sort()
    : [];
};
const overlayFile = (language: string, templateId: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(I18N, language, 'templates', `${templateId}.json`), 'utf8'));
const englishTexts = new Map(
  TEMPLATES.map(({ id, name, oneLine, riskLabel, explanation }) => [id, { name, oneLine, riskLabel, explanation }]),
);
const TEMPLATE_IDS = TEMPLATES.map(({ id }) => id).sort();
const fresh = async () => {
  vi.resetModules();
  return import('./templates.ts');
};

describe('loadTemplateTexts in a content language (ADR-0057)', () => {
  it('holds TEMPLATE_OVERLAYS to the files under i18n/<language>/templates, one record per overlay language', () => {
    expect(Object.keys(TEMPLATE_OVERLAYS).sort()).toEqual(CONTENT_LANGUAGES.filter((code) => code !== 'en').sort());
    for (const [language, overlays] of Object.entries(TEMPLATE_OVERLAYS)) {
      expect(Object.keys(overlays).sort(), language).toEqual(overlayIds(language));
    }
    // Both translations cover all four templates, so no template step falls back to English but on a failed chunk.
    for (const language of ['pt-PT', 'de']) expect(overlayIds(language), language).toEqual(TEMPLATE_IDS);
  });

  it('answers the English texts in English and in a language without a translation', async () => {
    expect(await loadTemplateTexts()).toEqual(englishTexts);
    const loader = await fresh();
    for (const templateId of TEMPLATE_IDS) delete loader.TEMPLATE_OVERLAYS.de[templateId as 'two-coins'];
    expect(await loader.loadTemplateTexts('de')).toEqual(englishTexts);
  });

  it.each(['pt-PT', 'de'] as const)(
    'lays each %s file over its English template, the four fields and nothing else',
    async (language) => {
      const texts = await loadTemplateTexts(language);
      expect([...texts.keys()]).toEqual(TEMPLATES.map(({ id }) => id));
      for (const templateId of overlayIds(language)) {
        const file = overlayFile(language, templateId);
        expect(Object.keys(file).sort(), templateId).toEqual([...TRANSLATABLE.template].sort());
        expect(texts.get(templateId), templateId).toEqual({ ...englishTexts.get(templateId), ...file });
        for (const field of TRANSLATABLE.template) {
          expect(file[field], `${templateId}.${field}`).not.toBe(englishTexts.get(templateId)?.[field as 'name']);
        }
      }
    },
  );

  // The lint reads a template text whole (validate.ts), so no German line is cut where a module's would be (#451): a
  // de text holds no null item and no line break but the blank line between the explanation's paragraphs, as English.
  it.each(TEMPLATE_IDS)(
    'keeps the de overlay of %s to strings, with English’s paragraphs and no other line break',
    (templateId) => {
      const file = overlayFile('de', templateId);
      const english = englishTexts.get(templateId);
      for (const [field, text] of Object.entries(file)) {
        expect(typeof text, `${templateId}.${field}`).toBe('string');
        const paragraphs = String(text).split('\n\n');
        expect(
          paragraphs.some((paragraph) => paragraph.includes('\n') || paragraph.trim() !== paragraph),
          field,
        ).toBe(false);
        const own = String(english?.[field as 'name'] ?? '').split('\n\n').length;
        expect(paragraphs.length, `${templateId}.${field}`).toBe(own);
      }
    },
  );

  it('takes only the four texts from an overlay, whatever else it holds', async () => {
    const loader = await fresh();
    loader.TEMPLATE_OVERLAYS['pt-PT']['two-coins'] = async () => ({
      default: { name: 'Duas moedas', id: 'other', split: { BTC: '100' }, coins: [] },
    });
    const texts = await loader.loadTemplateTexts('pt-PT');
    expect(texts.get('two-coins')).toEqual({ ...englishTexts.get('two-coins'), name: 'Duas moedas' });
    expect(Object.keys(texts.get('two-coins') ?? {})).toEqual(['name', 'oneLine', 'riskLabel', 'explanation']);
    expect(loader.templateById('two-coins')?.name).toBe('Two coins, no sell window');
  });

  it('answers English when the import resolves without the file, as the preload wrapper does, and retries', async () => {
    // In the web host a failed import rejects (apps/web/src/chunk-reload.ts leaves `vite:preloadError`'s default;
    // #308). Vite's wrapper resolves it to undefined only under a listener that prevents it, so this guard stays.
    const loader = await fresh();
    loader.TEMPLATE_OVERLAYS['pt-PT']['two-coins'] = () =>
      Promise.resolve(undefined as unknown as { default: unknown });
    expect((await loader.loadTemplateTexts('pt-PT')).get('two-coins')).toEqual(englishTexts.get('two-coins'));
    loader.TEMPLATE_OVERLAYS['pt-PT']['two-coins'] = async () => ({ default: { name: 'Duas moedas' } });
    expect((await loader.loadTemplateTexts('pt-PT')).get('two-coins')?.name).toBe('Duas moedas');
  });

  it('answers English when a translation’s chunk fails to load (offline before it was fetched)', async () => {
    const loader = await fresh();
    loader.TEMPLATE_OVERLAYS['pt-PT']['cycle-plan'] = () =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
    expect((await loader.loadTemplateTexts('pt-PT')).get('cycle-plan')).toEqual(englishTexts.get('cycle-plan'));
    const { contentLanguageOf: languageOf } = await import('./language.ts');
    const texts = (await loader.loadTemplateTexts('pt-PT')).get('cycle-plan');
    expect(texts === undefined ? null : languageOf(texts)).toBe('en');
  });

  it('answers English in de when a chunk fails, keeps nothing, and gives German marked de on the next load', async () => {
    const loader = await fresh();
    const { contentLanguageOf: languageOf } = await import('./language.ts');
    const chunk = loader.TEMPLATE_OVERLAYS.de['cycle-plan'];
    expect(chunk).toBeDefined();
    loader.TEMPLATE_OVERLAYS.de['cycle-plan'] = () =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
    const failed = (await loader.loadTemplateTexts('de')).get('cycle-plan');
    expect(failed).toEqual(englishTexts.get('cycle-plan'));
    expect(failed === undefined ? null : languageOf(failed)).toBe('en');
    if (chunk !== undefined) loader.TEMPLATE_OVERLAYS.de['cycle-plan'] = chunk;
    const retried = (await loader.loadTemplateTexts('de')).get('cycle-plan');
    expect(retried).toEqual({ ...englishTexts.get('cycle-plan'), ...overlayFile('de', 'cycle-plan') });
    expect(retried === undefined ? null : languageOf(retried)).toBe('de');
  });

  it.each(['pt-PT', 'de'] as const)(
    'gives each %s texts object its language, and nothing to a copy (ADR-0057)',
    async (language) => {
      const translated = await loadTemplateTexts(language);
      const english = await loadTemplateTexts('en');
      for (const { id } of TEMPLATES) {
        const each = translated.get(id);
        expect(each === undefined ? null : contentLanguageOf(each)).toBe(language);
        const own = english.get(id);
        expect(own === undefined ? null : contentLanguageOf(own)).toBe('en');
        expect(contentLanguageOf({ ...each })).toBeUndefined();
      }
    },
  );
});
