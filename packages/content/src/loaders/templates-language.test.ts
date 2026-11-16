import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CONTENT_LANGUAGES, TRANSLATABLE } from '../i18n/overlay.ts';
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
  });

  it('answers the English texts in English and in a language without a translation', async () => {
    expect(await loadTemplateTexts()).toEqual(englishTexts);
    expect(await loadTemplateTexts('de')).toEqual(englishTexts);
  });

  it('lays each pt-PT file over its English template, the four translatable fields and nothing else', async () => {
    const texts = await loadTemplateTexts('pt-PT');
    expect([...texts.keys()]).toEqual(TEMPLATES.map(({ id }) => id));
    for (const templateId of overlayIds('pt-PT')) {
      const file = overlayFile('pt-PT', templateId);
      expect(Object.keys(file).every((field) => TRANSLATABLE.template.includes(field)), templateId).toBe(true);
      expect(texts.get(templateId), templateId).toEqual({ ...englishTexts.get(templateId), ...file });
    }
  });

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
    // In a build, Vite's wrapper resolves a failed import to undefined once a `vite:preloadError` listener prevents
    // its default (the web host's chunk reload, apps/web/src/chunk-reload.ts; #285).
    const loader = await fresh();
    loader.TEMPLATE_OVERLAYS['pt-PT']['two-coins'] = () => Promise.resolve(undefined as unknown as { default: unknown });
    expect((await loader.loadTemplateTexts('pt-PT')).get('two-coins')).toEqual(englishTexts.get('two-coins'));
    loader.TEMPLATE_OVERLAYS['pt-PT']['two-coins'] = async () => ({ default: { name: 'Duas moedas' } });
    expect((await loader.loadTemplateTexts('pt-PT')).get('two-coins')?.name).toBe('Duas moedas');
  });

  it('answers English when a translation’s chunk fails to load (offline before it was fetched)', async () => {
    const loader = await fresh();
    loader.TEMPLATE_OVERLAYS['pt-PT']['cycle-plan'] = () =>
      Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
    expect((await loader.loadTemplateTexts('pt-PT')).get('cycle-plan')).toEqual(englishTexts.get('cycle-plan'));
  });
});
